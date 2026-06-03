import type { APIRoute } from "astro"
import { startCollector } from "@/server/chat-collector"
import { getLogBaseDir } from "@/server/log-store"

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  let body: {
    channelId?: string
    pathTemplate?: string
    autoRotate?: boolean
    cookieHeader?: string
  }
  try {
    body = await request.json()
  } catch {
    return json({ error: "invalid JSON body" }, 400)
  }

  const channelId = body.channelId?.trim()
  const pathTemplate = body.pathTemplate?.trim()
  if (!channelId) return json({ error: "channelId is required" }, 400)
  if (!pathTemplate) return json({ error: "pathTemplate is required" }, 400)

  try {
    const collector = await startCollector({
      channelId,
      pathTemplate,
      autoRotate: body.autoRotate !== false,
      cookieHeader: body.cookieHeader?.trim() || undefined,
    })
    return json({ collector, baseDir: getLogBaseDir() }, 200)
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "failed to start collector" },
      400
    )
  }
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
}
