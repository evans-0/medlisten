"""
Detects whether a non-English message is actually typed in Latin script
(romanized) rather than the visit's native script — e.g. a Tamil patient
typing "Koormaiana vali" instead of "கூர்மையான வலி" because their phone
has no Tamil keyboard. Very common in practice; silently breaks
translation if not handled (see transliterate-service/README.md for the
live example that surfaced this).
"""
from __future__ import annotations

# Below this fraction of a message's letters being Latin (ASCII a-z/A-Z),
# treat it as already-native-script and skip transliteration — a short
# native-script reply with one or two stray Latin characters (a drug name,
# a unit) shouldn't get needlessly transliterated.
ROMANIZED_THRESHOLD = 0.6


def looks_romanized(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return False
    latin_count = sum(1 for ch in letters if ch.isascii())
    return (latin_count / len(letters)) > ROMANIZED_THRESHOLD
