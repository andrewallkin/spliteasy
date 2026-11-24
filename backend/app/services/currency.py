"""Turn receipt currency text into an ISO 4217 code.

South African slips print "R", which Intl.NumberFormat rejects.
"""

from __future__ import annotations

DEFAULT_CURRENCY = "ZAR"

_ALIASES = {
    "R": "ZAR",
    "RAND": "ZAR",
    "RANDS": "ZAR",
}


def normalize_currency(value: str | None, *, default: str = DEFAULT_CURRENCY) -> str:
    raw = (value or "").strip().upper()
    if not raw:
        return default
    if raw in _ALIASES:
        return _ALIASES[raw]
    letters = "".join(ch for ch in raw if "A" <= ch <= "Z")
    if letters in _ALIASES:
        return _ALIASES[letters]
    if len(letters) == 3:
        return letters
    return default
