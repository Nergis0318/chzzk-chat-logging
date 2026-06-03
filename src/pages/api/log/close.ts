import type { APIRoute } from "astro"
import { closeSession } from "@/server/log-store"

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  let body: { sessionId?: string }
  try {
    body = (await request.json()) as { sessionId?: string }
  } catch {
    return json({ error: "invalid JSON body" }, 400)
  }
  const sessionId = body.sessionId?.trim()
  if (!sessionId) return json({ error: "sessionId is required" }, 400)

  const result = await closeSession(sessionId)
  return json(result, result.closed ? 200 : 400)
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
}
