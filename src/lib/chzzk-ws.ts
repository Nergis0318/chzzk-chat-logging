import type { ChzzkServerFrame } from "./chzzk"

/** Matches CHZZK web client (HAR 2026-06). */
export const CHZZK_CHAT_LIB_VER = "4.11.0"
export const CHZZK_CHAT_SERVER_MAX = 24

export const CHZZK_CMD_PING = 0
export const CHZZK_CMD_PONG = 10000
export const CHZZK_CMD_SUBSCRIBE = 100
export const CHZZK_CMD_AUTH_SUCCESS = 10100
export const CHZZK_CMD_LIVE_CHAT = 93101
export const CHZZK_CMD_REQUEST_RECENT = 5101
export const CHZZK_CMD_RECENT_HISTORY = 15101

export function pickChatServerHost(): string {
  const n = Math.floor(Math.random() * CHZZK_CHAT_SERVER_MAX) + 1
  return `kr-ss${n}.chat.naver.com`
}

export function buildChatWsUrl(host?: string): string {
  return `wss://${host ?? pickChatServerHost()}/chat`
}

/** READ-only subscribe (logging / viewer without login). */
export function buildSubscribeMessage(chatChannelId: string): string {
  return JSON.stringify({
    ver: "3",
    cmd: CHZZK_CMD_SUBSCRIBE,
    svcid: "game",
    cid: chatChannelId,
    sid: null,
    bdy: {
      uid: null,
      devType: 2001,
      accTkn: "",
      auth: "READ",
      libVer: CHZZK_CHAT_LIB_VER,
      osVer: "Windows/10",
      devName:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
    tid: 1,
  })
}

export function buildPongMessage(): string {
  return JSON.stringify({ ver: "2", cmd: CHZZK_CMD_PONG })
}

export function buildRecentMessagesRequest(
  chatChannelId: string,
  sid: string,
  recentMessageCount = 50,
  tid = 2
): string {
  return JSON.stringify({
    ver: "3",
    cmd: CHZZK_CMD_REQUEST_RECENT,
    svcid: "game",
    cid: chatChannelId,
    sid,
    bdy: { recentMessageCount },
    tid,
  })
}

export type ChzzkWsControlResult = "pong" | "auth" | "none"

/**
 * Handles keep-alive and auth handshake frames. Returns whether the frame was
 * consumed (no chat payload to parse).
 */
export function handleChzzkWsControl(
  ws: WebSocket,
  frame: ChzzkServerFrame,
  onAuth?: (sid: string) => void
): ChzzkWsControlResult {
  if (frame.cmd === CHZZK_CMD_PING) {
    try {
      ws.send(buildPongMessage())
    } catch {
      /* ignore */
    }
    return "pong"
  }
  if (frame.cmd === CHZZK_CMD_PONG) return "pong"
  if (frame.cmd === CHZZK_CMD_AUTH_SUCCESS && frame.bdy && typeof frame.bdy === "object") {
    const sid = (frame.bdy as { sid?: string }).sid
    if (typeof sid === "string" && sid.length > 0) onAuth?.(sid)
    return "auth"
  }
  return "none"
}