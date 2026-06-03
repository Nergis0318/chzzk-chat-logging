/**
 * Client helper for the server-side background chat collector.
 * Collectors run on the server and survive page refresh / navigation.
 */

import { buildChzzkApiCookieHeader, isApplyCookiesEnabled } from "@/lib/chzzk-cookies"

export const BACKGROUND_COLLECTOR_STORAGE_KEY = "chzzk-bg-collector"

export interface BackgroundCollectStartRequest {
  channelId: string
  pathTemplate: string
  autoRotate: boolean
}

export interface BackgroundCollectorSnapshot {
  collectorId: string
  channelId: string
  pathTemplate: string
  autoRotate: boolean
}

export interface BackgroundCollectorInfo {
  collectorId: string
  channelId: string
  chatChannelId: string
  sessionId: string
  pathTemplate: string
  autoRotate: boolean
  status: string
  error: string | null
  serverHost: string | null
  startedAt: number
  session: {
    sessionId: string
    resolvedPath: string
    bytesWritten: number
    messagesWritten: number
  } | null
}

export interface BackgroundCollectStartResponse {
  collector: BackgroundCollectorInfo
  baseDir: string
}

export interface BackgroundCollectStatusResponse {
  collector: BackgroundCollectorInfo | null
  baseDir: string
}

export interface BackgroundCollectClient {
  collectorId: string
  close: () => Promise<void>
  info: () => BackgroundCollectStartResponse["collector"] | null
  baseDir: () => string
}

export function persistBackgroundCollector(
  snapshot: BackgroundCollectorSnapshot
): void {
  try {
    sessionStorage.setItem(
      BACKGROUND_COLLECTOR_STORAGE_KEY,
      JSON.stringify(snapshot)
    )
  } catch {
    /* ignore quota / private mode */
  }
}

export function readBackgroundCollector(): BackgroundCollectorSnapshot | null {
  try {
    const raw = sessionStorage.getItem(BACKGROUND_COLLECTOR_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BackgroundCollectorSnapshot
    if (!parsed.collectorId || !parsed.channelId) return null
    return parsed
  } catch {
    return null
  }
}

export function clearBackgroundCollectorStorage(): void {
  try {
    sessionStorage.removeItem(BACKGROUND_COLLECTOR_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function hasPersistedBackgroundCollector(): boolean {
  return readBackgroundCollector() !== null
}

export function createBackgroundCollectClient(
  body: BackgroundCollectStartResponse
): BackgroundCollectClient {
  const collector = body.collector
  const collectorId = collector.collectorId
  return {
    collectorId,
    close: async () => {
      try {
        await fetch("/api/collect/stop", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ collectorId }),
        })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[server-collect] stop network error:", e)
      }
      clearBackgroundCollectorStorage()
    },
    info: () => collector,
    baseDir: () => body.baseDir,
  }
}

export async function fetchCollectorStatus(
  query: { collectorId: string } | { channelId: string }
): Promise<BackgroundCollectStartResponse | null> {
  const param =
    "collectorId" in query
      ? `collectorId=${encodeURIComponent(query.collectorId)}`
      : `channelId=${encodeURIComponent(query.channelId)}`
  try {
    const res = await fetch(`/api/collect/status?${param}`)
    if (!res.ok) return null
    const body = (await res.json()) as BackgroundCollectStatusResponse
    if (!body.collector) return null
    return { collector: body.collector, baseDir: body.baseDir }
  } catch {
    return null
  }
}

function backgroundCollectCookieHeader(): string | undefined {
  if (!isApplyCookiesEnabled()) return undefined
  return buildChzzkApiCookieHeader()
}

export async function openBackgroundCollectClient(
  req: BackgroundCollectStartRequest
): Promise<BackgroundCollectClient> {
  const cookieHeader = backgroundCollectCookieHeader()
  const res = await fetch("/api/collect/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...req,
      ...(cookieHeader ? { cookieHeader } : {}),
    }),
  })
  const body = (await res.json()) as
    | BackgroundCollectStartResponse
    | { error: string }
  if (!res.ok || !("collector" in body)) {
    throw new Error(
      "error" in body ? body.error : "failed to start background collector"
    )
  }
  persistBackgroundCollector({
    collectorId: body.collector.collectorId,
    channelId: body.collector.channelId,
    pathTemplate: req.pathTemplate,
    autoRotate: req.autoRotate,
  })
  return createBackgroundCollectClient(body)
}

export async function stopBackgroundCollector(
  collectorId: string
): Promise<void> {
  try {
    await fetch("/api/collect/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ collectorId }),
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[server-collect] stop network error:", e)
  }
  clearBackgroundCollectorStorage()
}