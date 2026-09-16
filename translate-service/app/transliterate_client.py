"""
Thin client for transliterate-service — converts romanized (Latin-script)
text into native script before this service's own translation models ever
see it. See transliterate-service/README.md for why that's a separate
service (an incompatible Python/dependency stack) and romanization.py for
how "does this need transliterating at all" gets decided.
"""
from __future__ import annotations

import os

import requests

TRANSLITERATE_SERVICE_URL = os.environ.get("TRANSLITERATE_SERVICE_URL", "http://localhost:8030")
# Generous default: transliterate-service loads its model + per-language
# rescoring dictionaries lazily on its FIRST request, which alone takes
# roughly 60-90s (observed live) — a short timeout would abort that first
# real call before it ever finishes, silently falling back to untranslated
# text. Every call after that first one is fast (low hundreds of ms).
TRANSLITERATE_TIMEOUT_S = float(os.environ.get("TRANSLITERATE_TIMEOUT_S", "120"))


def is_available() -> bool:
    try:
        res = requests.get(f"{TRANSLITERATE_SERVICE_URL}/languages", timeout=2)
        return res.ok
    except requests.RequestException:
        return False


def transliterate(text: str, lang: str) -> str:
    """Returns the transliterated text, or the original text unchanged if
    the service is unreachable or errors — transliteration is a quality
    improvement, not something that should hard-fail an otherwise-working
    translation call over."""
    try:
        res = requests.post(
            f"{TRANSLITERATE_SERVICE_URL}/transliterate",
            json={"text": text, "lang": lang},
            timeout=TRANSLITERATE_TIMEOUT_S,
        )
        if not res.ok:
            return text
        return res.json().get("transliterated", text)
    except requests.RequestException:
        return text
