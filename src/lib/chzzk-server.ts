import type { LiveStatusResponse } from "./chzzk"
import { fetchChzzkUpstream } from "./chzzk-upstream"

export async function serverFetchChatChannelId(
  channelId: string,
  cookie?: string
): Promise<string> {
  const upstream = await fetchChzzkUpstream(
    `https://api.chzzk.naver.com/polling/v2/channels/${encodeURIComponent(channelId)}/live-status`,
    { cookie }
  )
  if (!upstream.ok) {
    throw new Error(
      `live-status upstream ${upstream.status}: ${upstream.body.slice(0, 200)}`
    )
  }
  let data: LiveStatusResponse
  try {
    data = JSON.parse(upstream.body) as LiveStatusResponse
  } catch {
    throw new Error("invalid live-status JSON from upstream")
  }
  const chatChannelId = data.content?.chatChannelId
  if (!chatChannelId) {
    throw new Error("라이브 중이 아니거나 chatChannelId를 찾을 수 없습니다.")
  }
  return chatChannelId
}
