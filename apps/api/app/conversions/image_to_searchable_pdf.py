"""
Image/Scan → Searchable PDF

Strategy:
  1. Preserve the original image exactly (no re-encoding artifacts).
  2. Add an invisible text layer using ReportLab that overlays OCR text
     at the exact bounding-box positions returned by Tesseract.
  3. The result looks identical to the scan but the text is selectable/searchable.
"""
from __future__ import annotations

import io

from PIL import Image
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.utils import ImageReader

from .shared import ConversionError, load_image, ocr_image, validate_pdf


def convert(data: bytes) -> bytes:
    im = load_image(data)
    w, h = im.size

    lines = ocr_image(im)
    # OCR failure is non-fatal — we still produce a PDF, just not searchable
    if not lines:
        print("[image_to_searchable_pdf] no OCR results; producing image-only PDF")

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(w, h))

    # ── Draw original image as background ───────────────────────────────────
    reader = ImageReader(io.BytesIO(data))
    c.drawImage(reader, 0, 0, width=w, height=h, preserveAspectRatio=True)

    # ── Invisible text layer ────────────────────────────────────────────────
    c.setFillColorRGB(0, 0, 0, alpha=0)  # fully transparent fill
    for ln in lines:
        if not ln["text"].strip():
            continue
        ocr_h = max(1, ln["h"])
        font_size = max(4, min(72, int(ocr_h * 0.85)))
        # ReportLab y=0 at bottom; image y=0 at top
        rl_y = h - ln["y"] - ocr_h
        try:
            c.setFont("Helvetica", font_size)
            # drawString at exact position — invisible but selectable
            c.setFillColorRGB(0, 0, 0, alpha=0)
            c.drawString(ln["x"], rl_y, ln["text"])
        except Exception:
            pass

    c.save()
    result = buf.getvalue()
    validate_pdf(result)
    return result
