import { useCallback, useEffect, useRef, useState } from "react"
import type {
  ChzzkLiveContext,
  ChzzkServerFrame,
  ConnectionStatus,
  ParsedChatMessage,
} from "@/lib/chzzk"
import { parseServerFrame } from "@/lib/chat-parser"
import { fetchChatChannelId, fetchLiveContext } from "@/lib/chzzk-context"
import {
  buildChatWsUrl,
  buildRecentMessagesRequest,
  buildSubscribeMessage,
  handleChzzkWsControl,
  pickChatServerHost,
} from "@/lib/chzzk-ws"
import {
  clearBackgroundCollectorStorage,
  createBackgroundCollectClient,
  fetchCollectorStatus,
  openBackgroundCollectClient,
  readBackgroundCollector,
  stopBackgroundCollector,
  type BackgroundCollectClient,
} from "@/lib/server-collect"
import { openServerLogClient, type ServerLogClient } from "@/lib/server-log"

const RECONNECT_DELAY_MS = 5_000
const WS_CLOSE_TIMEOUT_MS = 1_500
const LIVE_CONTEXT_REFRESH_MS = 30 * 1000
const VIEW_STOPPED_STORAGE_KEY = "chzzk-view-stopped"
const VIEW_AUTOSTART_STORAGE_KEY = "chzzk-view-autostarted"
const VIEWER_RECENT_MESSAGE_COUNT = 50

class AbortError extends Error {
  constructor() {
    super("aborted")
    this.name = "AbortError"
  }
}

function isViewStoppedInStorage(): boolean {
  try {
    return sessionStorage.getItem(VIEW_STOPPED_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function persistViewStopped(): void {
  try {
    sessionStorage.setItem(VIEW_STOPPED_STORAGE_KEY, "1")
  } catch {
    /* ignore */
  }
}

function clearViewStoppedStorage(): void {
  try {
    sessionStorage.removeItem(VIEW_STOPPED_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError())
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new AbortError())
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export interface ServerLogConfig {
  /** Path template. Must include `{date}` (and may include `{channel}`). */
  pathTemplate: string
  /** When true, the server rotates the file at midnight. Defaults to true. */
  autoRotate?: boolean
  /**
   * When true (default), the server connects to CHZZK and writes logs in the
   * background without relaying each message from the browser.
   */
  background?: boolean
}

export interface UseChzzkChatOptions {
  /** When provided, automatically starts the connection. */
  channelId?: string
  /** Optional server-side file backup configuration. */
  serverLog?: ServerLogConfig | null
}

export interface ServerLogState {
  sessionId: string
  resolvedPath: string
  bytesWritten: number
  messagesWritten: number
  baseDir: string
  /** Present while a detached server-side collector is still running. */
  collectorId?: string
  channelId?: string
  collectorStatus?: string
}

export interface UseChzzkChatResult {
  status: ConnectionStatus
  error: string | null
  messages: ParsedChatMessage[]
  chatChannelId: string | null
  liveContext: ChzzkLiveContext | null
  /** Hostname of the currently selected chat gateway (e.g. "kr-ss3.chat.naver.com"). */
  serverHost: string | null
  serverLog: ServerLogState | null
  /** True when a server-side collector is running (may outlive the browser WS). */
  backgroundCollectActive: boolean
  start: (channelId: string) => Promise<void>
  /** Stops the browser live view only; does not stop a background collector. */
  stop: () => void
  /** Stops the server-side background collector and closes the log file. */
  stopBackgroundCollect: () => Promise<void>
  clear: () => void
}

export function useChzzkChat(
  options: UseChzzkChatOptions = {}
): UseChzzkChatResult {
  const [status, setStatus] = useState<ConnectionStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ParsedChatMessage[]>([])
  const [chatChannelId, setChatChannelId] = useState<string | null>(null)
  const [liveContext, setLiveContext] = useState<ChzzkLiveContext | null>(null)
  const [serverHost, setServerHost] = useState<string | null>(null)
  const [serverLog, setServerLog] = useState<ServerLogState | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const serverLogRef = useRef<ServerLogClient | null>(null)
  const backgroundCollectRef = useRef<BackgroundCollectClient | null>(null)
  /**
   * One controller per `start()` call. `stop()` aborts it, which causes
   * every `await` in the connection loop to reject with `AbortError` and
   * the loop to exit deterministically.
   */
  const abortRef = useRef<AbortController | null>(null)
  /** True iff the user explicitly stopped (or we have no active session). */
  const stoppedRef = useRef(true)
  /** Monotonic id; bump on stop/start so stale connection loops cannot touch UI. */
  const viewSessionRef = useRef(0)
  const activeChannelRef = useRef<string | null>(null)

  const isViewActive = useCallback(
    (session: number, signal?: AbortSignal) =>
      viewSessionRef.current === session &&
      !stoppedRef.current &&
      !(signal?.aborted ?? false),
    []
  )

  const applyCollectorToState = useCallback(
    (
      body: Awaited<ReturnType<typeof fetchCollectorStatus>>,
      client: BackgroundCollectClient | null
    ) => {
      if (!body?.collector.session) return
      const session = body.collector.session
      setServerLog({
        sessionId: session.sessionId,
        resolvedPath: session.resolvedPath,
        bytesWritten: session.bytesWritten,
        messagesWritten: session.messagesWritten,
        baseDir: body.baseDir,
        collectorId: body.collector.collectorId,
        channelId: body.collector.channelId,
        collectorStatus: body.collector.status,
      })
      if (client) backgroundCollectRef.current = client
    },
    []
  )

  const closeClientPushLog = useCallback(async () => {
    const client = serverLogRef.current
    serverLogRef.current = null
    if (!client) return
    try {
      await client.close()
    } catch (e) {
      console.warn("[server-log] close failed:", e)
    }
    setServerLog((prev) => (prev?.collectorId ? prev : null))
  }, [])

  const stopBackgroundCollectFn = useCallback(async () => {
    const id =
      backgroundCollectRef.current?.collectorId ?? serverLog?.collectorId
    backgroundCollectRef.current = null
    if (id) await stopBackgroundCollector(id)
    setServerLog(null)
  }, [serverLog?.collectorId])

  const teardown = useCallback(() => {
    const ws = wsRef.current
    if (!ws) return
    wsRef.current = null
    try {
      ws.close()
    } catch {
      /* ignore */
    }
    // If the WS does not fire onclose within a short window (e.g. the
    // network is wedged), resolve anyway so the abort path does not
    // appear stuck. We do not await this here — the loop already races
    // the close against this timeout via its own onAbort handler.
    setTimeout(() => {
      if (ws.readyState !== WebSocket.CLOSED) {
        // Force-close by reassigning handlers; nothing else reads them.
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
      }
    }, WS_CLOSE_TIMEOUT_MS)
  }, [])

  const stop = useCallback(() => {
    viewSessionRef.current += 1
    stoppedRef.current = true
    persistViewStopped()
    activeChannelRef.current = null
    const controller = abortRef.current
    abortRef.current = null
    if (controller) {
      controller.abort(new AbortError())
    }
    teardown()
    setChatChannelId(null)
    setLiveContext(null)
    setServerHost(null)
    backgroundCollectRef.current = null
    void closeClientPushLog()
    setStatus("disconnected")
  }, [closeClientPushLog, teardown])

  const runConnection = useCallback(
    async (chatId: string, signal: AbortSignal, session: number) => {
      const setViewStatus = (next: ConnectionStatus) => {
        if (isViewActive(session, signal)) setStatus(next)
      }

      while (isViewActive(session, signal)) {
        setViewStatus("connecting")
        const host = pickChatServerHost()
        if (isViewActive(session, signal)) setServerHost(host)
        const url = buildChatWsUrl(host)

        let ws: WebSocket
        try {
          ws = new WebSocket(url)
        } catch (e) {
          if (!isViewActive(session, signal)) return
          setError(e instanceof Error ? e.message : String(e))
          setViewStatus("reconnecting")
          try {
            await delay(RECONNECT_DELAY_MS, signal)
          } catch {
            return
          }
          continue
        }

        if (!isViewActive(session, signal)) {
          try {
            ws.close()
          } catch {
            /* ignore */
          }
          return
        }

        wsRef.current = ws
        let chatSid: string | null = null

        const connectedPromise = new Promise<void>((resolve, reject) => {
          ws.onopen = () => resolve()
          ws.onerror = () => reject(new Error("웹소켓 연결 오류"))
          ws.onclose = () => {
            if (!isViewActive(session, signal)) {
              reject(new AbortError())
            } else {
              reject(new Error("웹소켓 연결 종료"))
            }
          }
        })

        try {
          await connectedPromise
          if (!isViewActive(session, signal)) {
            try {
              ws.close()
            } catch {
              /* ignore */
            }
            return
          }
          ws.send(buildSubscribeMessage(chatId))
          setViewStatus("connected")
          setError(null)
        } catch (e) {
          if (!isViewActive(session, signal)) return
          if (e instanceof AbortError) return
          setError(e instanceof Error ? e.message : String(e))
          setViewStatus("reconnecting")
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
              reject(new AbortError())
            }
            signal.addEventListener("abort", onAbort, { once: true })

            ws.onmessage = (event) => {
              if (!isViewActive(session, signal)) return
              let frame: ChzzkServerFrame
              try {
                frame = JSON.parse(event.data as string)
              } catch {
                return
              }
              const control = handleChzzkWsControl(ws, frame, (sid) => {
                if (chatSid) return
                chatSid = sid
                try {
                  ws.send(
                    buildRecentMessagesRequest(
                      chatId,
                      sid,
                      VIEWER_RECENT_MESSAGE_COUNT
                    )
                  )
                } catch {
                  /* ignore */
                }
              })
              if (control !== "none") return
              const parsed = parseServerFrame(frame)
              if (parsed.length === 0) return
              const client = serverLogRef.current
              if (client && !backgroundCollectRef.current) {
                for (const m of parsed) client.push(m.formatted)
              }
              setMessages((prev) => {
                const next = prev.concat(parsed)
                return next.length > 5_000 ? next.slice(-5_000) : next
              })
            }

            ws.onerror = () => {
              /* errors are reported via close */
            }

            const onClose = () => {
              signal.removeEventListener("abort", onAbort)
              if (!isViewActive(session, signal)) {
                reject(new AbortError())
              } else {
                resolve()
              }
            }
            ws.onclose = onClose
          })
        } catch (e) {
          if (e instanceof AbortError) return
          if (!isViewActive(session, signal)) return
          throw e
        }

        wsRef.current = null
        if (!isViewActive(session, signal)) return

        setViewStatus("reconnecting")
        setError(null)
        try {
          await delay(RECONNECT_DELAY_MS, signal)
        } catch {
          return
        }
      }
    },
    [isViewActive]
  )

  const start = useCallback(
    async (channelId: string) => {
      const trimmed = channelId.trim()
      if (!trimmed) {
        setError("채널 ID를 입력하세요.")
        return
      }

      // Abort any previous session synchronously, so the old loop exits
      // and any subsequent await sees the new controller.
      const previousController = abortRef.current
      const session = ++viewSessionRef.current
      if (previousController) {
        previousController.abort(new AbortError())
      }
      const controller = new AbortController()
      abortRef.current = controller
      stoppedRef.current = false
      clearViewStoppedStorage()
      try {
        sessionStorage.setItem(VIEW_AUTOSTART_STORAGE_KEY, trimmed)
      } catch {
        /* ignore */
      }
      activeChannelRef.current = trimmed
      setMessages([])
      setError(null)
      setStatus("resolving")

      // Only close the previous server log AFTER a new one is ready (or
      // this start fails). This avoids losing tail-end writes from a
      // previous session when the user reconnects to a different channel.
      const previousLog = serverLogRef.current
      const previousBg = backgroundCollectRef.current
      serverLogRef.current = null
      backgroundCollectRef.current = null
      const useBackgroundLog =
        options.serverLog && options.serverLog.background !== false
      if (!useBackgroundLog) {
        setServerLog(null)
      }

      try {
        const chatId = await fetchChatChannelId(trimmed)
        if (!isViewActive(session, controller.signal)) return
        setChatChannelId(chatId)

        const context = await fetchLiveContext(trimmed, chatId)
        if (!isViewActive(session, controller.signal)) return
        setLiveContext(context)

        const cfg = options.serverLog
        if (cfg && cfg.pathTemplate.trim()) {
          const useBackground = cfg.background !== false
          try {
            if (useBackground) {
              const bg = await openBackgroundCollectClient({
                channelId: trimmed,
                pathTemplate: cfg.pathTemplate,
                autoRotate: cfg.autoRotate !== false,
              })
              if (!isViewActive(session, controller.signal)) {
                await bg.close()
                return
              }
              backgroundCollectRef.current = bg
              const info = bg.info()
              const logSession = info?.session
              if (logSession && info) {
                setServerLog({
                  sessionId: logSession.sessionId,
                  resolvedPath: logSession.resolvedPath,
                  bytesWritten: logSession.bytesWritten,
                  messagesWritten: logSession.messagesWritten,
                  baseDir: bg.baseDir(),
                  collectorId: info.collectorId,
                  channelId: info.channelId,
                  collectorStatus: info.status,
                })
              }
            } else {
              const client = await openServerLogClient({
                channelId: trimmed,
                chatChannelId: chatId,
                pathTemplate: cfg.pathTemplate,
                autoRotate: cfg.autoRotate !== false,
              })
              if (!isViewActive(session, controller.signal)) {
                await client.close()
                return
              }
              serverLogRef.current = client
              const info = client.info()
              if (info) {
                setServerLog({
                  sessionId: info.sessionId,
                  resolvedPath: info.resolvedPath,
                  bytesWritten: info.bytesWritten,
                  messagesWritten: info.messagesWritten,
                  baseDir: client.baseDir(),
                })
              }
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            setError(`서버 로그 시작 실패: ${message}`)
          }
        }

        if (previousLog) {
          void previousLog.close().catch(() => undefined)
        }
        if (previousBg) {
          const prevChannel = previousBg.info()?.channelId
          if (prevChannel && prevChannel !== trimmed) {
            void previousBg.close().catch(() => undefined)
          }
        }

        if (!isViewActive(session, controller.signal)) return
        await runConnection(chatId, controller.signal, session)
      } catch (e) {
        if (e instanceof AbortError) return
        if (!isViewActive(session, controller.signal)) return
        const message = e instanceof Error ? e.message : String(e)
        setError(message)
        setStatus("error")
        stoppedRef.current = true
      } finally {
        if (previousLog) {
          void previousLog.close().catch(() => undefined)
        }
      }
    },
    [options.serverLog, runConnection, isViewActive]
  )

  useEffect(() => {
    const collectorId =
      backgroundCollectRef.current?.collectorId ?? serverLog?.collectorId
    if (!collectorId || !serverLog) return
    const poll = async () => {
      const body = await fetchCollectorStatus({ collectorId })
      if (!body) {
        clearBackgroundCollectorStorage()
        backgroundCollectRef.current = null
        setServerLog(null)
        return
      }
      if (!body.collector.session) return
      const session = body.collector.session
      setServerLog((prev) =>
        prev
          ? {
              ...prev,
              resolvedPath: session.resolvedPath,
              bytesWritten: session.bytesWritten,
              messagesWritten: session.messagesWritten,
              collectorStatus: body.collector.status,
            }
          : prev
      )
    }
    const id = setInterval(() => void poll(), 3_000)
    return () => clearInterval(id)
  }, [serverLog?.collectorId, serverLog?.sessionId])

  useEffect(() => {
    void (async () => {
      const saved = readBackgroundCollector()
      if (!saved) return
      const body =
        (await fetchCollectorStatus({ collectorId: saved.collectorId })) ??
        (await fetchCollectorStatus({ channelId: saved.channelId }))
      if (!body || body.collector.status === "stopped") {
        clearBackgroundCollectorStorage()
        return
      }
      applyCollectorToState(body, createBackgroundCollectClient(body))
    })()
  }, [applyCollectorToState])

  const clear = useCallback(() => {
    setMessages([])
  }, [])

  const refreshLiveContext = useCallback(async () => {
    const channelId = activeChannelRef.current ?? liveContext?.channelId
    if (!channelId || !chatChannelId) return
    try {
      const context = await fetchLiveContext(channelId, chatChannelId)
      setLiveContext(context)
    } catch {
      /* keep existing context on transient API errors */
    }
  }, [chatChannelId, liveContext?.channelId])

  useEffect(() => {
    if (!liveContext?.channelId || !chatChannelId) return
    const id = setInterval(() => {
      void refreshLiveContext()
    }, LIVE_CONTEXT_REFRESH_MS)
    return () => clearInterval(id)
  }, [liveContext?.channelId, chatChannelId, refreshLiveContext])

  useEffect(() => {
    const initialChannelId = options.channelId
    if (!initialChannelId || isViewStoppedInStorage()) return
    try {
      if (
        sessionStorage.getItem(VIEW_AUTOSTART_STORAGE_KEY) === initialChannelId
      ) {
        return
      }
      sessionStorage.setItem(VIEW_AUTOSTART_STORAGE_KEY, initialChannelId)
    } catch {
      /* ignore */
    }
    void start(initialChannelId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.channelId])

  useEffect(() => {
    return () => {
      const controller = abortRef.current
      if (controller) controller.abort(new AbortError())
      teardown()
      backgroundCollectRef.current = null
      void closeClientPushLog()
    }
  }, [teardown, closeClientPushLog])

  const backgroundCollectActive = Boolean(
    serverLog?.collectorId && serverLog.collectorStatus !== "stopped"
  )

  return {
    status,
    error,
    messages,
    chatChannelId,
    liveContext,
    serverHost,
    serverLog,
    backgroundCollectActive,
    start,
    stop,
    stopBackgroundCollect: stopBackgroundCollectFn,
    clear,
  }
}
