import type { APIRoute } from "astro"
import { appendMessages } from "@/server/log-store"

export const prerender = false

interface AppendBody {
  sessionId?: string
  lines?: string[]
}

const MAX_LINES_PER_REQUEST = 500
const MAX_LINE_LENGTH = 8_192

export const POST: APIRoute = async ({ request }) => {
  let body: AppendBody
  try {
    body = (await request.json()) as AppendBody
  } catch {
    return json({ error: "invalid JSON body" }, 400)
  }
  const sessionId = body.sessionId?.trim()
  if (!sessionId) return json({ error: "sessionId is required" }, 400)
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return json({ accepted: 0, bytes: 0 })
  }
  if (body.lines.length > MAX_LINES_PER_REQUEST) {
    return json({ error: `too many lines (max ${MAX_LINES_PER_REQUEST})` }, 413)
  }
  // Strip any embedded newlines and truncate oversize lines to keep the
  // server-side file format predictable.
  const sanitized = body.lines.map((line) => {
    if (typeof line !== "string") return ""
    return line.replace(/[\r\n]+/g, " ").slice(0, MAX_LINE_LENGTH)
  })

  try {
    const result = await appendMessages(sessionId, sanitized)
    return json(result, 200)
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "append failed" },
      400
    )
  }
}

function json(payload: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
}
