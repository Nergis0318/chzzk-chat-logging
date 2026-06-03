import type { APIRoute } from "astro"
import { stopCollector } from "@/server/chat-collector"

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  let body: { collectorId?: string }
  try {
    body = (await request.json()) as { collectorId?: string }
  } catch {
    return json({ error: "invalid JSON body" }, 400)
  }
  const collectorId = body.collectorId?.trim()
  if (!collectorId) return json({ error: "collectorId is required" }, 400)

  const result = await stopCollector(collectorId)
  return json(result, result.stopped ? 200 : 400)
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
}
