import asyncio
import json
import websockets
import datetime
import logging
import random
import aiohttp
import aiofiles


logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)


CHAT_SERVER_MAX = 24
CHAT_LIB_VER = "4.11.0"


def parse_chat_payload(chat):
    """Live (array) and history (messageList) shapes from HAR 2026-06."""
    msg_time_ms = chat.get("msgTime") or chat.get("messageTime")
    msg = chat.get("msg") or chat.get("content")
    if not msg_time_ms or not msg:
        return None

    profile_json = json.loads(chat.get("profile") or "{}")
    nickname = profile_json.get("nickname", "익명")

    extras_json = json.loads(chat.get("extras") or "{}")
    os_type = extras_json.get("osType")
    pay_amount = extras_json.get("payAmount")

    dt_object = datetime.datetime.fromtimestamp(msg_time_ms / 1000)
    formatted_time = dt_object.strftime("%Y-%m-%d %H:%M:%S")
    os_info = f" ({os_type})" if os_type else ""

    if pay_amount and pay_amount > 0:
        return f"[{formatted_time}] {nickname}{os_info} ({pay_amount}원 후원): {msg}\n"
    return f"[{formatted_time}] {nickname}{os_info}: {msg}\n"


def extract_chats_from_frame(message):
    bdy = message.get("bdy")
    if isinstance(bdy, list):
        return bdy
    if isinstance(bdy, dict) and isinstance(bdy.get("messageList"), list):
        return bdy["messageList"]
    return []


async def connect_to_websocket(channel_id, file_stream):
    uri = f"wss://kr-ss{random.randint(1, CHAT_SERVER_MAX)}.chat.naver.com/chat"
    print(f"웹소켓 URI: {uri}")

    try:
        # 웹소켓 서버에 연결합니다.
        async with websockets.connect(
            uri,
            user_agent_header="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
            origin="https://chzzk.naver.com",
        ) as websocket:
            print(f"웹소켓 연결 성공: {uri}")

            # 서버에 보낼 메시지 (예시)
            message_to_send = {
                "ver": "3",
                "cmd": 100,
                "svcid": "game",
                "cid": channel_id,
                "sid": None,
                "bdy": {
                    "uid": None,
                    "devType": 2001,
                    "accTkn": "",
                    "auth": "READ",
                    "libVer": CHAT_LIB_VER,
                    "osVer": "Windows/10",
                    "devName": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "locale": "ko-KR",
                    "timezone": "Asia/Seoul",
                },
                "tid": 1,
            }
            await websocket.send(json.dumps(message_to_send))
            print(f"> 서버로 보낸 메시지: {message_to_send}")

            print(await websocket.recv())

            while True:
                message_str = await websocket.recv()
                message = json.loads(message_str)
                cmd = message.get("cmd")
                # PING / PONG (HAR: cmd 0 ↔ 10000)
                if cmd in (0, 10000):
                    if cmd == 0:
                        await websocket.send('{"ver": "2", "cmd": 10000}')
                    continue
                if cmd == 10100:
                    continue

                for chat in extract_chats_from_frame(message):
                    try:
                        log_message = parse_chat_payload(chat)
                        if not log_message:
                            continue
                        await file_stream.write(log_message)
                        await file_stream.flush()
                        print(log_message.strip())
                    except Exception:
                        continue

    except websockets.exceptions.ConnectionClosed as e:
        logging.warning(f"웹소켓 연결이 닫혔습니다: {e}")
    except Exception as e:
        logging.error(f"오류 발생: {e}", exc_info=True)


async def main():
    channel_id = input("채널 ID를 입력하세요 (예: affa78....): ")
    output_file = "chat.txt"

    api_url = (
        f"https://api.chzzk.naver.com/polling/v2/channels/{channel_id}/live-status"
    )

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(api_url) as response:
                response.raise_for_status()
                data = await response.json()
                content = data.get("content", {})
                chat_channel_id = content.get("chatChannelId")

                if not chat_channel_id:
                    print("라이브 중이 아니거나, chatChannelId를 찾을 수 없습니다.")
                    return

    except aiohttp.ClientError as e:
        logging.error(f"API 요청 중 오류 발생: {e}")
        return

    # 프로그램이 중단되지 않는 한, 연결이 끊어지면 5초 후 자동으로 재연결을 시도합니다.
    async with aiofiles.open(output_file, "a", encoding="utf-8") as f:
        while True:
            await connect_to_websocket(chat_channel_id, f)
            logging.info("5초 후 재연결을 시도합니다...")
            await asyncio.sleep(5)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n프로그램을 종료합니다.")
