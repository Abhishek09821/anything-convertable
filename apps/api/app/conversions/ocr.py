"""OCR each scanned page independently, keeping native PDF pages untouched."""
from __future__ import annotations
import io
import os
import fitz
from PIL import Image
from .quality import note


def scan_lines(page) -> list[dict]:
    import pytesseract
    try:
        available = set(pytesseract.get_languages())
    except Exception as exc:
        raise ValueError("Scanned pages need Tesseract OCR installed on the server.") from exc
    requested = os.getenv("OCR_LANGS", "eng+hin").split("+")
    languages = [lang for lang in requested if lang in available]
    if not languages:
        raise ValueError("No requested OCR language is installed on the server.")
    missing = [lang for lang in requested if lang not in available]
    if missing:
        note(f"OCR language packs unavailable: {', '.join(missing)}. Recognition of those languages may be inaccurate.")
    # Bound pixel memory for oversized scans while retaining 300 DPI for ordinary pages.
    dpi = min(300, max(72, int(72 * (20_000_000 / (page.rect.width * page.rect.height)) ** .5)))
    pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csRGB, alpha=False)
    with Image.open(io.BytesIO(pix.tobytes("png"))) as image:
        data = pytesseract.image_to_data(image, lang="+".join(languages),
            config="--psm 3", output_type=pytesseract.Output.DICT, timeout=120)
    groups: dict[tuple, list] = {}
    for i, text in enumerate(data["text"]):
        if text.strip() and float(data["conf"][i]) >= 0:
            key = tuple(data[k][i] for k in ("block_num", "par_num", "line_num"))
            groups.setdefault(key, []).append(i)
    lines = []
    scale = 72 / dpi
    for key, indices in groups.items():
        x = min(data["left"][i] for i in indices)
        y = min(data["top"][i] for i in indices)
        right = max(data["left"][i] + data["width"][i] for i in indices)
        bottom = max(data["top"][i] + data["height"][i] for i in indices)
        lines.append({"text": " ".join(data["text"][i] for i in indices),
            "bbox": (x*scale, y*scale, right*scale, bottom*scale),
            "confidence": sum(float(data["conf"][i]) for i in indices)/len(indices), "group": key[:2]})
    if any(line["confidence"] < 70 for line in lines):
        note("Some scanned text has low OCR confidence. Review names, numbers and punctuation.")
    note("Scanned text was recognized with OCR. Original font families cannot be reliably recovered from pixels.")
    return lines
