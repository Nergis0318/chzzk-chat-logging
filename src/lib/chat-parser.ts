import type {
  ChzzkChatRawItem,
  ChzzkExtras,
  ChzzkProfile,
  ChzzkServerFrame,
  ParsedChatMessage,
} from "./chzzk"

const ANON_NICKNAME = "익명"

function safeParseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => n.toString().padStart(2, "0")
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

/**
 * Mirrors the Python script's `f"[{formatted_time}] {nickname}{os_info}: {msg}"`
 * line. When payAmount > 0 the script appends `(N원 후원)` between nickname and
 * the message; this helper keeps the same shape so exports are byte-compatible.
 */
export function formatChatLine(msg: ParsedChatMessage): string {
  const osInfo = msg.osType ? ` (${msg.osType})` : ""
  const donation =
    msg.payAmount && msg.payAmount > 0 ? ` (${msg.payAmount}원 후원)` : ""
  return `[${formatTimestamp(msg.msgTimeMs)}] ${msg.nickname}${osInfo}${donation}: ${msg.msg}`
}

/** Normalize live (cmd 93101) and history (cmd 15101) payloads to one shape. */
export function normalizeChatRawItem(
  raw: Record<string, unknown>
): ChzzkChatRawItem | null {
  const msgTimeMs = raw.msgTime ?? raw.messageTime
  const msg = raw.msg ?? raw.content
  if (typeof msgTimeMs !== "number" || !msg || typeof msg !== "string") {
    return null
  }

  const profileSource = raw.profile ?? raw.profileJson
  return {
    svcid: String(raw.svcid ?? raw.serviceId ?? "game"),
    cid: String(raw.cid ?? raw.channelId ?? ""),
    mbrCnt: Number(raw.mbrCnt ?? raw.memberCount ?? 0),
    msgId: typeof raw.msgId === "string" ? raw.msgId : undefined,
    msgTypeCode:
      typeof raw.msgTypeCode === "number" || typeof raw.msgTypeCode === "string"
        ? String(raw.msgTypeCode)
        : undefined,
    msg,
    msgTime: msgTimeMs,
    profileJson:
      typeof raw.profileJson === "string" ? raw.profileJson : undefined,
    profile: typeof profileSource === "string" ? profileSource : undefined,
    extras: typeof raw.extras === "string" ? raw.extras : undefined,
    msgStatusType:
      typeof raw.msgStatusType === "string" ? raw.msgStatusType : undefined,
  }
}

function extractRawItems(bdy: unknown): ChzzkChatRawItem[] {
  if (Array.isArray(bdy)) {
    const out: ChzzkChatRawItem[] = []
    for (const item of bdy) {
      if (!item || typeof item !== "object") continue
      const normalized = normalizeChatRawItem(item as Record<string, unknown>)
      if (normalized) out.push(normalized)
    }
    return out
  }

  if (bdy && typeof bdy === "object" && "messageList" in bdy) {
    const list = (bdy as { messageList?: unknown }).messageList
    if (!Array.isArray(list)) return []
    const out: ChzzkChatRawItem[] = []
    for (const item of list) {
      if (!item || typeof item !== "object") continue
      const normalized = normalizeChatRawItem(item as Record<string, unknown>)
      if (normalized) out.push(normalized)
    }
    return out
  }

  return []
}

/**
 * Parse a single chat item from the websocket `bdy` array. Returns `null` for
 * items that lack the minimum required fields, matching the Python script's
 * `if msg_time_ms and msg:` guard.
 */
export function parseChatItem(raw: ChzzkChatRawItem): ParsedChatMessage | null {
  const msgTimeMs = raw.msgTime
  const msg = raw.msg
  if (!msgTimeMs || !msg) return null

  const profile = safeParseJson<ChzzkProfile>(
    raw.profile ?? raw.profileJson,
    {}
  )
  const extras = safeParseJson<ChzzkExtras>(raw.extras, {})

  const nickname = profile.nickname ?? ANON_NICKNAME
  const payAmount =
    typeof extras.payAmount === "number" && extras.payAmount > 0
      ? extras.payAmount
      : undefined

  const base = {
    msgId: raw.msgId,
    msgTimeMs,
    timestamp: new Date(msgTimeMs),
    msg,
    nickname,
    profileImageUrl: profile.profileImageUrl,
    userRoleCode: profile.userRoleCode,
    verifiedMark: profile.verifiedMark,
    badgeName: profile.badge?.name,
    titleName: profile.title?.name,
    titleColor: profile.title?.color,
    osType: extras.osType,
    payAmount,
    chatType: extras.chatType,
    hidden: raw.msgStatusType === "HIDDEN",
    formatted: "",
  }

  const formatted = formatChatLine({ ...base, formatted: "" })
  return { ...base, formatted }
}

/**
 * Live chat uses `bdy` as an array (cmd 93101). Recent history uses
 * `bdy.messageList` (cmd 15101). Auth/ping frames have no chat items.
 */
export function parseServerFrame(frame: ChzzkServerFrame): ParsedChatMessage[] {
  const rawItems = extractRawItems(frame.bdy)
  const out: ParsedChatMessage[] = []
  for (const item of rawItems) {
    const parsed = parseChatItem(item)
    if (parsed) out.push(parsed)
  }
  return out
}