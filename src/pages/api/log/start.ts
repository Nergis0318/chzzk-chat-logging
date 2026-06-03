import type { APIRoute } from "astro"
import {
  ensureRotationTicker,
  openSession,
  getLogBaseDir,
} from "@/server/log-store"

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  let body: {
    channelId?: string
    chatChannelId?: string
    pathTemplate?: string
    autoRotate?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return json({ error: "invalid JSON body" }, 400)
  }

  const channelId = body.channelId?.trim()
  const chatChannelId = body.chatChannelId?.trim()
  const pathTemplate = body.pathTemplate?.trim()
  if (!channelId) return json({ error: "channelId is required" }, 400)
  if (!chatChannelId) return json({ error: "chatChannelId is required" }, 400)
  if (!pathTemplate) return json({ error: "pathTemplate is required" }, 400)

  ensureRotationTicker()

  try {
    const info = await openSession({
      channelId,
      chatChannelId,
      pathTemplate,
      autoRotate: body.autoRotate !== false,
    })
    return json(
      {
        session: info,
        baseDir: getLogBaseDir(),
      },
      200
    )
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "failed to open session" },
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
