import type { APIRoute } from "astro"

import {
  chzzkProxyJsonResponse,
  fetchChzzkUpstreamFromRequest,
} from "@/lib/chzzk-upstream"

export const prerender = false

/** Proxy for CHZZK polling live-status (chatChannelId resolution). */
export const GET: APIRoute = async ({ params, request }) => {
  const channelId = params.channelId?.trim()
  if (!channelId) {
    return new Response(JSON.stringify({ error: "channelId is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }

  try {
    const upstream = await fetchChzzkUpstreamFromRequest(
      `https://api.chzzk.naver.com/polling/v2/channels/${encodeURIComponent(channelId)}/live-status`,
      request
    )
    return chzzkProxyJsonResponse(upstream)
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "upstream fetch failed",
      }),
      { status: 502, headers: { "content-type": "application/json" } }
    )
  }
}
