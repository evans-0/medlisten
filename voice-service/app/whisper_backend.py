"""
Local speech-to-text backend using faster-whisper (a CTranslate2
reimplementation of OpenAI's Whisper).

Ported from a teammate's voice-module (SIH2026/voice-module/app/whisper_backend.py).

The model is loaded once, lazily, on first use and kept in memory for the
life of the process — reloading a few-hundred-MB model on every request
would make each turn painfully slow. First use also triggers a one-time
download from Hugging Face if the model isn't already cached locally
(~/.cache/huggingface by default) — that needs network the first time only;
every request after that is fully offline. No audio of the patient's actual
voice ever leaves the machine after that.

Runs on CPU by default (WHISPER_DEVICE=cpu), not GPU — deliberately, so it
doesn't compete for VRAM with Ollama (running qwen2.5:14b + medgemma:4b for
the chat and OCR modules) on the same machine — see backend/README's note
on the two of those already being unable to coexist in 12GB of VRAM. Adding
a third GPU consumer would only make that worse. A short patient utterance
should transcribe in low single-digit seconds on CPU with the "small" model
on ordinary laptop hardware.
"""
from __future__ import annotations

import io
import os
from typing import Optional

_model = None  # lazy-loaded singleton — see module docstring


def _model_size() -> str:
    return os.environ.get("WHISPER_MODEL", "small")


def _device() -> str:
    return os.environ.get("WHISPER_DEVICE", "cpu")


def _compute_type() -> str:
    return os.environ.get("WHISPER_COMPUTE_TYPE", "int8")


def is_available() -> bool:
    """Only checks that the library is importable — not that the model is
    downloaded/cached, since that would mean either downloading it on every
    /backends poll or hitting the network needlessly. A real download
    failure surfaces as a clear error on the first actual transcription
    instead."""
    try:
        import faster_whisper  # noqa: F401
        return True
    except ImportError:
        return False


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel(_model_size(), device=_device(), compute_type=_compute_type())
    return _model


def transcribe(audio_bytes: bytes, language: Optional[str] = None) -> dict:
    model = _get_model()
    segments, info = model.transcribe(
        io.BytesIO(audio_bytes),
        language=language,  # None = auto-detect; Whisper is multilingual out of the box
        beam_size=5,
        vad_filter=True,  # skip silence/background noise instead of transcribing it
    )
    text = " ".join(seg.text.strip() for seg in segments).strip()
    return {
        "text": text,
        "language_detected": info.language,
        "language_probability": round(info.language_probability, 3),
    }
