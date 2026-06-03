import { buildCookieHeaderFromText } from "@/lib/netscape-cookies"

export const CHZZK_NETSCAPE_COOKIE_STORAGE_KEY = "chzzk-netscape-cookies"
export const CHZZK_APPLY_COOKIES_STORAGE_KEY = "chzzk-apply-cookies"
/** Pre-built `Cookie` header value sent to our Astro API proxies. */
export const CHZZK_COOKIE_REQUEST_HEADER = "X-Chzzk-Cookie"

const CHZZK_API_ORIGIN = "https://api.chzzk.naver.com"

export function readNetscapeCookieText(): string {
  try {
    return sessionStorage.getItem(CHZZK_NETSCAPE_COOKIE_STORAGE_KEY) ?? ""
  } catch {
    return ""
  }
}

export function persistNetscapeCookieText(text: string): void {
  try {
    if (text.trim()) {
      sessionStorage.setItem(CHZZK_NETSCAPE_COOKIE_STORAGE_KEY, text)
    } else {
      sessionStorage.removeItem(CHZZK_NETSCAPE_COOKIE_STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function isApplyCookiesEnabled(): boolean {
  try {
    return sessionStorage.getItem(CHZZK_APPLY_COOKIES_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function setApplyCookiesEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      sessionStorage.setItem(CHZZK_APPLY_COOKIES_STORAGE_KEY, "1")
    } else {
      sessionStorage.removeItem(CHZZK_APPLY_COOKIES_STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}

/** Cookie header for CHZZK API upstream (live-status, detail, channel). */
export function buildChzzkApiCookieHeader(netscapeText?: string): string | undefined {
  const text = netscapeText ?? readNetscapeCookieText()
  if (!text.trim()) return undefined
  return buildCookieHeaderFromText(text, `${CHZZK_API_ORIGIN}/`)
}

export function getCookieFetchHeaders(
  netscapeText?: string
): Record<string, string> | undefined {
  if (!isApplyCookiesEnabled()) return undefined
  const cookie = buildChzzkApiCookieHeader(netscapeText)
  if (!cookie) return undefined
  return { [CHZZK_COOKIE_REQUEST_HEADER]: cookie }
}

export function cookieHeaderFromRequest(request: Request): string | undefined {
  const value = request.headers.get(CHZZK_COOKIE_REQUEST_HEADER)?.trim()
  return value || undefined
}