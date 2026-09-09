"""
PDF → PPTX

Strategy:
  1. Each PDF page → one PowerPoint slide.
  2. Render page to image → placed as background.
  3. Overlay native text as editable text boxes at accurate positions.
  4. Tables are reconstructed as text boxes in a grid layout.
  5. Slide dimensions match the PDF page aspect ratio.
"""
from __future__ import annotations

import io

from typing import Any

import fitz
from PIL import Image
from pptx import Presentation
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor

from .shared import (
    ConversionError, PageData, TextSpan,
    extract_pdf_pages, validate_pptx,
)


# PowerPoint "standard" slide size in EMU
_SLIDE_W_EMU = 9144000   # 10 inches
_SLIDE_H_EMU = 6858000   # 7.5 inches


def convert(data: bytes) -> bytes:
    pages = extract_pdf_pages(data)
    if not pages:
        raise ConversionError("PDF has no pages")

    # Determine slide dimensions from first page aspect ratio
    first = pages[0]
    aspect = first.height / first.width if first.width else 0.75
    slide_w = _SLIDE_W_EMU
    slide_h = int(slide_w * aspect)

    prs = Presentation()
    prs.slide_width = slide_w
    prs.slide_height = slide_h

    # Re-open PDF for rendering
    pdf_doc = fitz.open(stream=data, filetype="pdf")

    for page_data in pages:
        _add_slide(prs, page_data, pdf_doc, slide_w, slide_h)

    buf = io.BytesIO()
    prs.save(buf)
    result = buf.getvalue()
    validate_pptx(result)
    return result


def _add_slide(prs: Presentation, page: PageData, pdf_doc: Any, slide_w: int, slide_h: int) -> None:
    from pptx.util import Inches, Pt

    blank_layout = prs.slide_layouts[6]  # completely blank layout
    slide = prs.slides.add_slide(blank_layout)

    # ── Background image ────────────────────────────────────────────────────
    fitz_page = pdf_doc[page.page_num]
    mat = fitz.Matrix(2.0, 2.0)
    pix = fitz_page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    img_bytes = pix.tobytes("jpeg")

    img_stream = io.BytesIO(img_bytes)
    pic = slide.shapes.add_picture(img_stream, 0, 0, width=slide_w, height=slide_h)
    # Send to back
    slide.shapes._spTree.remove(pic._element)
    slide.shapes._spTree.insert(2, pic._element)

    # Scale factors: PDF units → EMU
    sx = slide_w / page.width if page.width else 1
    sy = slide_h / page.height if page.height else 1

    # ── Text boxes for native text ──────────────────────────────────────────
    # Group close spans into lines to avoid too many tiny boxes
    lines = _group_into_lines(page.spans)
    for line_spans in lines:
        if not line_spans:
            continue
        text = " ".join(s.text for s in line_spans)
        span = line_spans[0]
        x_emu = int(span.x * sx)
        y_emu = int(span.y * sy)
        w_emu = int(max(s.x + s.w for s in line_spans) * sx) - x_emu
        h_emu = int(max(s.h for s in line_spans) * sy * 1.2)

        # Clamp to slide bounds
        x_emu = max(0, min(x_emu, slide_w - 100))
        y_emu = max(0, min(y_emu, slide_h - 100))
        w_emu = max(int(0.5 * 914400), w_emu)   # min 0.5 inch
        h_emu = max(int(0.25 * 914400), h_emu)  # min 0.25 inch

        txBox = slide.shapes.add_textbox(x_emu, y_emu, w_emu, h_emu)
        tf = txBox.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = text
        run = p.runs[0] if p.runs else p.add_run()
        run.font.size = Pt(max(8, min(48, span.size)))
        run.font.bold = span.bold
        run.font.italic = span.italic
        # Transparent background so background image shows through
        txBox.fill.background()
        try:
            r, g, b = _hex_to_rgb(span.color)
            run.font.color.rgb = RGBColor(r, g, b)
        except Exception:
            run.font.color.rgb = RGBColor(0x11, 0x18, 0x27)

    # ── Tables ──────────────────────────────────────────────────────────────
    for tb in page.tables:
        _add_table_to_slide(slide, tb, sx, sy, slide_w, slide_h)


def _group_into_lines(spans: list[TextSpan]) -> list[list[TextSpan]]:
    if not spans:
        return []
    groups: list[list[TextSpan]] = [[spans[0]]]
    for span in spans[1:]:
        last = groups[-1][-1]
        if abs(span.y - last.y) < last.h * 0.5:
            groups[-1].append(span)
        else:
            groups.append([span])
    return groups


def _add_table_to_slide(slide, tb, sx: float, sy: float, slide_w: int, slide_h: int) -> None:
    from pptx.util import Inches
    rows = tb.as_rows()
    if not rows:
        return
    x_emu = int(tb.x * sx)
    y_emu = int(tb.y * sy)
    w_emu = min(int(tb.w * sx) or int(slide_w * 0.8), slide_w - x_emu)
    h_emu = min(int(tb.h * sy) or int(slide_h * 0.4), slide_h - y_emu)
    n_rows, n_cols = len(rows), max(len(r) for r in rows)
    if n_rows < 1 or n_cols < 1:
        return
    table = slide.shapes.add_table(n_rows, n_cols, x_emu, y_emu, w_emu, h_emu).table
    for ri, row in enumerate(rows):
        for ci in range(n_cols):
            val = row[ci] if ci < len(row) else ""
            cell = table.cell(ri, ci)
            cell.text = val
            if ri == 0:
                for para in cell.text_frame.paragraphs:
                    for run in para.runs:
                        run.font.bold = True


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
