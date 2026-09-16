"""
No-network stand-in for indictrans_backend.py — lets the translation
boundary in the Node backend (backend/src/routes/visits.js) be built and
tested without downloading IndicTrans2's models.

Returns the input text unchanged, tagged so it's obvious in testing that
this is NOT a real translation — same "mock" pattern as
voice-service/app/mock_transcribe.py.
"""
from __future__ import annotations


def translate(text: str, source: str, target: str) -> str:
    if source == target:
        return text
    return f"[mock {source}->{target}] {text}"
