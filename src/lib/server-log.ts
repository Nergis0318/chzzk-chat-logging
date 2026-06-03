/**
 * Client-side helper for the server log API. Buffers lines and flushes them
 * in batches to avoid one HTTP request per chat message.
 */

export interface ServerLogStartRequest {
  channelId: string
  chatChannelId: string
  pathTemplate: string
  autoRotate: boolean
}

export interface ServerLogStartResponse {
  session: {
    sessionId: string
    resolvedPath: string
    channelId: string
    chatChannelId: string
    pathTemplate: string
    autoRotate: boolean
    openedAt: number
    currentDateMs: number
    bytesWritten: number
    messagesWritten: number
  }
  baseDir: string
}

const FLUSH_INTERVAL_MS = 250
const FLUSH_MAX_LINES = 100

export interface ServerLogClient {
  /** Push a single formatted line into the buffer. */
  push: (line: string) => void
  /** Stop accepting pushes, flush the remainder, and close the server session. */
  close: () => Promise<void>
  /** Resolve with the current session info. */
  info: () => ServerLogStartResponse["session"] | null
  /** Server-side base directory all log files are written under. */
  baseDir: () => string
}

export async function openServerLogClient(
  req: ServerLogStartRequest
): Promise<ServerLogClient> {
  const res = await fetch("/api/log/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  })
  const body = (await res.json()) as ServerLogStartResponse | { error: string }
  if (!res.ok || !("session" in body)) {
    throw new Error("error" in body ? body.error : "failed to open server log")
  }
  const session = body.session
  const sessionId = session.sessionId

  let buffer: string[] = []
  let closed = false
  let inflight: Promise<unknown> = Promise.resolve()

  async function flush(): Promise<void> {
    if (buffer.length === 0) return
    const lines = buffer
    buffer = []
    try {
      const r = await fetch("/api/log/append", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, lines }),
      })
      if (!r.ok) {
        const errBody = (await r.json().catch(() => ({}))) as { error?: string }
        // eslint-disable-next-line no-console
        console.warn("[server-log] append failed:", errBody.error ?? r.status)
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[server-log] append network error:", e)
    }
  }

  const timer = setInterval(() => {
    if (closed) return
    if (buffer.length === 0) return
    inflight = inflight.then(flush).catch(() => undefined)
  }, FLUSH_INTERVAL_MS)

  function push(line: string): void {
    if (closed) return
    buffer.push(line)
    if (buffer.length >= FLUSH_MAX_LINES) {
      inflight = inflight.then(flush).catch(() => undefined)
    }
  }

  async function close(): Promise<void> {
    if (closed) return
    closed = true
    clearInterval(timer)
    // Drain any queued pushes and the in-flight chain.
    await inflight
    if (buffer.length > 0) await flush()
    try {
      await fetch("/api/log/close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[server-log] close network error:", e)
    }
  }

  return {
    push,
    close,
    info: () => session,
    baseDir: () => body.baseDir,
  }
}
