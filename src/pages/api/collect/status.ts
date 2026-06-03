import type { APIRoute } from "astro"
import {
  findActiveCollectorByChannel,
  getCollectorInfo,
  listCollectors,
} from "@/server/chat-collector"
import { getLogBaseDir } from "@/server/log-store"

export const prerender = false

export const GET: APIRoute = async ({ url }) => {
  const collectorId = url.searchParams.get("collectorId")?.trim()
  const baseDir = getLogBaseDir()
  if (collectorId) {
    const info = getCollectorInfo(collectorId)
    return json({ collector: info, baseDir }, 200)
  }
  const channelId = url.searchParams.get("channelId")?.trim()
  if (channelId) {
    const info = findActiveCollectorByChannel(channelId)
    return json({ collector: info, baseDir }, 200)
  }
  return json(
    { collectors: listCollectors(), baseDir: getLogBaseDir() },
    200
  )
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
}