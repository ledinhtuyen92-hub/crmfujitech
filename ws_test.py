import asyncio, logging, sys
sys.path.insert(0, r"g:\(A) CAI LAP TRINH\Projects\crmfujitech")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

SESSION_ID = "3b51b523-7925-4d84-9cd3-30234af44005"
TOKEN = "ldt_ebc0cecaa04a41fe935f522ed19fd8e4_Zy3hBQOudCEe2JdkEptsHj49v8wN7TOrxBmrIF12bug"
WS_URL = f"ws://localhost:8000/ws/live_sessions/{SESSION_ID}/device/"

from live_studio.execution.audio_player import DummyAudioPlayer
from live_studio.execution.avatar_engine import DummyAvatarEngine
from live_studio.main import LiveStudioApp

results = {}

async def run():
    app = LiveStudioApp(ws_url=WS_URL, token=TOKEN, session_id=SESSION_ID,
        audio_player=DummyAudioPlayer(), avatar_engine=DummyAvatarEngine())

    original = app._on_message
    received = []
    async def patched(envelope):
        print(f"MSG: type={envelope.get('type')} name={envelope.get('name')}")
        received.append(envelope)
        await original(envelope)
    app._on_message = patched

    print(f"CONNECTING: {WS_URL}")
    try:
        await asyncio.wait_for(app.start(), timeout=6.0)
    except asyncio.TimeoutError:
        print("TIMEOUT after 6s (expected)")
        results["timeout"] = True
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}")
        results["error"] = str(e)
    finally:
        results["final_state"] = app.state.state
        results["msg_count"] = len(received)
        results["msgs"] = received
        await app.stop()

asyncio.run(run())
print()
print("=== RESULTS ===")
print("final_state:", results.get("final_state"))
print("error:", results.get("error"))
print("msg_count:", results.get("msg_count", 0))
for m in results.get("msgs", []):
    print(f"  MSG type={m.get('type')} name={m.get('name')} seq={m.get('sequence_number')}")
