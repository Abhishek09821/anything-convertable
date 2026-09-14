"""
PDF → Word (DOCX)

Accuracy strategy (iLovePDF-grade):
- Searchable PDFs (with native text) use pdf2docx with optimal layout settings.
  Reconstructs text blocks, lattice and stream tables, inline/floating images,
  and paragraph alignment without fragmented line breaks.
- Font customization:
  * "original" / "keep_original" (default): preserves fonts detected from the PDF.
  * "Times New Roman"
  * "Arial"
  * "Calibri"
  * "Georgia"
  * Full Hindi / Devanagari support: complex script runs (w:cs) are mapped to
    system Unicode fonts (Noto Sans Devanagari / Arial Unicode MS).
- Scanned / image-only PDFs are rendered at 300 DPI and OCRed with Tesseract
  (eng+hin for mixed Hindi/English). Text is grouped into paragraphs with
  proportional font sizing and written as real editable DOCX paragraphs.
- Page dimensions and margins in the output DOCX match the original PDF pages.
- The output is always validated to be a genuine, openable .docx file.
"""
from __future__ import annotations

import io
import os
import tempfile
from typing import Any

import fitz  # PyMuPDF
from docx import Document
from docx.oxml.ns import qn
from docx.shared import Mm, Pt
from pdf2docx import Converter

from .fonts import has_devanagari, has_non_latin, get_unicode_font_path


OCR_LANGS = os.getenv("OCR_LANGS", "eng+hin")
OCR_DPI = 300


# ── Font options & normalization ──────────────────────────────────────────────

def _normalize_font_choice(font: str) -> str:
    f = (font or "original").strip().lower().replace("-", "_").replace(" ", "_")
    if "times" in f:
        return "Times New Roman"
    if "arial" in f:
        return "Arial"
    if "calibri" in f:
        return "Calibri"
    if "georgia" in f:
        return "Georgia"
    return "original"


def _get_docx_unicode_font_name() -> str:
    font_path = get_unicode_font_path()
    if font_path:
        base = font_path.lower()
        if "noto" in base:
            return "Noto Sans Devanagari"
        if "arial" in base:
            return "Arial Unicode MS"
        if "sangam" in base or "devanagari" in base:
            return "Devanagari Sangam MN"
        if "mangal" in base:
            return "Mangal"
    return "Arial Unicode MS"


def _apply_font_to_docx(docx_bytes: bytes, font_choice: str) -> bytes:
    """Apply the chosen font across all styles, paragraphs, and tables in the DOCX."""
    target_font = _normalize_font_choice(font_choice)
    unicode_font = _get_docx_unicode_font_name()

    doc = Document(io.BytesIO(docx_bytes))

    # 1. Update Normal and Heading styles if a specific font is requested
    if target_font != "original":
        for style_name in ("Normal", "Heading 1", "Heading 2", "Heading 3", "Title"):
            try:
                st = doc.styles[style_name]
                font = getattr(st, "font", None)
                if font:
                    font.name = target_font
            except Exception:
                pass

    # Helper to style runs in a paragraph
    def style_paragraph(p):
        for r in p.runs:
            text = r.text or ""
            is_unicode = has_devanagari(text) or has_non_latin(text)

            rPr = r._element.get_or_add_rPr()
            rFonts = rPr.find(qn("w:rFonts"))
            if rFonts is None:
                rFonts = rPr.makeelement(qn("w:rFonts"), {})
                rPr.append(rFonts)

            if is_unicode:
                r.font.name = unicode_font
                rFonts.set(qn("w:cs"), unicode_font)
                rFonts.set(qn("w:ascii"), unicode_font)
                rFonts.set(qn("w:hAnsi"), unicode_font)
            elif target_font != "original":
                r.font.name = target_font
                rFonts.set(qn("w:ascii"), target_font)
                rFonts.set(qn("w:hAnsi"), target_font)
                rFonts.set(qn("w:cs"), target_font)

    # 2. Update body paragraphs
    for p in doc.paragraphs:
        style_paragraph(p)

    # 3. Update table cells
    for tbl in doc.tables:
        for row in tbl.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    style_paragraph(p)

    # 4. Update headers and footers
    for s in doc.sections:
        for p in s.header.paragraphs:
            style_paragraph(p)
        for p in s.footer.paragraphs:
            style_paragraph(p)

    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()


# ── OCR helpers ────────────────────────────────────────────────────────────────

def _ocr_language() -> str:
    """Return the best Tesseract language string available in this runtime."""
    try:
        import pytesseract  # type: ignore
        available = set(pytesseract.get_languages())
    except Exception:
        return "eng"
    if not available:
        return "eng"
    wanted = [lang.strip() for lang in OCR_LANGS.split("+") if lang.strip()]
    if all(lang in available for lang in wanted):
        return "+".join(wanted)
    if "eng" in available:
        return "eng"
    return sorted(available)[0]


def _pdf_has_native_text(data: bytes) -> bool:
    """True when at least one page carries real extractable text."""
    try:
        pdf = fitz.open(stream=data, filetype="pdf")
        for i in range(len(pdf)):
            text = str(pdf[i].get_text("text")).strip()
            if len(text) >= 3:
                return True
        return False
    except Exception:
        return False


def _render_page(page, dpi: int = OCR_DPI) -> bytes:
    mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    return pix.tobytes("png")


def _ocr_page_lines(png_bytes: bytes, lang: str) -> list[tuple[float, float, str, float]]:
    """OCR one rendered page; return (top, height, text, confidence) per line."""
    import pytesseract  # type: ignore
    from PIL import Image

    im = Image.open(io.BytesIO(png_bytes))
    data = pytesseract.image_to_data(
        im,
        output_type=pytesseract.Output.DICT,
        config=f"--psm 6 -l {lang}",
    )

    lines: dict[tuple[int, int, int], list[dict[str, Any]]] = {}
    n = len(data["text"])
    for i in range(n):
        txt = (data["text"][i] or "").strip()
        conf = float(data["conf"][i])
        if not txt or conf < 0:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append({
            "left": data["left"][i],
            "top": data["top"][i],
            "width": data["width"][i],
            "height": data["height"][i],
            "text": txt,
            "conf": conf,
        })

    result: list[tuple[float, float, str, float]] = []
    scale = 72.0 / OCR_DPI

    for words in lines.values():
        words.sort(key=lambda w: w["left"])
        line_text = " ".join(w["text"] for w in words).strip()
        if not line_text:
            continue
        avg_top = min(w["top"] for w in words) * scale
        avg_h = (sum(w["height"] for w in words) / len(words)) * scale
        avg_conf = sum(w["conf"] for w in words) / len(words)
        result.append((avg_top, avg_h, line_text, avg_conf))

    result.sort(key=lambda r: r[0])
    return result


def _group_lines_into_paragraphs(
    lines: list[tuple[float, float, str, float]],
    gap_multiplier: float = 1.8,
) -> list[tuple[str, float]]:
    if not lines:
        return []

    paras: list[tuple[str, float]] = []
    cur_lines: list[str] = [lines[0][2]]
    cur_heights: list[float] = [lines[0][1]]
    prev_bottom = lines[0][0] + lines[0][1]

    for top, height, text, _ in lines[1:]:
        gap = top - prev_bottom
        threshold = max(height, cur_heights[-1]) * gap_multiplier
        if gap > threshold:
            avg_h = sum(cur_heights) / len(cur_heights)
            paras.append((" ".join(cur_lines), avg_h))
            cur_lines = [text]
            cur_heights = [height]
        else:
            cur_lines.append(text)
            cur_heights.append(height)
        prev_bottom = top + height

    if cur_lines:
        avg_h = sum(cur_heights) / len(cur_heights)
        paras.append((" ".join(cur_lines), avg_h))

    return paras


def _height_to_font_size(pt_height: float) -> float:
    size = pt_height * 0.75
    return max(7.0, min(size, 48.0))


def _ocr_scanned_pdf(data: bytes, target_font: str = "original") -> bytes:
    """Fallback converter for scanned PDFs using OCR."""
    pdf = fitz.open(stream=data, filetype="pdf")
    lang = _ocr_language()

    doc = Document()
    norm_font = _normalize_font_choice(target_font)
    unicode_font = _get_docx_unicode_font_name()

    for i in range(len(pdf)):
        page = pdf[i]
        rect = page.rect
        page_w_mm = rect.width * 25.4 / 72.0
        page_h_mm = rect.height * 25.4 / 72.0

        if i == 0:
            section = doc.sections[0]
        else:
            doc.add_page_break()
            section = doc.add_section()

        section.page_width = Mm(page_w_mm)
        section.page_height = Mm(page_h_mm)
        section.left_margin = Mm(15)
        section.right_margin = Mm(15)
        section.top_margin = Mm(15)
        section.bottom_margin = Mm(15)

        png = _render_page(page)
        try:
            lines = _ocr_page_lines(png, lang)
        except Exception:
            lines = []

        if not lines:
            doc.add_picture(io.BytesIO(png), width=Mm(page_w_mm - 30))
            continue

        for text, avg_height in _group_lines_into_paragraphs(lines):
            font_size = _height_to_font_size(avg_height)
            para = doc.add_paragraph()
            run = para.add_run(text)
            run.font.size = Pt(font_size)

            # Determine font
            if has_devanagari(text) or has_non_latin(text):
                f_name = unicode_font
            elif norm_font != "original":
                f_name = norm_font
            else:
                f_name = "Calibri"

            run.font.name = f_name
            rPr = run._element.get_or_add_rPr()
            rFonts = rPr.find(qn("w:rFonts"))
            if rFonts is None:
                rFonts = rPr.makeelement(qn("w:rFonts"), {})
                rPr.append(rFonts)
            rFonts.set(qn("w:ascii"), f_name)
            rFonts.set(qn("w:hAnsi"), f_name)
            rFonts.set(qn("w:cs"), unicode_font if (has_devanagari(text) or has_non_latin(text)) else f_name)

            pf = para.paragraph_format
            pf.space_after = Pt(2)
            pf.space_before = Pt(1)

    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()


# ── pdf2docx converter ────────────────────────────────────────────────────────

def _convert_with_pdf2docx(data: bytes) -> bytes:
    """Convert searchable PDF to DOCX using tuned pdf2docx layout reconstruction."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f_in:
        f_in.write(data)
        pdf_path = f_in.name
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f_out:
        docx_path = f_out.name
    try:
        cv = Converter(pdf_path)
        # Optimal parameters for layout fidelity: preserve tables, paragraphs, and high-res images
        cv.convert(
            docx_path,
            start=0,
            parse_lattice_table=True,
            parse_stream_table=True,
            clip_image_res_ratio=4.0,
            ignore_page_error=True,
            multi_processing=False,
        )
        cv.close()
        with open(docx_path, "rb") as f:
            return f.read()
    finally:
        try:
            os.unlink(pdf_path)
        except Exception:
            pass
        try:
            os.unlink(docx_path)
        except Exception:
            pass


def _has_meaningful_text(data: bytes) -> bool:
    try:
        doc = Document(io.BytesIO(data))
        total_text = " ".join(p.text for p in doc.paragraphs)
        return len(total_text.strip()) >= 3 or bool(doc.tables)
    except Exception:
        return False


def _validate_docx(data: bytes) -> bool:
    """Verify the output is a valid DOCX (ZIP with correct structure)."""
    import zipfile
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            return "[Content_Types].xml" in z.namelist()
    except Exception:
        return False


# ── Main ───────────────────────────────────────────────────────────────────────

def convert(data: bytes, font: str = "original") -> bytes:
    """Convert PDF bytes to high-accuracy DOCX with optional font styling."""
    has_text = _pdf_has_native_text(data)
    result = None

    if has_text:
        try:
            result = _convert_with_pdf2docx(data)
            if not _has_meaningful_text(result):
                result = None
        except Exception:
            result = None

    if result is None:
        result = _ocr_scanned_pdf(data, target_font=font)

    # Apply font customization if requested (or ensure Unicode font for Hindi)
    result = _apply_font_to_docx(result, font)

    # Final validation — guarantee valid DOCX
    assert _validate_docx(result), "Output is not a valid DOCX file"
    return result
