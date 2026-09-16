"""
MedListen — Voice / Speech-to-Text microservice.

Ported from a teammate's voice-module (SIH2026/voice-module/app/main.py).
Scope of THIS service only: take a recorded audio clip and return plain
text. It has no opinion about clinical history — the Node backend hands the
resulting text to the patient's chat input for them to review and send,
exactly like they had typed it themselves. Never auto-submitted.

Called internally by the Node backend (backend/src/routes/voice.js), not
exposed directly to the internet — nginx only proxies the Node backend's
port, so this service's own port never needs to be reachable from a phone.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import mock_transcribe

load_dotenv()

app = FastAPI(title="MedListen — Voice / Speech-to-Text")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

VALID_BACKENDS = {"auto", "whisper", "mock"}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15MB — generous for a couple minutes of compressed speech


def whisper_available() -> bool:
    from . import whisper_backend
    return whisper_backend.is_available()


def resolve_backend(requested: str) -> str:
    if requested == "auto":
        return "whisper" if whisper_available() else "mock"
    return requested


@app.get("/backends")
def list_backends():
    import os
    return {
        "whisper": {
            "available": whisper_available(),
            "model": os.environ.get("WHISPER_MODEL", "small"),
            "device": os.environ.get("WHISPER_DEVICE", "cpu"),
        },
        "mock": {"available": True},
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(default=None),
    backend: str = Form(default="auto"),
):
    if backend not in VALID_BACKENDS:
        raise HTTPException(400, f"backend must be one of {sorted(VALID_BACKENDS)}")

    resolved_backend = resolve_backend(backend)
    if resolved_backend == "whisper" and not whisper_available():
        raise HTTPException(
            400,
            "Whisper backend requested but not available — is faster-whisper installed? "
            "(pip install -r requirements.txt)",
        )

    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(400, "empty audio file")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, f"audio file too large ({len(raw)} bytes) — max {MAX_UPLOAD_BYTES} bytes")

    if resolved_backend == "mock":
        result = mock_transcribe.transcribe(raw, language)
    else:
        from . import whisper_backend
        try:
            result = whisper_backend.transcribe(raw, language)
        except Exception as exc:  # noqa: BLE001 - surface any backend failure as a clean 502, not a crash
            raise HTTPException(502, f"transcription error: {exc}") from exc

    return {"backend": resolved_backend, **result}


_static_dir = Path(__file__).resolve().parent.parent / "static"
if _static_dir.exists():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="static")
