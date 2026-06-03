import { parseServerFrame } from "@/lib/chat-parser"
import type { ChzzkServerFrame } from "@/lib/chzzk"
import { serverFetchChatChannelId } from "@/lib/chzzk-server"
import {
  buildChatWsUrl,
  buildSubscribeMessage,
  handleChzzkWsControl,
  pickChatServerHost,
} from "@/lib/chzzk-ws"
import {
  appendMessages,
  closeSession,
  ensureRotationTicker,
  getSessionInfo,
  openSession,
  type SessionInfo,
} from "@/server/log-store"

const RECONNECT_DELAY_MS = 5_000
const FLUSH_INTERVAL_MS = 250
const FLUSH_MAX_LINES = 100
function buildWsHeaders(cookie?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    Origin: "https://chzzk.naver.com",
  }
  if (cookie) headers.Cookie = cookie
  return headers
}

/** Node 22+ undici WebSocket supports `headers`; DOM typings do not. */
const NodeWebSocket = WebSocket as typeof WebSocket & {
  new (url: string, init?: { headers?: Record<string, string> }): WebSocket
}

function createChzzkWebSocket(url: string, cookie?: string): WebSocket {
  return new NodeWebSocket(url, { headers: buildWsHeaders(cookie) })
}

export type CollectorStatus =
  | "starting"
  | "connected"
  | "reconnecting"
  | "stopped"
  | "error"

export interface StartCollectorOptions {
  channelId: string
  pathTemplate: string
  autoRotate?: boolean
  /** Pre-built `Cookie` header for CHZZK HTTP / WebSocket. */
  cookieHeader?: string
}

export interface CollectorInfo {
  collectorId: string
  channelId: string
  chatChannelId: string
  sessionId: string
  pathTemplate: string
  autoRotate: boolean
  status: CollectorStatus
  error: string | null
  serverHost: string | null
  startedAt: number
  session: SessionInfo | null
}

interface CollectorState {
  info: CollectorInfo
  cookieHeader?: string
  abort: AbortController
  lineBuffer: string[]
  flushTimer: ReturnType<typeof setInterval> | null
  flushChain: Promise<void>
}

const collectors = new Map<string, CollectorState>()

/** @internal Exposed for test scripts. */
export const __test_collectors = collectors

function newCollectorId(): string {
  return "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("aborted", "AbortError"))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException("aborted", "AbortError"))
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

function syncSessionInfo(state: CollectorState): void {
  const session = getSessionInfo(state.info.sessionId)
  state.info.session = session
}

async function flushLines(state: CollectorState): Promise<void> {
  if (state.lineBuffer.length === 0) return
  const lines = state.lineBuffer
  state.lineBuffer = []
  try {
    await appendMessages(state.info.sessionId, lines)
    syncSessionInfo(state)
  } catch (e) {
    state.info.status = "error"
    state.info.error =
      e instanceof Error ? e.message : "append to log session failed"
    state.abort.abort()
  }
}

function scheduleFlush(state: CollectorState): void {
  state.flushChain = state.flushChain
    .then(() => flushLines(state))
    .catch(() => {
      /* errors handled in flushLines */
    })
}

function setCollectorStatus(
  state: CollectorState,
  status: CollectorStatus,
  error: string | null = null
): void {
  state.info.status = status
  state.info.error = error
}

async function runCollectorLoop(state: CollectorState): Promise<void> {
  const { signal } = state.abort
  const chatChannelId = state.info.chatChannelId

  while (!signal.aborted) {
    setCollectorStatus(state, "starting")
    const host = pickChatServerHost()
    state.info.serverHost = host
    const url = buildChatWsUrl(host)

    let ws: WebSocket
    try {
      ws = createChzzkWebSocket(url, state.cookieHeader)
    } catch (e) {
      if (signal.aborted) return
      setCollectorStatus(
        state,
        "reconnecting",
        e instanceof Error ? e.message : String(e)
      )
      try {
        await delay(RECONNECT_DELAY_MS, signal)
      } catch {
        return
      }
      continue
    }

    try {
      await new Promise<void>((resolve, reject) => {
        ws.addEventListener("open", () => resolve(), { once: true })
        ws.addEventListener(
          "error",
          () => reject(new Error("웹소켓 연결 오류")),
          { once: true }
        )
        ws.addEventListener(
          "close",
          () => reject(new Error("웹소켓 연결 종료")),
          { once: true }
        )
      })
      if (signal.aborted) {
        ws.close()
        return
      }
      ws.send(buildSubscribeMessage(chatChannelId))
      setCollectorStatus(state, "connected", null)
    } catch (e) {
      if (signal.aborted) return
      setCollectorStatus(
        state,
        "reconnecting",
        e instanceof Error ? e.message : String(e)
      )
      try {
        await delay(RECONNECT_DELAY_MS, signal)
      } catch {
        return
      }
      continue
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          signal.removeEventListener("abort", onAbort)
          try {
            ws.close()
          } catch {
            /* ignore */
          }
          reject(new DOMException("aborted", "AbortError"))
        }
        signal.addEventListener("abort", onAbort, { once: true })

        ws.addEventListener("message", (event) => {
          if (signal.aborted) return
          let frame: ChzzkServerFrame
          try {
            frame = JSON.parse(String(event.data)) as ChzzkServerFrame
          } catch {
            return
          }
          if (handleChzzkWsControl(ws, frame) !== "none") return
          const parsed = parseServerFrame(frame)
          if (parsed.length === 0) return
          for (const m of parsed) state.lineBuffer.push(m.formatted)
          if (state.lineBuffer.length >= FLUSH_MAX_LINES) scheduleFlush(state)
        })

        ws.addEventListener("close", () => {
          signal.removeEventListener("abort", onAbort)
          resolve()
        })
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return
      throw e
    }

    if (signal.aborted) return
    setCollectorStatus(state, "reconnecting", null)
    try {
      await delay(RECONNECT_DELAY_MS, signal)
    } catch {
      return
    }
  }
}

export function findActiveCollectorByChannel(
  channelId: string
): CollectorInfo | null {
  const trimmed = channelId.trim()
  for (const state of collectors.values()) {
    if (state.info.channelId === trimmed && state.info.status !== "stopped") {
      syncSessionInfo(state)
      return { ...state.info }
    }
  }
  return null
}

export async function startCollector(
  options: StartCollectorOptions
): Promise<CollectorInfo> {
  const channelId = options.channelId.trim()
  const pathTemplate = options.pathTemplate.trim()
  if (!channelId) throw new Error("channelId is required")
  if (!pathTemplate) throw new Error("pathTemplate is required")

  const existing = findActiveCollectorByChannel(channelId)
  if (existing) return existing

  ensureRotationTicker()
  const cookieHeader = options.cookieHeader?.trim() || undefined
  const chatChannelId = await serverFetchChatChannelId(channelId, cookieHeader)
  const session = await openSession({
    channelId,
    chatChannelId,
    pathTemplate,
    autoRotate: options.autoRotate !== false,
  })

  const collectorId = newCollectorId()
  const abort = new AbortController()
  const info: CollectorInfo = {
    collectorId,
    channelId,
    chatChannelId,
    sessionId: session.sessionId,
    pathTemplate,
    autoRotate: options.autoRotate !== false,
    status: "starting",
    error: null,
    serverHost: null,
    startedAt: Date.now(),
    session,
  }

  const state: CollectorState = {
    info,
    cookieHeader,
    abort,
    lineBuffer: [],
    flushTimer: setInterval(() => {
      if (state.lineBuffer.length > 0) scheduleFlush(state)
    }, FLUSH_INTERVAL_MS),
    flushChain: Promise.resolve(),
  }
  if (typeof state.flushTimer === "object" && state.flushTimer !== null) {
    ;(state.flushTimer as { unref?: () => void }).unref?.()
  }
  collectors.set(collectorId, state)

  void runCollectorLoop(state).catch((e) => {
    if (abort.signal.aborted) return
    setCollectorStatus(
      state,
      "error",
      e instanceof Error ? e.message : String(e)
    )
  })

  return { ...info }
}

export async function stopCollector(
  collectorId: string
): Promise<{ stopped: true } | { stopped: false; reason: string }> {
  const state = collectors.get(collectorId)
  if (!state) return { stopped: false, reason: "unknown collector" }

  state.abort.abort()
  if (state.flushTimer) clearInterval(state.flushTimer)
  state.flushTimer = null

  await state.flushChain
  if (state.lineBuffer.length > 0) await flushLines(state)

  const closeResult = await closeSession(state.info.sessionId)
  collectors.delete(collectorId)
  setCollectorStatus(state, "stopped", null)
  state.info.session = null

  if (!closeResult.closed) {
    return { stopped: false, reason: closeResult.reason }
  }
  return { stopped: true }
}

export function getCollectorInfo(collectorId: string): CollectorInfo | null {
  const state = collectors.get(collectorId)
  if (!state) return null
  syncSessionInfo(state)
  return { ...state.info }
}

export function listCollectors(): CollectorInfo[] {
  return Array.from(collectors.values()).map((s) => {
    syncSessionInfo(s)
    return { ...s.info }
  })
}
