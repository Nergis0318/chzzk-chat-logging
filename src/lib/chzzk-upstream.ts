import { cookieHeaderFromRequest } from "@/lib/chzzk-cookies"

/** Headers required for CHZZK public API (403 without Referer/Origin). */
export const CHZZK_UPSTREAM_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
  Accept: "application/json",
  Referer: "https://chzzk.naver.com/",
  Origin: "https://chzzk.naver.com",
}

export function mergeChzzkUpstreamHeaders(cookie?: string): HeadersInit {
  if (!cookie) return CHZZK_UPSTREAM_HEADERS
  return { ...CHZZK_UPSTREAM_HEADERS, Cookie: cookie }
}

export async function fetchChzzkUpstream(
  url: string,
  options?: { cookie?: string }
): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(url, {
    method: "GET",
    headers: mergeChzzkUpstreamHeaders(options?.cookie),
  })
  return { ok: res.ok, status: res.status, body: await res.text() }
}

export async function fetchChzzkUpstreamFromRequest(
  url: string,
  request: Request
): Promise<{ ok: boolean; status: number; body: string }> {
  return fetchChzzkUpstream(url, { cookie: cookieHeaderFromRequest(request) })
}

export function chzzkProxyJsonResponse(
  upstream: { ok: boolean; status: number; body: string }
): Response {
  if (!upstream.ok) {
    return new Response(
      JSON.stringify({
        error: `upstream ${upstream.status}`,
        upstream: upstream.body.slice(0, 500),
      }),
      {
        status: upstream.status === 404 ? 404 : 502,
        headers: { "content-type": "application/json" },
      }
    )
  }
  try {
    JSON.parse(upstream.body)
  } catch {
    return new Response(JSON.stringify({ error: "invalid upstream response" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    })
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  })
}