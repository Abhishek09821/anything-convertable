"""
PDF → DOCX

Strategy:
  1. Extract native text spans + tables via PyMuPDF.
  2. For scanned pages: OCR via Tesseract.
  3. Reconstruct headings by font-size heuristic.
  4. Embed extracted images.
  5. Validate output is non-empty.
"""
from __future__ import annotations

import io

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Inches, Pt, RGBColor

from .shared import (
    ConversionError, PageData, TableBlock, TextSpan,
    extract_pdf_pages, validate_docx,
)


_ALIGN_MAP = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
}


def _hex_to_rgb(hex_color: str):
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def _median(values: list[float]) -> float:
    if not values:
        return 12.0
    s = sorted(values)
    mid = len(s) // 2
    return s[mid]


def convert(data: bytes) -> bytes:
    """Convert PDF bytes → DOCX bytes."""
    pages = extract_pdf_pages(data)
    if not pages:
        raise ConversionError("PDF has no pages")

    doc = Document()
    # Set narrow margins for better text fit
    for section in doc.sections:
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

    # Compute median font size across whole doc to calibrate heading detection
    all_sizes = [s.size for p in pages for s in p.spans]
    median_size = _median(all_sizes) if all_sizes else 12.0

    for pi, page in enumerate(pages):
        if pi > 0:
            doc.add_page_break()

        _add_page_content(doc, page, median_size)

    buf = io.BytesIO()
    doc.save(buf)
    result = buf.getvalue()
    validate_docx(result)
    return result


def _add_page_content(doc: Document, page: PageData, median_size: float) -> None:
    """Add all content from one page into the Word document."""

    # Collect table y-ranges so we skip spans that are inside a table
    table_ybounds = [(t.y, t.y + t.h) for t in page.tables]

    def _in_table(span: TextSpan) -> bool:
        for ty, ty2 in table_ybounds:
            if ty <= span.y <= ty2:
                return True
        return False

    # Group spans into logical paragraphs by proximity in y
    para_groups = _group_spans_into_paragraphs(
        [s for s in page.spans if not _in_table(s)]
    )

    for group in para_groups:
        if not group:
            continue
        text = " ".join(s.text for s in group)
        max_size = max(s.size for s in group)
        is_bold = any(s.bold for s in group)
        is_italic = any(s.italic for s in group)

        # Determine heading level
        if max_size >= median_size * 1.6 or (max_size >= median_size * 1.3 and is_bold):
            para = doc.add_heading(text, level=1)
        elif max_size >= median_size * 1.2 or is_bold:
            para = doc.add_heading(text, level=2)
        else:
            para = doc.add_paragraph()
            run = para.add_run(text)
            run.font.size = Pt(max(8, min(72, max_size)))
            run.bold = is_bold
            run.italic = is_italic
            try:
                r, g, b = _hex_to_rgb(group[0].color)
                run.font.color.rgb = RGBColor(r, g, b)
            except Exception:
                pass

    # Add tables
    for tb in page.tables:
        _add_table(doc, tb)

    # Add embedded images (only first image per page to avoid duplicates)
    for img_bytes in page.images[:2]:
        try:
            doc.add_picture(io.BytesIO(img_bytes), width=Inches(5.5))
        except Exception:
            pass


def _group_spans_into_paragraphs(spans: list[TextSpan]) -> list[list[TextSpan]]:
    """
    Group spans into paragraphs.  Spans within ~2px vertical gap of each other
    and with similar y-coordinate are treated as the same line.
    """
    if not spans:
        return []

    groups: list[list[TextSpan]] = []
    current: list[TextSpan] = [spans[0]]
    last_y = spans[0].y

    for span in spans[1:]:
        gap = span.y - (last_y + current[-1].h)
        same_line = abs(span.y - last_y) < max(current[-1].h * 0.6, 4)
        if same_line or gap < 4:
            current.append(span)
        else:
            groups.append(current)
            current = [span]
        last_y = span.y

    groups.append(current)
    return groups


def _add_table(doc: Document, tb: TableBlock) -> None:
    """Add a TableBlock as a Word table."""
    if tb.rows == 0 or tb.cols == 0:
        return
    word_table = doc.add_table(rows=tb.rows, cols=tb.cols)
    word_table.style = "Table Grid"
    for ri in range(tb.rows):
        for ci in range(tb.cols):
            cell_text = tb.cell(ri, ci)
            cell = word_table.cell(ri, ci)
            cell.text = cell_text
            if ri == 0:
                for run in cell.paragraphs[0].runs:
                    run.bold = True
    doc.add_paragraph()  # spacing after table
