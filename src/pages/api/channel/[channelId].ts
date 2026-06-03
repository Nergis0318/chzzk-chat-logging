import type { APIRoute } from "astro"

import {
  chzzkProxyJsonResponse,
  fetchChzzkUpstreamFromRequest,
} from "@/lib/chzzk-upstream"

export const prerender = false

export const GET: APIRoute = async ({ params, request }) => {
  const channelId = params.channelId?.trim()
  if (!channelId) {
    return new Response(JSON.stringify({ error: "channelId is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }

  const upstream = await fetchChzzkUpstreamFromRequest(
    `https://api.chzzk.naver.com/service/v1/channels/${encodeURIComponent(channelId)}`,
    request
  )
  return chzzkProxyJsonResponse(upstream)
}