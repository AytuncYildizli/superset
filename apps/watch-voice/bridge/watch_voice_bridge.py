#!/usr/bin/env python3
"""Local Superset Watch voice bridge.

POST audio/mp4 to /v1/watch/turns with a scoped bearer token. The bridge uses
Hermes' configured STT, proves Superset dispatch/accept with Yapitalism, invokes
a bounded Hermes one-shot, and returns the five-leg receipt envelope.
"""
from __future__ import annotations

import hmac
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def _env_override(new_name: str, legacy_name: str) -> str | None:
    """Prefer the yapitalism-era variable, honour the relayproof-era one."""
    return os.getenv(new_name) or os.getenv(legacy_name)


_CACHE_DIR = Path.home() / ".cache/superset-watch-voice"
_MANIFEST_DEFAULT = _CACHE_DIR / "yapitalism-manifest.json"
_MANIFEST_LEGACY = _CACHE_DIR / "relayproof-manifest.json"

# The checkout directory is still named `relayproof` (the Git repository has not
# been renamed); only the Python package inside it became `yapitalism`.
_SRC_OVERRIDE = _env_override("YAPITALISM_SRC", "RELAYPROOF_SRC")
YAPITALISM_SRC = Path(
    _SRC_OVERRIDE or "/Users/aytuncyildizli/hermes-workspace/projects/relayproof/src"
)
HERMES_REPO = Path(os.getenv("HERMES_REPO", "/Users/aytuncyildizli/.hermes/hermes-agent"))
HERMES_PYTHON = Path(os.getenv("HERMES_PYTHON", str(HERMES_REPO / "venv/bin/python")))
HERMES_BIN = os.getenv("HERMES_BIN", "hermes")

_MANIFEST_OVERRIDE = _env_override("YAPITALISM_MANIFEST", "RELAYPROOF_MANIFEST")
if _MANIFEST_OVERRIDE:
    MANIFEST = Path(_MANIFEST_OVERRIDE)
elif _MANIFEST_DEFAULT.exists():
    MANIFEST = _MANIFEST_DEFAULT
else:
    # A manifest provisioned before the rebrand is still valid and still 0600.
    # Falling back to it keeps an existing install working; an explicit override
    # is never second-guessed.
    MANIFEST = (
        _MANIFEST_LEGACY if _MANIFEST_LEGACY.exists() else _MANIFEST_DEFAULT
    )

MAX_AUDIO_BYTES = 8 * 1024 * 1024
STATE_DB = Path(os.getenv("WATCH_VOICE_STATE_DB", str(Path.home() / ".cache/superset-watch-voice/bridge.sqlite3")))
TURN_TTL_SECONDS = 24 * 60 * 60

sys.path.insert(0, str(YAPITALISM_SRC))
from yapitalism.adapters.superset import SupersetAdapter, SupersetConfig  # noqa: E402


def transcribe(audio_path: Path) -> str:
    helper = f'''import json,sys
sys.path.insert(0,{str(HERMES_REPO)!r})
from dotenv import load_dotenv
load_dotenv({str(Path.home()/'.hermes/.env')!r}, override=True)
from tools.transcription_tools import transcribe_audio
r=transcribe_audio({str(audio_path)!r})
print(json.dumps({{"success":r.get("success"),"transcript":r.get("transcript"),"provider":r.get("provider"),"model":r.get("model"),"error":r.get("error")}}))
'''
    cp = subprocess.run([str(HERMES_PYTHON), "-c", helper], capture_output=True, text=True, timeout=180)
    if cp.returncode != 0:
        raise RuntimeError("stt_process_failed")
    try:
        result = json.loads(cp.stdout.strip().splitlines()[-1])
    except (IndexError, json.JSONDecodeError) as exc:
        raise RuntimeError("stt_invalid_response") from exc
    transcript = result.get("transcript")
    if not result.get("success") or not isinstance(transcript, str) or not transcript.strip():
        raise RuntimeError("stt_failed")
    return transcript.strip()


def prove_superset(turn_id: uuid.UUID) -> None:
    adapter = SupersetAdapter(SupersetConfig.from_manifest(MANIFEST))
    baseline = adapter.snapshot(max_lines=1000)
    marker_hex = uuid.uuid4().hex.upper()
    # Must match _validate_canary in yapitalism.adapters.superset exactly, or the
    # adapter rejects the canary before dispatch. The prefix is split across the
    # printf arguments so the literal marker never appears in the submitted text.
    marker = "YAPITALISM_ACK_" + marker_hex
    command = "printf 'YAPITALISM_ACK_%s%s\\n' '" + marker_hex[:16] + "' '" + marker_hex[16:] + "'"
    token = f"watch-{turn_id.hex}"
    dispatched = adapter.dispatch(command, expected_revision=baseline.revision, client_token=token, confirm=True)
    if not dispatched.dispatched:
        raise RuntimeError("superset_dispatch_failed")
    accepted = adapter.await_canary(
        marker,
        command_id=token,
        baseline_revision=baseline.revision,
        baseline_text=baseline.text,
        submitted_text=command,
        timeout=8.0,
    )
    if not accepted.observed:
        raise RuntimeError("superset_accept_failed")


def run_agent(transcript: str) -> str:
    prompt = (
        "You are answering a foreground Apple Watch voice turn from Aytunc. "
        "Reply in concise Turkish unless the request clearly uses another language. "
        "Do not perform external side effects; answer or explain the next safe step. "
        "User said:\n" + transcript
    )
    cp = subprocess.run(
        [HERMES_BIN, "-z", prompt, "-t", "web"],
        cwd=str(Path(__file__).resolve().parents[3]),
        capture_output=True,
        text=True,
        timeout=240,
    )
    if cp.returncode != 0 or not cp.stdout.strip():
        raise RuntimeError("agent_failed")
    return cp.stdout.strip()[-6000:]


def initialize_turn_store() -> None:
    STATE_DB.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(STATE_DB) as db:
        db.execute("CREATE TABLE IF NOT EXISTS turns (id TEXT PRIMARY KEY, created_at REAL NOT NULL, http_status INTEGER, response_json TEXT)")
        db.execute("DELETE FROM turns WHERE created_at < ?", (time.time() - TURN_TTL_SECONDS,))
    os.chmod(STATE_DB, 0o600)


def reserve_turn(turn_id: uuid.UUID) -> tuple[str, int | None, dict | None]:
    with sqlite3.connect(STATE_DB, timeout=5) as db:
        try:
            db.execute("INSERT INTO turns(id, created_at) VALUES (?, ?)", (str(turn_id), time.time()))
            return "reserved", None, None
        except sqlite3.IntegrityError:
            row = db.execute("SELECT http_status, response_json FROM turns WHERE id = ?", (str(turn_id),)).fetchone()
    if not row or row[0] is None or row[1] is None:
        return "inflight", None, None
    return "cached", int(row[0]), json.loads(row[1])


def finish_turn(turn_id: uuid.UUID, http_status: int, payload: dict) -> None:
    with sqlite3.connect(STATE_DB, timeout=5) as db:
        db.execute(
            "UPDATE turns SET http_status = ?, response_json = ? WHERE id = ?",
            (http_status, json.dumps(payload, ensure_ascii=False), str(turn_id)),
        )


class Handler(BaseHTTPRequestHandler):
    server_version = "SupersetWatchVoice/0.1"

    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_error(404)
            return
        self.respond(200, {"ok": True, "service": "superset-watch-voice"})

    def do_POST(self) -> None:
        if self.path != "/v1/watch/turns":
            self.send_error(404)
            return
        expected = os.getenv("WATCH_VOICE_TOKEN", "")
        supplied = self.headers.get("Authorization", "")
        if not expected or not hmac.compare_digest(supplied, f"Bearer {expected}"):
            self.respond(401, {"error": "unauthorized"})
            return
        try:
            turn_id = uuid.UUID(self.headers.get("X-Turn-ID", ""))
            idempotency_id = uuid.UUID(self.headers.get("Idempotency-Key", ""))
            if idempotency_id != turn_id:
                raise ValueError
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_AUDIO_BYTES:
                self.respond(413, {"error": "invalid_audio_size"})
                return
            if self.headers.get_content_type() not in {"audio/mp4", "audio/m4a", "audio/x-m4a"}:
                self.respond(415, {"error": "invalid_content_type"})
                return
        except (ValueError, TypeError):
            self.respond(400, {"error": "invalid_turn"})
            return
        audio = self.rfile.read(length)
        state, cached_status, cached_payload = reserve_turn(turn_id)
        if state == "cached":
            self.respond(cached_status or 200, cached_payload or {"error": "cached_response_missing"})
            return
        if state == "inflight":
            self.respond(409, {"error": "turn_in_progress", "turnID": str(turn_id)})
            return
        try:
            with tempfile.TemporaryDirectory(prefix="watch-voice-") as directory:
                path = Path(directory) / "turn.m4a"
                path.write_bytes(audio)
                transcript = transcribe(path)
            prove_superset(turn_id)
            final_text = run_agent(transcript)
            payload = {
                "turnID": str(turn_id),
                "transcript": transcript,
                "finalText": final_text,
                "receipts": ["capture", "dispatch", "accept", "work", "deliver"],
            }
            finish_turn(turn_id, 200, payload)
            self.respond(200, payload)
        except RuntimeError as exc:
            reason = re.sub(r"[^a-z0-9_]", "", str(exc).lower()) or "turn_failed"
            payload = {"error": reason, "turnID": str(turn_id)}
            finish_turn(turn_id, 502, payload)
            self.respond(502, payload)

    def log_message(self, format: str, *args: object) -> None:
        print(json.dumps({"client": self.client_address[0], "message": format % args}))

    def respond(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    if not os.getenv("WATCH_VOICE_TOKEN"):
        raise SystemExit("WATCH_VOICE_TOKEN is required")
    initialize_turn_store()
    server = ThreadingHTTPServer(("127.0.0.1", int(os.getenv("WATCH_VOICE_PORT", "18787"))), Handler)
    print(json.dumps({"ok": True, "listen": "127.0.0.1", "port": server.server_port}))
    server.serve_forever()


if __name__ == "__main__":
    main()
