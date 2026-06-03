/**
 * Type definitions ported from chzzk-chat-live-viewer.py
 * Server payload shape (raw websocket frame after the initial subscription):
 * {
 *   "ver": "3",
 *   "cmd": <number>,
 *   "svcid": "game",
 *   "cid": "<chatChannelId>",
 *   "bdy": { ... } | ChatRawItem[]
 *   "tid": <number>
 * }
 */

export interface ChzzkProfile {
  nickname?: string
  userIdHash?: string
  profileImageUrl?: string
  userRoleCode?: string
  verifiedMark?: boolean
  badge?: {
    imageUrl?: string
    name?: string
  } | null
  title?: {
    name?: string
    color?: string
  } | null
  activityBadges?: unknown[]
  streamingProperty?: {
    nicknameColor?: { colorCode?: string }
    subscription?: {
      accumulativeMonth?: number
      tier?: number
      badge?: { imageUrl?: string }
    }
    activatedAchievementBadgeIds?: string[]
  }
  viewerBadges?: Array<{
    type?: string
    badge?: { badgeId?: string; scope?: string; imageUrl?: string }
  }>
  emojis?: Record<string, string>
}

export interface ChzzkExtras {
  osType?: "PC" | "MOBILE" | "IOS" | "AOS" | string
  payAmount?: number
  chatType?: "STREAMING" | "DONATION" | string
  extraToken?: string
  streamingChannelId?: string
  emojis?: Record<string, string>
}

export interface ChzzkChatRawItem {
  svcid: string
  cid: string
  mbrCnt: number
  msgId?: string
  msgTypeCode?: string
  msg: string
  msgTime: number
  profileJson?: string
  profile?: string
  extras?: string
  msgStatusType?: "NORMAL" | "HIDDEN" | string
}

/** History payload inside `bdy.messageList` (cmd 15101, HAR 2026-06). */
export interface ChzzkMessageListItem {
  serviceId?: string
  channelId?: string
  messageTime?: number
  userId?: string
  profile?: string
  content?: string
  extras?: string
  memberCount?: number
  messageTypeCode?: number
  messageStatusType?: string
  createTime?: number
  updateTime?: number
  msgTid?: string | null
}

export interface ParsedChatMessage {
  /** Raw websocket item id (if provided) */
  msgId?: string
  /** Server-provided ms epoch timestamp */
  msgTimeMs: number
  /** Parsed Date equivalent of msgTimeMs */
  timestamp: Date
  /** Plain text body of the chat */
  msg: string
  /** Author nickname (falls back to "익명" to mirror the Python script) */
  nickname: string
  profileImageUrl?: string
  userRoleCode?: string
  verifiedMark?: boolean
  badgeName?: string
  titleName?: string
  titleColor?: string
  /** Operating system, when present (e.g. "PC", "MOBILE") */
  osType?: string
  /** Donation amount in KRW, when present */
  payAmount?: number
  chatType?: string
  /** Whether the server marked the message as hidden */
  hidden?: boolean
  /** Pre-formatted line mirroring the Python txt log output */
  formatted: string
}

export type ConnectionStatus =
  | "idle"
  | "resolving"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error"

export interface ChzzkServerFrame {
  ver?: string
  cmd?: number
  svcid?: string
  cid?: string
  bdy?: unknown
  tid?: number
}

export interface LiveStatusResponse {
  content?: {
    chatChannelId?: string
    channelId?: string
    openLive?: boolean
    liveTitle?: string
    liveImageUrl?: string
  }
}

export interface ChzzkApiEnvelope<T> {
  code?: number
  message?: string | null
  content?: T
}

export interface ChzzkChannelSummary {
  channelId?: string
  channelName?: string
  channelImageUrl?: string
  verifiedMark?: boolean
  channelDescription?: string
  followerCount?: number
  openLive?: boolean
  channelType?: string
}

export interface ChzzkLiveDetailContent {
  liveId?: number
  liveTitle?: string
  status?: string
  liveImageUrl?: string
  concurrentUserCount?: number
  openDate?: string
  closeDate?: string | null
  adult?: boolean
  krOnlyViewing?: boolean
  tags?: string[]
  chatChannelId?: string
  categoryType?: string
  liveCategory?: string
  liveCategoryValue?: string
  chatActive?: boolean
  channel?: ChzzkChannelSummary
}

export interface ChzzkChannelContent extends ChzzkChannelSummary {
  subscriptionAvailability?: boolean
  adMonetizationAvailability?: boolean
}

/** Merged context shown in the viewer header. */
export interface ChzzkLiveContext {
  channelId: string
  chatChannelId: string
  /** True when CHZZK reports the channel is currently broadcasting. */
  openLive: boolean
  liveId?: number
  liveTitle?: string
  liveThumbnailUrl?: string
  concurrentUserCount?: number
  openDate?: string
  tags?: string[]
  categoryType?: string
  liveCategory?: string
  adult?: boolean
  krOnlyViewing?: boolean
  channelName?: string
  channelImageUrl?: string
  verifiedMark?: boolean
  followerCount?: number
  channelDescription?: string
}
