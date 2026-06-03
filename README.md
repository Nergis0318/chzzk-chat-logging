# CHZZK 채팅 백업기

Astro + React + shadcn/ui 기반의 셀프 호스팅 CHZZK 채팅 백업기.
방송의 라이브 채팅을 실시간으로 수집하여 .txt 로그로 저장합니다.

## 기능

- 채널 ID로 CHZZK 라이브 채팅에 연결 (anonymous READ 핸드쉐이크)
- `kr-ss1`~`kr-ss10` WebSocket 게이트웨이에 자동 분산 접속
- 브라우저 메모리에 채팅 표시, 검색, 후원금 합산
- 브라우저에서 .txt 파일로 직접 다운로드
- **서버 디스크에 .txt 백업** (`/api/log/*`) — 템플릿 경로 입력 가능
- **서버 백그라운드 수집** (`/api/collect/*`) — 서버가 CHZZK WebSocket에 직접 연결해 저장 (브라우저 릴레이 불필요)
- **자정 자동 회전** — `autoRotate` 토글로 날짜별 파일 분리
- `?channel=...` 쿼리 파라미터로 채널 자동 연결

## 개발

```bash
bun install
bun run dev      # http://localhost:4321
bun run build    # dist/ (Node standalone 서버)
bun run typecheck
bun run lint
```

## 환경 변수

| 이름           | 기본값       | 설명                                                                                                           |
| -------------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| `LOG_BASE_DIR` | `<cwd>/logs` | 서버 파일 백업이 저장되는 기본 디렉터리. 클라이언트가 입력한 경로 템플릿은 모두 이 디렉터리 하위로 제한됩니다. |

예시:

```bash
LOG_BASE_DIR=/var/log/chzzk bun run start
```

## 경로 템플릿

UI의 "서버 파일 백업" 섹션에서 다음 토큰을 사용한 템플릿을 입력할 수 있습니다.

- `{date}` — `YYYY-MM-DD`. 자정 회전 시 자동 갱신됩니다 (필수).
- `{channel}` — 입력한 채널 ID. sanitize됩니다 (선택).

예시:

- `chzzk-{channel}-{date}.txt` → `chzzk-affa78...-2026-06-02.txt`
- `logs/{date}/chat.txt` → `logs/2026-06-02/chat.txt`
- `{date}/chzzk.txt` → `2026-06-02/chzzk.txt`

`LOG_BASE_DIR`을 벗어나는 경로(상대 `..`, 절대 경로 우회)는 거부됩니다.

## 자정 회전

서버는 30초마다 활성 세션의 로컬 날짜가 바뀌었는지 확인하고, `autoRotate`가 켜진
세션은 현재 파일을 닫고 같은 템플릿의 새 파일을 엽니다. 회전 시점의 큐잉된
쓰기는 모두 새 파일로 정상 적용됩니다.

## 서버 백그라운드 수집

UI에서 **서버 파일 백업**과 **서버 백그라운드 수집**을 켜면, Node 서버가 CHZZK 채팅 WebSocket에 직접 연결하고
`append` API를 거치지 않고 `log-store`에 바로 씁니다. 브라우저는 화면 표시용으로만 WebSocket을 유지합니다.

**백그라운드 수집은 페이지를 새로고침하거나 탭을 닫아도 서버에서 계속됩니다.** 화면 연결만 끊으려면
「화면 연결 중지」, 파일 기록까지 멈추려면 「서버 수집 중지」를 사용하세요. 같은 채널로 다시 열면
이미 돌고 있는 수집기에 자동으로 붙습니다.

백그라운드 수집을 끄면 이전 방식(브라우저 → `/api/log/append`)으로 저장합니다.

## API

| 메서드 | 경로                            | 설명                                                                |
| ------ | ------------------------------- | ------------------------------------------------------------------- |
| `POST` | `/api/collect/start`            | 백그라운드 수집 시작, `{ channelId, pathTemplate, autoRotate }`     |
| `POST` | `/api/collect/stop`             | 수집 중지, `{ collectorId }`                                        |
| `GET`  | `/api/collect/status?collectorId=...` | 수집기/세션 상태 조회                                         |
| `POST` | `/api/log/start`                | 세션 시작, `{ channelId, chatChannelId, pathTemplate, autoRotate }` |
| `POST` | `/api/log/append`               | 라인 배치 append, `{ sessionId, lines: string[] }`                  |
| `POST` | `/api/log/close`                | 세션 종료, `{ sessionId }`                                          |
| `GET`  | `/api/log/status?sessionId=...` | 세션/서버 상태 조회                                                 |
| `GET`  | `/api/live-status/:channelId`   | CHZZK `chatChannelId` 조회 (CORS 우회 프록시)                       |
