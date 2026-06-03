# chzzk-chat-logging

CHZZK 라이브 채팅을 실시간으로 수집하고 .txt 로그로 저장하는 도구입니다.

## 기능

- **실시간 채팅 수집** — CHZZK 라이브 스트림의 채팅을 실시간으로 가져옵니다
- **서버 백그라운드 수집** — 브라우저를 닫아도 서버가 계속 수집합니다
- **파일 로그 저장** — 채팅을 .txt 파일로 저장하고 자정마다 자동 회전합니다
- **쿠키 인증** — Netscape 형식 쿠키로 인증된 접근을 지원합니다
- **채팅 검색** — 닉네임 또는 메시지 내용으로 필터링합니다
- **다운로드** — 수집된 채팅을 로컬에 .txt로 저장합니다
- **방송 정보 표시** — 시청자 수, 팔로워, 후원 내역을 보여줍니다

## 설치

### 사전 요구사항

- [Bun](https://bun.sh/) v1.0 이상
- Node.js 22.12.0 이상

### 방법 1: 소스에서 실행

```bash
git clone https://github.com/your-username/chzzk-chat-logging.git
cd chzzk-chat-logging
bun install
bun run dev
```

브라우저에서 `http://localhost:4321`을 엽니다.

### 방법 2: Docker

```bash
docker build -t chzzk-chat-logging .
docker run -p 4321:4321 chzzk-chat-logging
```

## 사용법

1. CHZZK에서 채널 페이지를 열고 URL에서 채널 ID를 복사합니다
   - 예: `https://chzzk.naver.com/live/affa78deac0b23d2046b8ed4856c1e62`
   - 채널 ID: `affa78deac0b23d2046b8ed4856c1e62`
2. 채널 ID를 입력하고 **연결**을 클릭합니다
3. 채팅이 실시간으로 표시됩니다
4. **저장** 버튼으로 로컬에 다운로드하거나, **서버 파일 백업**을 활성화하여 서버에 저장합니다

### 서버 백그라운드 수집

서버 백그라운드 수집을 활성화하면:

- 브라우저를 닫아도 수집이 계속됩니다
- 새 탭에서 같은 채널에 연결하면 기존 수집에 연결됩니다
- **서버 수집 중지** 버튼으로 중지합니다

### 쿠키 사용 (선택)

로그인이 필요한 채널의 경우:

1. 브라우저 개발자 도구에서 CHZZK 쿠키를 Netscape 형식으로 내보냅니다
2. 쿠키 입력란에 붙여넣습니다
3. **요청에 쿠키 적용**을 활성화합니다

## 명령어

| 명령어              | 설명               |
| ------------------- | ------------------ |
| `bun run dev`       | 개발 서버 시작     |
| `bun run build`     | 프로덕션 빌드      |
| `bun run start`     | 프로덕션 서버 실행 |
| `bun run lint`      | 린트 실행          |
| `bun run format`    | 코드 포맷팅        |
| `bun run typecheck` | 타입 검사          |

## 라이선스

[AGPL-3.0](LICENSE)
