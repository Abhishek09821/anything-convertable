"""
fonts.py — shared Unicode & TrueType font discovery, registration, and styling.

Provides a single source of truth for locating, registering, and styling fonts across:
- word_to_pdf (ReportLab TrueType metrics & vector text)
- ppt_to_pdf  (Pillow TrueType rendering with exact font-family matching)
- pdf_to_word (Word OpenXML w:rFonts for ascii, hAnsi, and cs)
- pdf_to_ppt  (PowerPoint OpenXML a:latin and a:cs)
- text_to_word & text_to_pdf (direct typography engine)

Supported fonts:
1. Keep Original
2. Times New Roman (Classic Serif)
3. Arial (Modern Sans-Serif)
4. Calibri (Office Sans-Serif)
5. Georgia (High-Legibility Serif)
6. Noto Sans Devanagari / Arial Unicode (100% Hindi/Unicode Support)
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


# ── Font paths & discovery ───────────────────────────────────────────────────

_FONT_CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "fonts"

# Map of standard font families to candidate file paths on macOS, Linux, and Windows
_FONT_FAMILY_CANDIDATES: dict[str, list[str]] = {
    "times_new_roman": [
        "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        "/Library/Fonts/Times New Roman.ttf",
        "C:/Windows/Fonts/times.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/times.ttf",
    ],
    "arial": [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/arial.ttf",
    ],
    "calibri": [
        "/Library/Fonts/Calibri.ttf",
        "/System/Library/Fonts/Supplemental/Calibri.ttf",
        "C:/Windows/Fonts/calibri.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ],
    "georgia": [
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/Library/Fonts/Georgia.ttf",
        "C:/Windows/Fonts/georgia.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/georgia.ttf",
    ],
    "devanagari": [
        str(_FONT_CACHE_DIR / "NotoSansDevanagari-Regular.ttf"),
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf",
        "C:/Windows/Fonts/arialuni.ttf",
        "C:/Windows/Fonts/NotoSansDevanagari-Regular.ttf",
    ],
}


def _download_noto_sans_devanagari() -> str | None:
    """Download Noto Sans Devanagari Regular to local font cache if missing."""
    dest = _FONT_CACHE_DIR / "NotoSansDevanagari-Regular.ttf"
    if dest.exists() and dest.stat().st_size > 10_000:
        return str(dest)
    try:
        _FONT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        url = (
            "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/"
            "NotoSansDevanagari/NotoSansDevanagari-Regular.ttf"
        )
        print(f"[fonts] Downloading Noto Sans Devanagari → {dest}")
        urllib.request.urlretrieve(url, str(dest))
        if dest.stat().st_size > 10_000:
            return str(dest)
    except Exception as exc:
        print(f"[fonts] Download failed: {exc}")
    return None


@lru_cache(maxsize=16)
def get_font_path(family: str = "devanagari") -> str | None:
    """Return the absolute path to the best available TrueType font for the given family."""
    fam_key = family.strip().lower().replace(" ", "_").replace("-", "_")

    # If it's a specific family or requested font
    candidates = _FONT_FAMILY_CANDIDATES.get(fam_key)
    if not candidates:
        if "times" in fam_key:
            candidates = _FONT_FAMILY_CANDIDATES["times_new_roman"]
        elif "arial" in fam_key:
            candidates = _FONT_FAMILY_CANDIDATES["arial"]
        elif "calibri" in fam_key:
            candidates = _FONT_FAMILY_CANDIDATES["calibri"]
        elif "georgia" in fam_key:
            candidates = _FONT_FAMILY_CANDIDATES["georgia"]
        else:
            candidates = _FONT_FAMILY_CANDIDATES["devanagari"]

    for path in candidates:
        if os.path.isfile(path) and os.path.getsize(path) > 10_000:
            return path

    # Local bundled cache
    bundled = _FONT_CACHE_DIR / "NotoSansDevanagari-Regular.ttf"
    if bundled.exists() and bundled.stat().st_size > 10_000:
        return str(bundled)

    # Download if Devanagari
    if "deva" in fam_key or "noto" in fam_key or "hindi" in fam_key:
        downloaded = _download_noto_sans_devanagari()
        if downloaded:
            return downloaded

    return None


def get_unicode_font_path() -> str | None:
    """Return path to universal Unicode / Devanagari font."""
    return get_font_path("devanagari")


# ── ReportLab Registration ───────────────────────────────────────────────────

_REGISTERED_RL_FONTS: dict[str, str] = {}


def register_reportlab_font(family_name: str) -> str:
    """
    Register a TrueType font in ReportLab's pdfmetrics and return its registered name.
    Falls back to Unicode font if needed, and finally Helvetica.
    """
    cleaned = family_name.strip()
    key = cleaned.lower().replace(" ", "").replace("-", "")

    if key in _REGISTERED_RL_FONTS:
        return _REGISTERED_RL_FONTS[key]

    path = get_font_path(cleaned)
    if not path:
        path = get_unicode_font_path()

    if path and os.path.isfile(path):
        try:
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.ttfonts import TTFont

            reg_name = f"Custom_{key}"
            pdfmetrics.registerFont(TTFont(reg_name, path))
            _REGISTERED_RL_FONTS[key] = reg_name
            print(f"[fonts] Registered ReportLab font: {reg_name} from {path}")
            return reg_name
        except Exception as exc:
            print(f"[fonts] Failed to register {cleaned} in ReportLab: {exc}")

    # Fallback
    _REGISTERED_RL_FONTS[key] = "Helvetica"
    return "Helvetica"


def register_reportlab_unicode_font() -> tuple[str, str]:
    """Register universal Unicode font in ReportLab, returning (regular, bold) names."""
    reg = register_reportlab_font("devanagari")
    return reg, reg


# ── PIL / Pillow font loading ───────────────────────────────────────────────

def get_pil_font_by_name(font_name: str | None = None, size_px: int = 16):
    """
    Load a TrueType font for Pillow (used in PPT → PDF rendering) matching the
    exact requested font family name.
    """
    from PIL import ImageFont

    fam = font_name or "arial"
    path = get_font_path(fam)
    if not path:
        path = get_unicode_font_path()

    if path and os.path.isfile(path):
        try:
            return ImageFont.truetype(path, size=max(8, size_px))
        except Exception:
            pass

    try:
        return ImageFont.load_default(size=size_px)
    except TypeError:
        return ImageFont.load_default()


def get_pil_font(size_px: int = 16):
    """Backward compatible wrapper."""
    return get_pil_font_by_name("devanagari", size_px)
