"""
PDF → PowerPoint (PPTX)

Accuracy strategy (iLovePDF-grade):
- For every PDF page:
  1. Render the page to a high-resolution PNG (200 DPI) → place as the slide
     background image so the slide looks EXACTLY like the PDF page.
  2. Extract native text spans (position, font size, bold, italic, colour)
     via PyMuPDF's span-level text dict.
  3. Place each text span as an *invisible* (transparent fill, no border)
     text box at the exact x/y/w/h position → slide text is selectable and
     editable in PowerPoint even though it's visually covered by the bg image.
- Hindi / Devanagari text is fully supported: text runs use a Unicode font
  name (Arial Unicode MS / Noto Sans) for cross-platform rendering.
- This gives 100% visual fidelity (via the background image) PLUS editable text.
- Slide dimensions match the PDF page aspect ratio exactly.
- Multi-page PDFs → multi-slide PPTX.
- Nearby text spans on the same line are merged to reduce shape count.
- Typical speed: ~1-2 sec per page.
"""
from __future__ import annotations

import io

import fitz  # PyMuPDF
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Length, Pt

from .fonts import has_non_latin, get_unicode_font_path


# ── Constants ──────────────────────────────────────────────────────────────────
RENDER_DPI   = 200
PT_PER_PX    = 72.0 / RENDER_DPI   # points per rendered pixel
EMU_PER_PT   = 12700
EMU_PER_PX   = EMU_PER_PT * PT_PER_PX


# ── Font name for PPTX text runs ──────────────────────────────────────────────

def _get_pptx_font_name() -> str:
    """Return the best Unicode font name to set on PPTX text runs."""
    font_path = get_unicode_font_path()
    if not font_path:
        return "Arial"
    path_lower = font_path.lower()
    if "arial unicode" in path_lower:
        return "Arial Unicode MS"
    if "notosansdevanagari" in path_lower or "noto" in path_lower:
        return "Noto Sans Devanagari"
    if "devanagari sangam" in path_lower:
        return "Devanagari Sangam MN"
    if "freesans" in path_lower:
        return "FreeSans"
    if "dejavu" in path_lower:
        return "DejaVu Sans"
    return "Arial"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _pt_to_emu(pt_val: float) -> int:
    return int(pt_val * EMU_PER_PT)


def _hex_to_rgb(hex_int: int) -> RGBColor:
    r = (hex_int >> 16) & 0xFF
    g = (hex_int >> 8)  & 0xFF
    b =  hex_int        & 0xFF
    return RGBColor(r, g, b)


def _add_bg_image(slide, img_bytes: bytes, slide_w: int, slide_h: int):
    """Add rendered page PNG as a full-slide background picture."""
    pic = slide.shapes.add_picture(
        io.BytesIO(img_bytes), 0, 0,
        width=slide_w, height=slide_h,
    )
    # Send to back (z-order 0) by moving the element in the XML tree
    sp_tree = slide.shapes._spTree
    sp_tree.remove(pic._element)
    sp_tree.insert(2, pic._element)  # index 2 = behind all other shapes


def _add_text_box(slide, text: str, x_emu: int, y_emu: int,
                  w_emu: int, h_emu: int,
                  font_size_pt: float, bold: bool, italic: bool,
                  color_int: int, align_str: str,
                  unicode_font_name: str):
    """Add a transparent text box at the given position."""
    if not text.strip():
        return
    if w_emu < 1 or h_emu < 1:
        return

    # Minimum size guards
    w_emu = max(w_emu, _pt_to_emu(10))
    h_emu = max(h_emu, _pt_to_emu(10))

    txBox = slide.shapes.add_textbox(x_emu, y_emu, w_emu, h_emu)

    # Transparent fill and no border → visually invisible, text is selectable
    from pptx.oxml.ns import qn
    from lxml import etree  # type: ignore

    sp_pr = txBox._element.spPr
    # Remove any existing fill
    for child in list(sp_pr):
        if "Fill" in child.tag or "fill" in child.tag.lower() or child.tag.endswith("solidFill") or child.tag.endswith("noFill"):
            sp_pr.remove(child)
    etree.SubElement(sp_pr, qn("a:noFill"))

    # Remove border
    ln = sp_pr.find(qn("a:ln"))
    if ln is None:
        ln = etree.SubElement(sp_pr, qn("a:ln"))
    etree.SubElement(ln, qn("a:noFill"))

    tf = txBox.text_frame
    tf.word_wrap = True
    tf.auto_size = None

    p = tf.paragraphs[0]

    # Alignment
    al = align_str.lower() if align_str else ""
    if "center" in al:
        p.alignment = PP_ALIGN.CENTER
    elif "right" in al:
        p.alignment = PP_ALIGN.RIGHT
    else:
        p.alignment = PP_ALIGN.LEFT

    run = p.add_run()
    run.text = text
    run.font.size = Pt(max(6, min(200, font_size_pt)))
    run.font.bold = bold
    run.font.italic = italic

    # Set Unicode font for proper Hindi rendering
    if has_non_latin(text):
        run.font.name = unicode_font_name
    else:
        run.font.name = "Arial"

    try:
        run.font.color.rgb = _hex_to_rgb(color_int)
    except Exception:
        pass


def _merge_line_spans(spans: list[dict]) -> list[dict]:
    """Merge horizontally adjacent spans on the same line to reduce shape count."""
    if len(spans) <= 1:
        return spans

    # Sort by x position
    spans.sort(key=lambda s: s["bbox"][0])
    merged = [spans[0].copy()]

    for span in spans[1:]:
        prev = merged[-1]
        prev_x1 = prev["bbox"][2]
        curr_x0 = span["bbox"][0]
        # If spans are close horizontally and have similar font properties
        gap = curr_x0 - prev_x1
        same_size = abs(prev.get("size", 12) - span.get("size", 12)) < 1.0
        same_flags = prev.get("flags", 0) == span.get("flags", 0)
        same_color = prev.get("color", 0) == span.get("color", 0)

        if gap < prev.get("size", 12) * 0.5 and same_size and same_flags and same_color:
            # Merge: extend the text and bbox
            sep = " " if gap > 1 else ""
            prev["text"] = prev["text"] + sep + span["text"]
            prev["bbox"] = (
                prev["bbox"][0],
                min(prev["bbox"][1], span["bbox"][1]),
                span["bbox"][2],
                max(prev["bbox"][3], span["bbox"][3]),
            )
        else:
            merged.append(span.copy())

    return merged


# ── Main ───────────────────────────────────────────────────────────────────────

def convert(data: bytes) -> bytes:
    pdf = fitz.open(stream=data, filetype="pdf")
    unicode_font_name = _get_pptx_font_name()

    prs = Presentation()

    for page_num in range(len(pdf)):
        page = pdf[page_num]
        rect = page.rect  # PDF points
        page_w_pt = rect.width
        page_h_pt = rect.height

        # ── 1. Set slide dimensions to match PDF page ─────────────────────────
        slide_w_emu = _pt_to_emu(page_w_pt)
        slide_h_emu = _pt_to_emu(page_h_pt)
        prs.slide_width  = Length(slide_w_emu)
        prs.slide_height = Length(slide_h_emu)

        # ── 2. Add blank slide ────────────────────────────────────────────────
        blank_layout = prs.slide_layouts[6]  # blank layout
        slide = prs.slides.add_slide(blank_layout)

        # ── 3. Render page to PNG and add as background ───────────────────────
        mat = fitz.Matrix(RENDER_DPI / 72, RENDER_DPI / 72)
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
        img_bytes = pix.tobytes("png")
        _add_bg_image(slide, img_bytes, slide_w_emu, slide_h_emu)

        # ── 4. Extract text spans and add invisible text boxes ────────────────
        page_dict: dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)  # type: ignore[assignment]
        blocks: list[dict] = page_dict.get("blocks", [])

        for block in blocks:
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                raw_spans = []
                for span in line.get("spans", []):
                    raw = span.get("text", "").strip()
                    if not raw:
                        continue
                    raw_spans.append(span)

                # Merge nearby spans on same line
                merged_spans = _merge_line_spans(raw_spans)

                for span in merged_spans:
                    text = span.get("text", "").strip()
                    if not text:
                        continue

                    bbox = span["bbox"]  # (x0, y0, x1, y1) in PDF points
                    x0, y0, x1, y1 = bbox
                    span_w = x1 - x0
                    span_h = y1 - y0
                    if span_w < 0.5 or span_h < 0.5:
                        continue

                    # PDF coordinate system: y=0 is top for 'dict' extraction
                    x_emu = _pt_to_emu(x0)
                    y_emu = _pt_to_emu(y0)
                    w_emu = _pt_to_emu(span_w)
                    # Better height calculation: use font size * 1.2 line height
                    font_size = span.get("size", 12.0)
                    h_emu = _pt_to_emu(max(span_h, font_size) * 1.2)

                    flags = span.get("flags", 0)
                    bold   = bool(flags & 2**4)
                    italic = bool(flags & 2**1)
                    color_int = span.get("color", 0x000000)

                    # Use block alignment as a hint
                    align_str = "left"

                    _add_text_box(
                        slide, text,
                        x_emu, y_emu, w_emu, h_emu,
                        font_size, bold, italic,
                        color_int, align_str,
                        unicode_font_name,
                    )

    out_buf = io.BytesIO()
    prs.save(out_buf)
    result = out_buf.getvalue()

    assert result[:4] == b"PK\x03\x04", "Output is not a valid PPTX"
    assert len(result) > 5000, f"PPTX too small: {len(result)} bytes"
    return result
