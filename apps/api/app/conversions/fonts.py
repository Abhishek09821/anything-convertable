"""
fonts.py — shared Unicode font discovery and registration.

Provides a single source of truth for locating a TTF font that covers
Latin + Devanagari (Hindi).  Used by word_to_pdf, ppt_to_pdf, and
pdf_to_word converters.

Search order
============
1. Well-known system paths (macOS, Linux, Windows).
2. A bundled / cached font in ``<project>/fonts/``.
3. Auto-download Noto Sans Devanagari from Google Fonts (one-time, ~600 KB).
"""
from __future__ import annotations

import os
import re
import urllib.request
from functools import lru_cache
from pathlib import Path

# ── Devanagari detection ─────────────────────────────────────────────────────

_DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")


def has_devanagari(text: str) -> bool:
    """Return True if *text* contains at least one Devanagari character."""
    return bool(_DEVANAGARI_RE.search(text))


def has_non_latin(text: str) -> bool:
    """Return True if *text* contains characters outside Basic Latin + Latin-1."""
    for ch in text:
        if ord(ch) > 0x024F and ch not in (" ", "\t", "\n", "\r"):
            return True
    return False


# ── Font search ──────────────────────────────────────────────────────────────

_FONT_CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "fonts"

# Ordered preference — first found wins.
_CANDIDATES = [
    # macOS
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    # Noto Sans Devanagari (if installed)
    "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf",
    "/usr/share/fonts/noto/NotoSansDevanagari-Regular.ttf",
    "/usr/share/fonts/google-noto/NotoSansDevanagari-Regular.ttf",
    # Linux common
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    # Windows
    "C:/Windows/Fonts/arialuni.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/NotoSansDevanagari-Regular.ttf",
    # macOS Devanagari fallback
    "/System/Library/Fonts/Supplemental/Devanagari Sangam MN.ttc",
]


def _download_noto_sans_devanagari() -> str | None:
    """Download Noto Sans Devanagari Regular to the local font cache.

    Returns the path on success, None on failure.
    """
    url = (
        "https://github.com/google/fonts/raw/main/ofl/notosansdevanagari/"
        "NotoSansDevanagari%5Bwdth%2Cwght%5D.ttf"
    )
    dest = _FONT_CACHE_DIR / "NotoSansDevanagari.ttf"
    if dest.exists() and dest.stat().st_size > 10_000:
        return str(dest)
    try:
        _FONT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        print(f"[fonts] Downloading Noto Sans Devanagari → {dest}")
        urllib.request.urlretrieve(url, str(dest))
        if dest.stat().st_size > 10_000:
            print(f"[fonts] Downloaded successfully ({dest.stat().st_size:,} bytes)")
            return str(dest)
        dest.unlink(missing_ok=True)
    except Exception as exc:
        print(f"[fonts] Download failed: {exc}")
    return None


@lru_cache(maxsize=1)
def get_unicode_font_path() -> str | None:
    """Return the absolute path to the best available Unicode TTF font.

    Returns ``None`` only if no suitable font exists anywhere.
    """
    # 1. Check well-known system paths
    for path in _CANDIDATES:
        if os.path.isfile(path):
            print(f"[fonts] Using system font: {path}")
            return path

    # 2. Check local cache
    cached = _FONT_CACHE_DIR / "NotoSansDevanagari.ttf"
    if cached.exists() and cached.stat().st_size > 10_000:
        print(f"[fonts] Using cached font: {cached}")
        return str(cached)

    # 3. Try auto-download
    downloaded = _download_noto_sans_devanagari()
    if downloaded:
        return downloaded

    print("[fonts] WARNING: No Unicode font found — Hindi text may not render correctly")
    return None


# ── ReportLab font registration ──────────────────────────────────────────────

_RL_REGISTERED = False
RL_UNICODE_FONT = "Helvetica"       # fallback
RL_UNICODE_FONT_BOLD = "Helvetica-Bold"


def register_reportlab_unicode_font() -> tuple[str, str]:
    """Register a Unicode TTF font with ReportLab and return (regular, bold) names.

    Safe to call multiple times — registration happens only once.
    """
    global _RL_REGISTERED, RL_UNICODE_FONT, RL_UNICODE_FONT_BOLD

    if _RL_REGISTERED:
        return RL_UNICODE_FONT, RL_UNICODE_FONT_BOLD

    font_path = get_unicode_font_path()
    if not font_path:
        _RL_REGISTERED = True
        return RL_UNICODE_FONT, RL_UNICODE_FONT_BOLD

    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        pdfmetrics.registerFont(TTFont("UnicodeSans", font_path))
        RL_UNICODE_FONT = "UnicodeSans"

        # Try to register a bold variant (same font, simulated bold)
        # Many Unicode fonts don't ship a separate bold file, so we
        # re-register the same file under a bold alias — ReportLab's
        # HTML Paragraph renderer will still apply <b> bolding.
        pdfmetrics.registerFont(TTFont("UnicodeSansBold", font_path))
        RL_UNICODE_FONT_BOLD = "UnicodeSansBold"

        print(f"[fonts] Registered ReportLab font: {RL_UNICODE_FONT} from {font_path}")
    except Exception as exc:
        print(f"[fonts] Failed to register ReportLab font: {exc}")

    _RL_REGISTERED = True
    return RL_UNICODE_FONT, RL_UNICODE_FONT_BOLD


# ── PIL / Pillow font loading ───────────────────────────────────────────────

def get_pil_font(size_px: int = 16):
    """Return a PIL ImageFont at the requested pixel size.

    Falls back to the default bitmap font if no TTF is available.
    """
    from PIL import ImageFont

    font_path = get_unicode_font_path()
    if font_path:
        try:
            return ImageFont.truetype(font_path, size=size_px)
        except Exception:
            pass
    try:
        return ImageFont.load_default(size=size_px)
    except TypeError:
        return ImageFont.load_default()
