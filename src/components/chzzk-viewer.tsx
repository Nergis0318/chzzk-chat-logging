import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  RiChat3Line,
  RiDownloadLine,
  RiEyeLine,
  RiFileTextLine,
  RiGlobalLine,
  RiHashtag,
  RiHeart3Line,
  RiLinksLine,
  RiLiveLine,
  RiPlayLine,
  RiRecordCircleLine,
  RiRefreshLine,
  RiRestartLine,
  RiSearchLine,
  RiServerLine,
  RiShieldCheckLine,
  RiStopLine,
  RiTimeLine,
  RiUserLine,
} from "@remixicon/react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { useChzzkChat, type ServerLogConfig } from "@/hooks/use-chzzk-chat"
import {
  isApplyCookiesEnabled,
  persistNetscapeCookieText,
  readNetscapeCookieText,
  setApplyCookiesEnabled,
} from "@/lib/chzzk-cookies"
import { parseNetscapeCookies } from "@/lib/netscape-cookies"
import { hasPersistedBackgroundCollector } from "@/lib/server-collect"
import { formatChatLine } from "@/lib/chat-parser"
import type {
  ChzzkLiveContext,
  ConnectionStatus,
  ParsedChatMessage,
} from "@/lib/chzzk"
import { formatLiveCategory, formatLiveDuration } from "@/lib/chzzk-context"
import { cn } from "@/lib/utils"

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  idle: "대기 중",
  resolving: "채널 확인 중",
  connecting: "연결 중",
  connected: "연결됨",
  reconnecting: "재연결 중",
  disconnected: "연결 종료",
  error: "오류",
}

const STATUS_DOT: Record<ConnectionStatus, string> = {
  idle: "bg-muted-foreground/40",
  resolving: "bg-amber-500",
  connecting: "bg-amber-500",
  connected: "bg-emerald-500",
  reconnecting: "bg-amber-500",
  disconnected: "bg-muted-foreground/40",
  error: "bg-destructive",
}

const ROLE_LABELS: Record<string, string> = {
  streamer: "스트리머",
  manager: "매니저",
  moderator: "모더",
  subscriber: "구독",
  follower: "팔로워",
  common_user: "시청자",
}

function formatTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function parseQueryChannelId(): string | undefined {
  if (typeof window === "undefined") return undefined
  const value = new URLSearchParams(window.location.search).get("channel")
  return value?.trim() || undefined
}

function chzzkLiveUrl(channelId: string): string {
  return `https://chzzk.naver.com/live/${channelId}`
}

interface ChatItemRowProps {
  message: ParsedChatMessage
  highlight: string
}

function ChatItemRow({ message, highlight }: ChatItemRowProps) {
  const isDonation = !!message.payAmount && message.payAmount > 0
  const isDonationType = message.chatType === "DONATION"
  const lower = highlight.toLowerCase()
  const highlightMsg = useMemo(() => {
    if (!lower) return message.msg
    const text = message.msg
    const out: React.ReactNode[] = []
    let i = 0
    const lowerText = text.toLowerCase()
    while (i < text.length) {
      const idx = lowerText.indexOf(lower, i)
      if (idx === -1) {
        out.push(text.slice(i))
        break
      }
      if (idx > i) out.push(text.slice(i, idx))
      out.push(
        <mark
          key={idx}
          className="rounded bg-primary/20 px-0.5 text-foreground"
        >
          {text.slice(idx, idx + lower.length)}
        </mark>
      )
      i = idx + lower.length
    }
    return out
  }, [message.msg, lower])

  const roleLabel = message.userRoleCode
    ? (ROLE_LABELS[message.userRoleCode.toLowerCase()] ?? message.userRoleCode)
    : null

  const initials = message.nickname.slice(0, 1)

  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-2xl border border-transparent px-2 py-2 transition-colors",
        isDonation || isDonationType
          ? "border-amber-400/35 bg-linear-to-r from-amber-400/10 to-transparent"
          : "hover:bg-muted/50"
      )}
    >
      <Avatar size="sm" className="mt-0.5">
        {message.profileImageUrl ? (
          <AvatarImage src={message.profileImageUrl} alt="" />
        ) : null}
        <AvatarFallback className="text-[10px] font-medium">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-mono text-muted-foreground tabular-nums">
            {formatTime(message.timestamp)}
          </span>
          <span className="font-semibold text-foreground">
            {message.nickname}
          </span>
          {roleLabel && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {roleLabel}
            </Badge>
          )}
          {message.titleName && (
            <Badge
              variant="outline"
              className="h-5 px-1.5 text-[10px]"
              style={
                message.titleColor
                  ? {
                      borderColor: message.titleColor,
                      color: message.titleColor,
                    }
                  : undefined
              }
            >
              {message.titleName}
            </Badge>
          )}
          {message.badgeName && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              {message.badgeName}
            </Badge>
          )}
          {message.osType && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              {message.osType}
            </Badge>
          )}
          {(isDonation || isDonationType) && message.payAmount && (
            <Badge className="h-5 bg-amber-500 px-1.5 text-[10px] text-amber-50">
              {message.payAmount.toLocaleString("ko-KR")}원
            </Badge>
          )}
        </div>
        <p className="text-sm leading-relaxed break-all whitespace-pre-wrap text-foreground/90">
          {highlightMsg}
        </p>
      </div>
    </div>
  )
}

interface LiveHeroProps {
  ctx: ChzzkLiveContext
  messageCount: number
  donationCount: number
  totalDonation: number
}

function LiveHero({
  ctx,
  messageCount,
  donationCount,
  totalDonation,
}: LiveHeroProps) {
  const duration = ctx.openLive ? formatLiveDuration(ctx.openDate) : null
  const category = ctx.openLive
    ? formatLiveCategory(ctx.liveCategory, ctx.categoryType)
    : null
  const isBroadcasting = ctx.openLive

  return (
    <Card className="overflow-hidden border-primary/15">
      <div className="relative">
        {ctx.liveThumbnailUrl ? (
          <img
            src={ctx.liveThumbnailUrl}
            alt=""
            className="h-36 w-full object-cover md:h-44"
          />
        ) : (
          <div className="h-36 w-full bg-linear-to-br from-primary/20 via-muted to-background md:h-44" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-card via-card/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-4 md:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <Avatar size="lg" className="ring-2 ring-background">
              {ctx.channelImageUrl ? (
                <AvatarImage src={ctx.channelImageUrl} alt="" />
              ) : null}
              <AvatarFallback>
                {ctx.channelName?.slice(0, 1) ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-lg font-semibold tracking-tight md:text-xl">
                  {ctx.channelName ?? "채널"}
                </h2>
                {ctx.verifiedMark && (
                  <img
                    src="/icon_official_mark.png"
                    alt="인증 채널"
                    width={20}
                    height={20}
                    className="size-5 shrink-0"
                  />
                )}
                {isBroadcasting ? (
                  <Badge className="gap-1 bg-emerald-600 text-emerald-50">
                    <RiLiveLine className="size-3" />
                    LIVE
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    오프라인
                  </Badge>
                )}
              </div>
              {ctx.channelDescription && (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {ctx.channelDescription}
                </p>
              )}
            </div>
            <a
              href={chzzkLiveUrl(ctx.channelId)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "shrink-0"
              )}
            >
              <RiLinksLine data-icon="inline-start" />
              CHZZK에서 보기
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            {category && (
              <Badge variant="secondary" className="gap-1">
                <RiHashtag className="size-3" />
                {category}
              </Badge>
            )}
            {ctx.tags?.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                #{tag}
              </Badge>
            ))}
            {ctx.adult && (
              <Badge variant="destructive" className="text-xs">
                19+
              </Badge>
            )}
            {ctx.krOnlyViewing && (
              <Badge variant="outline" className="gap-1 text-xs">
                <RiGlobalLine className="size-3" />
                KR 전용
              </Badge>
            )}
          </div>
        </div>
      </div>
      <CardContent className="flex flex-wrap gap-2 border-t bg-muted/30 py-3">
        {ctx.openLive && typeof ctx.concurrentUserCount === "number" && (
          <Badge variant="secondary" className="gap-1 font-mono tabular-nums">
            <RiEyeLine className="size-3.5" />
            {ctx.concurrentUserCount.toLocaleString("ko-KR")} 시청
          </Badge>
        )}
        {typeof ctx.followerCount === "number" && (
          <Badge variant="secondary" className="gap-1 font-mono tabular-nums">
            <RiHeart3Line className="size-3.5" />
            {ctx.followerCount.toLocaleString("ko-KR")} 팔로워
          </Badge>
        )}
        <Badge variant="secondary" className="gap-1 font-mono tabular-nums">
          <RiChat3Line className="size-3.5" />
          {messageCount.toLocaleString("ko-KR")} 채팅
        </Badge>
        {donationCount > 0 && (
          <Badge variant="secondary" className="gap-1 font-mono tabular-nums">
            후원 {donationCount.toLocaleString("ko-KR")}건
          </Badge>
        )}
        {totalDonation > 0 && (
          <Badge className="gap-1 bg-amber-500 font-mono text-amber-50 tabular-nums">
            {totalDonation.toLocaleString("ko-KR")}원 후원
          </Badge>
        )}
        {duration && (
          <Badge variant="outline" className="gap-1 tabular-nums">
            <RiTimeLine className="size-3.5" />
            {duration}
          </Badge>
        )}
        {ctx.openLive && ctx.liveId != null && (
          <Badge
            variant="outline"
            className="font-mono text-[10px] text-muted-foreground tabular-nums"
          >
            live #{ctx.liveId}
          </Badge>
        )}
        <Badge
          variant="outline"
          className="font-mono text-[10px] text-muted-foreground tabular-nums"
        >
          chat {ctx.chatChannelId}
        </Badge>
      </CardContent>
      {ctx.openLive && ctx.liveTitle ? (
        <CardContent className="border-t py-3 text-sm text-muted-foreground">
          {ctx.liveTitle}
        </CardContent>
      ) : null}
    </Card>
  )
}

export function ChzzkViewer() {
  const [queryChannel] = useState(() => parseQueryChannelId())
  const [inputChannelId, setInputChannelId] = useState(() => queryChannel ?? "")
  const [search, setSearch] = useState("")
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)

  const [serverLogEnabled, setServerLogEnabled] = useState(
    () =>
      typeof sessionStorage !== "undefined" && hasPersistedBackgroundCollector()
  )
  const [serverLogPath, setServerLogPath] = useState(
    "chzzk-{channel}-{date}.txt"
  )
  const [autoRotate, setAutoRotate] = useState(true)
  const [backgroundCollect, setBackgroundCollect] = useState(true)
  const [netscapeCookies, setNetscapeCookies] = useState(() =>
    typeof sessionStorage !== "undefined" ? readNetscapeCookieText() : ""
  )
  const [applyCookies, setApplyCookies] = useState(() =>
    typeof sessionStorage !== "undefined" ? isApplyCookiesEnabled() : false
  )

  const parsedCookieCount = useMemo(() => {
    const text = netscapeCookies.trim()
    if (!text) return 0
    return parseNetscapeCookies(text).length
  }, [netscapeCookies])

  const serverLogConfig: ServerLogConfig | null = useMemo(() => {
    const hasPersisted = hasPersistedBackgroundCollector()
    if (!serverLogEnabled && !hasPersisted) return null
    // Force background mode in the *config we pass* whenever a collector is
    // persisted (or will be). This ensures that clicking "연결" will go
    // through the bg branch, attach the client, and surface the collector in
    // UI (so the stop button is correctly labeled "화면 연결 중지" and the
    // full-stop button is visible).
    const useBackground = backgroundCollect || hasPersisted
    return {
      pathTemplate: serverLogPath,
      autoRotate,
      background: useBackground,
    }
  }, [serverLogEnabled, serverLogPath, autoRotate, backgroundCollect])

  const {
    status,
    error,
    messages,
    chatChannelId,
    liveContext,
    serverHost,
    serverLog,
    backgroundCollectActive,
    start,
    stop,
    stopBackgroundCollect,
    clear,
  } = useChzzkChat({
    channelId: queryChannel,
    serverLog: serverLogConfig,
  })

  // Derived UI state: force "on" in the form when a collector (bg or push log)
  // is known to hook, or a bg collector is persisted. This keeps labels and
  // the "서버 수집 중지" button visible, and ensures "중지" is not shown while
  // server-side collection is still running.
  const hasPersistedNow = hasPersistedBackgroundCollector()
  const serverLogUiEnabled =
    serverLogEnabled ||
    backgroundCollectActive ||
    !!serverLog ||
    hasPersistedNow
  const backgroundCollectUi = backgroundCollect || backgroundCollectActive

  const isLive =
    status === "connected" ||
    status === "connecting" ||
    status === "reconnecting" ||
    status === "resolving"

  const configLocked = isLive || backgroundCollectActive

  const filteredMessages = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return messages
    return messages.filter(
      (m) =>
        m.msg.toLowerCase().includes(q) || m.nickname.toLowerCase().includes(q)
    )
  }, [messages, search])

  const totalDonation = useMemo(
    () =>
      messages.reduce(
        (acc, m) => acc + (m.payAmount && m.payAmount > 0 ? m.payAmount : 0),
        0
      ),
    [messages]
  )

  const donationCount = useMemo(
    () => messages.filter((m) => m.payAmount && m.payAmount > 0).length,
    [messages]
  )

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      void start(inputChannelId)
    },
    [inputChannelId, start]
  )

  const handleDownload = useCallback(() => {
    if (messages.length === 0) return
    const body = messages.map((m) => formatChatLine(m) + "\n").join("")
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    a.href = url
    a.download = `chzzk-chat-${stamp}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [messages])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const handler = () => {
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight
      stickToBottomRef.current = distance < 80
    }
    node.addEventListener("scroll", handler)
    return () => node.removeEventListener("scroll", handler)
  }, [])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    if (!stickToBottomRef.current) return
    node.scrollTop = node.scrollHeight
  }, [filteredMessages.length])

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            CHZZK 채팅 백업기
          </h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <RiShieldCheckLine className="size-3" />
            실시간 수집
          </Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          라이브 채팅을 실시간으로 수집하고, 방송·채널 정보와 함께 .txt 로그로
          저장합니다.
        </p>
      </header>

      {liveContext && (
        <LiveHero
          ctx={liveContext}
          messageCount={messages.length}
          donationCount={donationCount}
          totalDonation={totalDonation}
        />
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Card className="h-fit min-w-0 overflow-hidden lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>채널 연결</CardTitle>
            <CardDescription>
              CHZZK 채널 ID로 라이브 채팅에 연결합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit}>
              <FieldGroup>
                <Field orientation="responsive">
                  <FieldLabel htmlFor="channel-id" className="min-w-32">
                    채널 ID
                  </FieldLabel>
                  <Input
                    id="channel-id"
                    name="channel-id"
                    placeholder="affa78deac0b23d2046b8ed4856c1e62"
                    autoComplete="off"
                    spellCheck={false}
                    value={inputChannelId}
                    onChange={(e) => setInputChannelId(e.target.value)}
                    disabled={isLive}
                  />
                </Field>
                {chatChannelId && !liveContext && (
                  <FieldDescription>
                    chatChannelId:{" "}
                    <span className="font-mono tabular-nums">
                      {chatChannelId}
                    </span>
                  </FieldDescription>
                )}
                <Field
                  orientation="responsive"
                  className="@md/field-group:items-start"
                >
                  <FieldLabel
                    htmlFor="netscape-cookies"
                    className="min-w-32 shrink-0"
                  >
                    쿠키 (Netscape)
                  </FieldLabel>
                  <Textarea
                    id="netscape-cookies"
                    name="netscape-cookies"
                    placeholder={
                      "# Netscape HTTP Cookie File\n" +
                      ".chzzk.naver.com\tTRUE\t/\tFALSE\t0\tNID\t..."
                    }
                    autoComplete="off"
                    spellCheck={false}
                    rows={5}
                    value={netscapeCookies}
                    onChange={(e) => {
                      const next = e.target.value
                      setNetscapeCookies(next)
                      persistNetscapeCookieText(next)
                    }}
                    disabled={configLocked}
                    className="field-sizing-fixed max-h-40 min-h-20 w-full min-w-0 resize-y overflow-y-auto font-mono text-xs break-all"
                  />
                </Field>
                {parsedCookieCount > 0 && (
                  <FieldDescription>
                    {parsedCookieCount}개 쿠키 파싱됨
                  </FieldDescription>
                )}
                <Field orientation="horizontal" className="items-start">
                  <Switch
                    id="apply-cookies"
                    size="sm"
                    checked={applyCookies}
                    onCheckedChange={(value) => {
                      const on = value === true
                      setApplyCookies(on)
                      setApplyCookiesEnabled(on)
                    }}
                    disabled={configLocked || parsedCookieCount === 0}
                  />
                  <FieldLabel
                    htmlFor="apply-cookies"
                    className="flex flex-col items-start gap-1"
                  >
                    <span>요청에 쿠키 적용</span>
                    <FieldDescription>
                      CHZZK API 프록시·서버 백그라운드 수집 요청에 Cookie 헤더를
                      붙입니다. 브라우저 웹소켓에는 적용되지 않습니다.
                    </FieldDescription>
                  </FieldLabel>
                </Field>
                <Separator />
                <Field orientation="horizontal" className="items-start">
                  <Checkbox
                    id="server-log-enabled"
                    checked={serverLogUiEnabled}
                    onCheckedChange={(value) => {
                      if (backgroundCollectActive) return
                      setServerLogEnabled(value === true)
                    }}
                    disabled={isLive || backgroundCollectActive}
                  />
                  <FieldLabel
                    htmlFor="server-log-enabled"
                    className="flex flex-col items-start gap-1"
                  >
                    <span className="flex items-center gap-1.5">
                      <RiFileTextLine className="size-4" />
                      서버 파일 백업
                    </span>
                    <FieldDescription>
                      서버 디스크에 .txt 로그를 저장합니다.
                    </FieldDescription>
                  </FieldLabel>
                </Field>
                {serverLogUiEnabled && (
                  <>
                    <Field orientation="horizontal" className="items-start">
                      <Switch
                        id="background-collect"
                        size="sm"
                        checked={backgroundCollectUi}
                        onCheckedChange={(value) => {
                          if (backgroundCollectActive) return
                          setBackgroundCollect(value === true)
                        }}
                        disabled={isLive || backgroundCollectActive}
                      />
                      <FieldLabel
                        htmlFor="background-collect"
                        className="flex flex-col items-start gap-1"
                      >
                        <span>서버 백그라운드 수집</span>
                        <FieldDescription>
                          서버가 CHZZK에 직접 연결해 저장합니다. 새로고침·탭
                          종료 후에도 수집이 계속되며, 아래 &quot;수집
                          중지&quot;로 끌 수 있습니다.
                        </FieldDescription>
                      </FieldLabel>
                    </Field>
                    <Field orientation="responsive">
                      <FieldLabel
                        htmlFor="server-log-path"
                        className="min-w-32"
                      >
                        저장 경로
                      </FieldLabel>
                      <Input
                        id="server-log-path"
                        name="server-log-path"
                        placeholder="chzzk-{channel}-{date}.txt"
                        autoComplete="off"
                        spellCheck={false}
                        value={serverLogPath}
                        onChange={(e) => setServerLogPath(e.target.value)}
                        disabled={configLocked}
                        className="font-mono text-xs"
                      />
                    </Field>
                    <FieldDescription>
                      <code className="font-mono">{"{date}"}</code>,{" "}
                      <code className="font-mono">{"{channel}"}</code> 토큰 지원
                    </FieldDescription>
                    <Field orientation="horizontal" className="items-start">
                      <Switch
                        id="auto-rotate"
                        size="sm"
                        checked={autoRotate}
                        onCheckedChange={(value) =>
                          setAutoRotate(value === true)
                        }
                        disabled={configLocked}
                      />
                      <FieldLabel
                        htmlFor="auto-rotate"
                        className="flex flex-col items-start gap-1"
                      >
                        <span className="flex items-center gap-1.5">
                          <RiRefreshLine className="size-4" />
                          자정마다 파일 회전
                        </span>
                      </FieldLabel>
                    </Field>
                  </>
                )}
                <div className="flex flex-col gap-2">
                  {!isLive ? (
                    <Button
                      type="submit"
                      disabled={!inputChannelId.trim()}
                      className="w-full"
                    >
                      <RiPlayLine data-icon="inline-start" />
                      연결
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={stop}
                      className="w-full"
                    >
                      <RiStopLine data-icon="inline-start" />
                      {backgroundCollectActive ? "화면 연결 중지" : "중지"}
                    </Button>
                  )}
                  {backgroundCollectActive && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void stopBackgroundCollect()}
                      className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      <RiStopLine data-icon="inline-start" />
                      서버 수집 중지
                    </Button>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={clear}
                      disabled={messages.length === 0}
                      className="flex-1"
                    >
                      <RiRestartLine data-icon="inline-start" />
                      비우기
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDownload}
                      disabled={messages.length === 0}
                      className="flex-1"
                    >
                      <RiDownloadLine data-icon="inline-start" />
                      저장
                    </Button>
                  </div>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "size-2.5 rounded-full",
                    STATUS_DOT[status],
                    (status === "connecting" ||
                      status === "reconnecting" ||
                      status === "resolving") &&
                      "animate-pulse"
                  )}
                />
                <CardTitle className="flex items-center gap-2 text-base">
                  {status === "connected" ? (
                    <RiRecordCircleLine className="size-4 text-emerald-500" />
                  ) : status === "connecting" || status === "resolving" ? (
                    <Spinner className="size-4" />
                  ) : (
                    <RiChat3Line className="size-4" />
                  )}
                  {STATUS_LABELS[status]}
                </CardTitle>
                {serverHost && (
                  <Badge
                    variant="outline"
                    className="h-5 gap-1 px-2 font-mono text-[10px] text-muted-foreground tabular-nums"
                    title={`WebSocket: ${serverHost}`}
                  >
                    <RiServerLine className="size-3" />
                    {serverHost}
                  </Badge>
                )}
                {serverLog && (
                  <Badge
                    variant="outline"
                    className="h-5 gap-1 px-2 font-mono text-[10px] text-muted-foreground tabular-nums"
                    title={`${serverLog.baseDir}/${serverLog.resolvedPath}${
                      backgroundCollectActive && status === "disconnected"
                        ? " · 서버 백그라운드 수집 중"
                        : ""
                    }`}
                  >
                    <RiFileTextLine className="size-3" />
                    {serverLog.resolvedPath}
                    {backgroundCollectActive &&
                      status === "disconnected" &&
                      " (백그라운드)"}
                  </Badge>
                )}
              </div>
              {search ? (
                <Badge variant="secondary" className="text-xs tabular-nums">
                  {filteredMessages.length} / {messages.length}
                </Badge>
              ) : null}
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="relative">
              <RiSearchLine
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="검색"
                placeholder="닉네임 또는 메시지 검색"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Separator />
            <ScrollArea className="min-h-[50vh] flex-1 rounded-2xl border bg-background/50">
              <div
                ref={scrollRef}
                className="flex max-h-[min(70vh,720px)] min-h-[50vh] flex-col gap-0.5 overflow-y-auto p-2"
              >
                {filteredMessages.length === 0 ? (
                  <Empty className="min-h-64 border-0">
                    <EmptyHeader>
                      <EmptyTitle>아직 채팅이 없습니다</EmptyTitle>
                      <EmptyDescription>
                        {status === "connected"
                          ? "메시지가 도착하면 여기에 표시됩니다."
                          : "채널 ID를 입력하고 연결을 시작하세요."}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  filteredMessages.map((m, idx) => (
                    <ChatItemRow
                      key={m.msgId ?? `${m.msgTimeMs}-${idx}-${m.nickname}`}
                      message={m}
                      highlight={search}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RiUserLine className="size-3" />
              프로필·후원·역할 뱃지는 CHZZK API 메타데이터를 반영합니다. 종료 전
              .txt 저장을 권장합니다.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default ChzzkViewer
