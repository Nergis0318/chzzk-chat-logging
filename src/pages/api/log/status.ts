import type { APIRoute } from "astro"
import {
  getLogBaseDir,
  getSessionInfo,
  listActiveSessions,
} from "@/server/log-store"

export const prerender = false

export const GET: APIRoute = async ({ url }) => {
  const sessionId = url.searchParams.get("sessionId")?.trim()
  if (sessionId) {
    const info = getSessionInfo(sessionId)
    if (!info) return json({ error: "unknown session" }, 404)
    return json({ session: info, baseDir: getLogBaseDir() }, 200)
  }
  return json(
    { activeSessions: listActiveSessions(), baseDir: getLogBaseDir() },
    200
  )
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
}
