"""
No-network stand-in for whisper_backend.py — lets the rest of the pipeline
(upload, the mic button wiring, the "paste this into the chat box" flow) be
built and tested without a model download or a working microphone.
"""
from __future__ import annotations

from typing import Optional


def transcribe(audio_bytes: bytes, language: Optional[str] = None) -> dict:
    return {
        "text": "[mock] I have had a fever since yesterday",
        "language_detected": language or "en",
        "language_probability": 0.99,
    }
