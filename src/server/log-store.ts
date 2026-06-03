import { createWriteStream, type WriteStream } from "node:fs"
import { mkdir, stat } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { format } from "node:util"

const LOG_BASE_DIR = resolve(
  process.env.LOG_BASE_DIR ?? join(process.cwd(), "logs")
)
const REQUIRED_TOKENS = ["{date}"] as const

export interface OpenSessionOptions {
  channelId: string
  chatChannelId: string
  /** Path template relative to LOG_BASE_DIR (or absolute, constrained to base). */
  pathTemplate: string
  /** When true, the server will auto-rotate at midnight. */
  autoRotate: boolean
}

export interface SessionInfo {
  sessionId: string
  resolvedPath: string
  channelId: string
  chatChannelId: string
  pathTemplate: string
  autoRotate: boolean
  openedAt: number
  /** ms epoch of the date the current file was opened for. */
  currentDateMs: number
  bytesWritten: number
  messagesWritten: number
}

interface ActiveSession {
  info: SessionInfo
  stream: WriteStream
  /** Resolves when the stream is ready for the next write. */
  queue: Promise<void>
}

const sessions = new Map<string, ActiveSession>()

/** @internal Exposed for test scripts; do not depend on from app code. */
export const __test_sessions = sessions

function sanitizeToken(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_")
}

export function todayDateStamp(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = `${now.getMonth() + 1}`.padStart(2, "0")
  const d = `${now.getDate()}`.padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function startOfLocalDayMs(now: Date = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

/**
 * Validate a path template and resolve it against LOG_BASE_DIR.
 *
 * Rules:
 * - The template must be a string with no NUL bytes.
 * - After `{date}` / `{channel}` substitution the resolved path must live
 *   inside LOG_BASE_DIR (no `..` escapes, no symlink-style absolute paths).
 */
export function resolveTemplatePath(
  pathTemplate: string,
  ctx: { date: string; channel: string }
):
  | { ok: true; absolute: string; relative: string }
  | { ok: false; reason: string } {
  if (typeof pathTemplate !== "string" || pathTemplate.length === 0) {
    return { ok: false, reason: "pathTemplate is required" }
  }
  if (pathTemplate.includes("\0")) {
    return { ok: false, reason: "pathTemplate contains NUL byte" }
  }
  for (const tok of REQUIRED_TOKENS) {
    if (!pathTemplate.includes(tok)) {
      return {
        ok: false,
        reason: `pathTemplate must include ${tok} for daily rotation`,
      }
    }
  }

  const substituted = pathTemplate
    .replaceAll("{date}", sanitizeToken(ctx.date))
    .replaceAll("{channel}", sanitizeToken(ctx.channel)) // optional, no-op if absent

  // Normalise separators; reject control characters.
  if (/[\u0000-\u001f]/.test(substituted)) {
    return { ok: false, reason: "pathTemplate contains control characters" }
  }

  // Treat the template as relative to the base directory.
  const candidate = isAbsolute(substituted)
    ? resolve(substituted)
    : resolve(LOG_BASE_DIR, substituted)
  const rel = relative(LOG_BASE_DIR, candidate)
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return { ok: false, reason: "path resolves outside of LOG_BASE_DIR" }
  }
  if (rel === "" || rel === ".") {
    return { ok: false, reason: "path resolves to LOG_BASE_DIR itself" }
  }
  return { ok: true, absolute: candidate, relative: rel }
}

function newSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

async function openStream(absolutePath: string): Promise<WriteStream> {
  await mkdir(dirname(absolutePath), { recursive: true })
  // Sanity-check the path exists as a regular file or doesn't exist yet.
  try {
    const s = await stat(absolutePath)
    if (!s.isFile()) {
      throw new Error("not a regular file")
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code !== "ENOENT") throw e
  }
  return createWriteStream(absolutePath, { flags: "a", encoding: "utf8" })
}

async function rotateSession(
  sessionId: string,
  nextDate: Date = new Date()
): Promise<
  { rotated: true; path: string } | { rotated: false; reason: string }
> {
  const active = sessions.get(sessionId)
  if (!active) return { rotated: false, reason: "unknown session" }
  const info = active.info
  const dateMs = startOfLocalDayMs(nextDate)
  if (dateMs === info.currentDateMs) {
    return { rotated: false, reason: "same date" }
  }

  // Drain the existing queue before closing.
  await active.queue

  await new Promise<void>((resolveClose, rejectClose) => {
    active.stream.end((err?: Error | null) =>
      err ? rejectClose(err) : resolveClose()
    )
  })

  const date = todayDateStamp(nextDate)
  const resolved = resolveTemplatePath(info.pathTemplate, {
    date,
    channel: info.channelId,
  })
  if (!resolved.ok) {
    return { rotated: false, reason: resolved.reason }
  }

  const stream = await openStream(resolved.absolute)
  const next: ActiveSession = {
    info: {
      ...info,
      currentDateMs: dateMs,
      resolvedPath: resolved.relative,
      bytesWritten: 0,
      messagesWritten: 0,
    },
    stream,
    queue: Promise.resolve(),
  }
  sessions.set(sessionId, next)
  return { rotated: true, path: resolved.relative }
}

function enqueueWrite(active: ActiveSession, payload: string): Promise<void> {
  const next = active.queue.then(
    () =>
      new Promise<void>((resolve, reject) => {
        const buf = Buffer.from(payload, "utf8")
        const ok = active.stream.write(buf, (err?: Error | null) =>
          err ? reject(err) : resolve()
        )
        if (!ok) {
          // Backpressure: wait for drain before resolving.
          active.stream.once("drain", () => resolve())
        }
      })
  )
  active.queue = next.catch(() => {
    // Swallow to keep the queue alive after a write error.
  })
  return next
}

export async function openSession(
  options: OpenSessionOptions
): Promise<SessionInfo> {
  const date = todayDateStamp()
  const resolved = resolveTemplatePath(options.pathTemplate, {
    date,
    channel: options.channelId,
  })
  if (!resolved.ok) {
    throw new Error(resolved.reason)
  }
  const stream = await openStream(resolved.absolute)
  const sessionId = newSessionId()
  const info: SessionInfo = {
    sessionId,
    resolvedPath: resolved.relative,
    channelId: options.channelId,
    chatChannelId: options.chatChannelId,
    pathTemplate: options.pathTemplate,
    autoRotate: options.autoRotate,
    openedAt: Date.now(),
    currentDateMs: startOfLocalDayMs(),
    bytesWritten: 0,
    messagesWritten: 0,
  }
  sessions.set(sessionId, { info, stream, queue: Promise.resolve() })
  return info
}

export async function appendMessages(
  sessionId: string,
  lines: string[]
): Promise<{ accepted: number; bytes: number }> {
  const active = sessions.get(sessionId)
  if (!active) throw new Error("unknown session")
  if (lines.length === 0) return { accepted: 0, bytes: 0 }
  const payload = lines.join("\n") + "\n"
  await enqueueWrite(active, payload)
  const bytes = Buffer.byteLength(payload, "utf8")
  active.info.bytesWritten += bytes
  active.info.messagesWritten += lines.length
  return { accepted: lines.length, bytes }
}

export async function closeSession(
  sessionId: string
): Promise<{ closed: true; path: string } | { closed: false; reason: string }> {
  const active = sessions.get(sessionId)
  if (!active) return { closed: false, reason: "unknown session" }
  await active.queue
  await new Promise<void>((resolveClose, rejectClose) => {
    active.stream.end((err?: Error | null) =>
      err ? rejectClose(err) : resolveClose()
    )
  })
  sessions.delete(sessionId)
  return { closed: true, path: active.info.resolvedPath }
}

export function getSessionInfo(sessionId: string): SessionInfo | null {
  return sessions.get(sessionId)?.info ?? null
}

export function listActiveSessions(): SessionInfo[] {
  return Array.from(sessions.values()).map((s) => s.info)
}

export function getLogBaseDir(): string {
  return LOG_BASE_DIR
}

export { rotateSession }

let rotationInterval: ReturnType<typeof setInterval> | null = null

/**
 * Start the server-wide midnight rotation ticker. Safe to call multiple times.
 * The interval checks every 30 seconds whether any auto-rotate session is now
 * in a different local day than the file it currently has open.
 */
export function ensureRotationTicker(): void {
  if (rotationInterval) return
  rotationInterval = setInterval(() => {
    void runRotationPass().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[log-store] rotation pass failed:", err)
    })
  }, 30_000)
  if (typeof rotationInterval === "object" && rotationInterval !== null) {
    ;(rotationInterval as { unref?: () => void }).unref?.()
  }
}

async function runRotationPass(): Promise<void> {
  const now = new Date()
  const todayMs = startOfLocalDayMs(now)
  for (const [id, active] of sessions) {
    if (!active.info.autoRotate) continue
    if (active.info.currentDateMs >= todayMs) continue
    try {
      const result = await rotateSession(id, now)
      if (result.rotated) {
        // eslint-disable-next-line no-console
        console.log(
          format("[log-store] rotated session %s -> %s", id, result.path)
        )
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[log-store] rotate failed for", id, e)
    }
  }
}

export function stopRotationTicker(): void {
  if (rotationInterval) {
    clearInterval(rotationInterval)
    rotationInterval = null
  }
}
