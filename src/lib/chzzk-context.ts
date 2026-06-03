import { getCookieFetchHeaders } from "@/lib/chzzk-cookies"
import type {
  ChzzkApiEnvelope,
  ChzzkChannelContent,
  ChzzkChannelSummary,
  ChzzkLiveContext,
  ChzzkLiveDetailContent,
  LiveStatusResponse,
} from "./chzzk"

/** Whether the channel is broadcasting per CHZZK polling / detail APIs. */
export function resolveChannelOpenLive(
  liveStatus: LiveStatusResponse | null | undefined,
  live: ChzzkLiveDetailContent | null | undefined,
  channel: ChzzkChannelSummary | null | undefined
): boolean {
  const polling = liveStatus?.content?.openLive
  if (polling === false) return false
  if (polling === true) return true
  if (live?.status === "OPEN") return true
  return channel?.openLive === true
}

function resolveThumbnailUrl(template?: string): string | undefined {
  if (!template) return undefined
  return template.replace("{type}", "480")
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: getCookieFetchHeaders(),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function fetchChatChannelId(channelId: string): Promise<string> {
  const url = `/api/live-status/${encodeURIComponent(channelId)}`
  const res = await fetch(url, {
    method: "GET",
    headers: getCookieFetchHeaders(),
  })
  if (!res.ok) {
    let message = `live-status 요청 실패: ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = `${message} (${body.error})`
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  const data = (await res.json()) as LiveStatusResponse
  const chatChannelId = data.content?.chatChannelId
  if (!chatChannelId) {
    throw new Error("라이브 중이 아니거나 chatChannelId를 찾을 수 없습니다.")
  }
  return chatChannelId
}

export async function fetchLiveContext(
  channelId: string,
  chatChannelId: string
): Promise<ChzzkLiveContext> {
  const encoded = encodeURIComponent(channelId)
  const [liveStatus, liveDetail, channelInfo] = await Promise.all([
    fetchJson<LiveStatusResponse>(`/api/live-status/${encoded}`),
    fetchJson<ChzzkApiEnvelope<ChzzkLiveDetailContent>>(
      `/api/live-detail/${encoded}`
    ),
    fetchJson<ChzzkApiEnvelope<ChzzkChannelContent>>(`/api/channel/${encoded}`),
  ])

  const live = liveDetail?.content
  const channel = channelInfo?.content ?? live?.channel
  const openLive = resolveChannelOpenLive(liveStatus, live, channel)

  const base: ChzzkLiveContext = {
    channelId,
    chatChannelId:
      live?.chatChannelId ??
      liveStatus?.content?.chatChannelId ??
      chatChannelId,
    openLive,
    channelName: channel?.channelName ?? live?.channel?.channelName,
    channelImageUrl: channel?.channelImageUrl ?? live?.channel?.channelImageUrl,
    verifiedMark: channel?.verifiedMark ?? live?.channel?.verifiedMark,
    followerCount: channel?.followerCount,
    channelDescription: channel?.channelDescription,
  }

  if (!openLive) return base

  return {
    ...base,
    liveId: live?.liveId,
    liveTitle: live?.liveTitle ?? liveStatus?.content?.liveTitle,
    liveThumbnailUrl: resolveThumbnailUrl(
      live?.liveImageUrl ?? liveStatus?.content?.liveImageUrl
    ),
    concurrentUserCount: live?.concurrentUserCount,
    openDate: live?.openDate,
    tags: live?.tags,
    categoryType: live?.categoryType,
    liveCategory: live?.liveCategory ?? live?.liveCategoryValue,
    adult: live?.adult,
    krOnlyViewing: live?.krOnlyViewing,
  }
}

export function formatLiveDuration(openDate?: string): string | null {
  if (!openDate) return null
  const started = new Date(openDate.replace(" ", "T"))
  if (Number.isNaN(started.getTime())) return null
  const diffMs = Date.now() - started.getTime()
  if (diffMs < 0) return null
  const totalMin = Math.floor(diffMs / 60_000)
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  if (hours > 0) return `${hours}시간 ${minutes}분`
  return `${minutes}분`
}

const CATEGORY_LABELS: Record<string, string> = {
  talk: "수다",
  game: "게임",
  sports: "스포츠",
  music: "음악",
  etc: "기타",
}

export function formatLiveCategory(
  liveCategory?: string,
  categoryType?: string
): string | null {
  if (liveCategory) {
    const key = liveCategory.toLowerCase()
    return CATEGORY_LABELS[key] ?? liveCategory
  }
  if (categoryType && categoryType !== "ETC") return categoryType
  return categoryType === "ETC" ? "기타" : null
}
