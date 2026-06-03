/** One row from a Netscape / cookies.txt export. */
export interface NetscapeCookie {
  domain: string
  includeSubdomains: boolean
  path: string
  secure: boolean
  /** Unix seconds; 0 = session cookie. */
  expires: number
  name: string
  value: string
}

function isCommentOrBlank(line: string): boolean {
  const t = line.trim()
  return t.length === 0 || t.startsWith("#")
}

/**
 * Parse Netscape HTTP Cookie File format (cookies.txt).
 * Ignores comment and blank lines.
 */
export function parseNetscapeCookies(text: string): NetscapeCookie[] {
  const out: NetscapeCookie[] = []
  for (const raw of text.split(/\r?\n/)) {
    if (isCommentOrBlank(raw)) continue
    const parts = raw.split("\t")
    if (parts.length < 7) continue
    const [domain, subdomains, path, secure, expiresRaw, name, ...valueParts] =
      parts
    const value = valueParts.join("\t")
    if (!domain || !name) continue
    const expires = Number.parseInt(expiresRaw, 10)
    out.push({
      domain,
      includeSubdomains: subdomains.toUpperCase() === "TRUE",
      path: path || "/",
      secure: secure.toUpperCase() === "TRUE",
      expires: Number.isFinite(expires) ? expires : 0,
      name,
      value,
    })
  }
  return out
}

function domainMatches(cookie: NetscapeCookie, host: string): boolean {
  const d = cookie.domain.startsWith(".")
    ? cookie.domain.slice(1)
    : cookie.domain
  if (cookie.includeSubdomains || cookie.domain.startsWith(".")) {
    return host === d || host.endsWith("." + d)
  }
  return host === cookie.domain || host === d
}

function pathMatches(cookie: NetscapeCookie, requestPath: string): boolean {
  const p = cookie.path || "/"
  if (p === "/") return true
  return (
    requestPath === p || requestPath.startsWith(p.endsWith("/") ? p : p + "/")
  )
}

function isExpired(cookie: NetscapeCookie, nowSec: number): boolean {
  if (cookie.expires === 0) return false
  return cookie.expires < nowSec
}

/**
 * Build a `Cookie` request header value for the given URL from Netscape rows.
 */
export function buildCookieHeader(
  cookies: NetscapeCookie[],
  url: string
): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  const host = parsed.hostname
  const path = parsed.pathname || "/"
  const isHttps = parsed.protocol === "https:"
  const nowSec = Math.floor(Date.now() / 1000)

  const pairs: string[] = []
  const seen = new Set<string>()

  for (const c of cookies) {
    if (isExpired(c, nowSec)) continue
    if (c.secure && !isHttps) continue
    if (!domainMatches(c, host)) continue
    if (!pathMatches(c, path)) continue
    if (seen.has(c.name)) continue
    seen.add(c.name)
    pairs.push(`${c.name}=${c.value}`)
  }

  return pairs.length > 0 ? pairs.join("; ") : undefined
}

export function buildCookieHeaderFromText(
  netscapeText: string,
  url: string
): string | undefined {
  const trimmed = netscapeText.trim()
  if (!trimmed) return undefined
  return buildCookieHeader(parseNetscapeCookies(trimmed), url)
}
