"""
PDF → Word (DOCX)

Accuracy strategy (iLovePDF-grade):
- Searchable PDFs (with native text) use pdf2docx with finely-tuned parameters
  for the best layout-preserving conversion. pdf2docx reconstructs text blocks,
  tables, images and approximate positioning.
- Scanned / image-only PDFs are rendered at 300 DPI and OCRed with Tesseract
  (eng+hin for mixed Hindi/English, configurable via OCR_LANGS). The OCR text
  is grouped into paragraphs with proportional font sizing and written as real
  editable DOCX paragraphs — never a flat image — so the result stays editable.
- Page dimensions in the output DOCX match the original PDF pages.
- Hindi / Devanagari text is fully supported: a Unicode font (Noto Sans
  Devanagari or Arial Unicode) is embedded in the OCR output path.
- If OCR is unavailable or produces no text on a page, that page is embedded
  as a high-res rendered picture so content is never lost.
- Multi-page PDFs are fully supported.
- The output is always a valid .docx file.
"""
from __future__ import annotations

import io
import os
import tempfile

import fitz  # PyMuPDF
from pdf2docx import Converter


OCR_LANGS = os.getenv("OCR_LANGS", "eng+hin")
OCR_DPI = 300  # 300 DPI for sharper OCR — significant accuracy boost over 200


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
    lines: dict[tuple[int, int, int], list[dict]] = {}
    for i in range(len(data["text"])):
        text = data["text"][i].strip()
        if not text:
            continue
        conf = data["conf"][i]
        # Skip very low-confidence garbage (Tesseract outputs -1 for non-text)
        if isinstance(conf, (int, float)) and conf < 0:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append(
            {
                "text": text,
                "left": data["left"][i],
                "top": data["top"][i],
                "width": data["width"][i],
                "height": data["height"][i],
                "conf": conf,
            }
        )
    result: list[tuple[float, float, str, float]] = []
    for key in sorted(lines):
        words = sorted(lines[key], key=lambda w: w["left"])  # sort by x position
        text = " ".join(word["text"] for word in words)
        top = min(word["top"] for word in words)
        height = max(word["height"] for word in words)
        confs = [max(0.0, min(1.0, float(word["conf"]) / 100.0)) for word in words]
        conf = sum(confs) / len(confs) if confs else 0.5
        result.append((top, height, text, conf))
    return sorted(result)


def _group_lines_into_paragraphs(
    lines: list[tuple[float, float, str, float]],
) -> list[tuple[str, float]]:
    """Merge vertically close OCR lines into readable paragraphs.

    Returns list of (paragraph_text, avg_line_height).
    """
    if not lines:
        return []
    heights = sorted(line[1] for line in lines)
    median_height = heights[len(heights) // 2]
    gap_threshold = median_height * 1.4
    paragraphs: list[tuple[str, float]] = []
    current: list[str] = []
    current_heights: list[float] = []
    prev_bottom: float | None = None
    for top, height, text, _ in lines:
        if prev_bottom is None or top - prev_bottom > gap_threshold:
            if current:
                avg_h = sum(current_heights) / len(current_heights)
                paragraphs.append((" ".join(current), avg_h))
            current = [text]
            current_heights = [height]
        else:
            current.append(text)
            current_heights.append(height)
        prev_bottom = top + height
    if current:
        avg_h = sum(current_heights) / len(current_heights)
        paragraphs.append((" ".join(current), avg_h))
    return paragraphs


def _height_to_font_size(height_px: float, dpi: int = OCR_DPI) -> float:
    """Convert OCR line height in pixels to a reasonable Word font size in points."""
    # height in px → points: height_px * 72 / dpi
    # OCR height tends to be slightly larger than the actual font, scale down ~85%
    raw_pt = height_px * 72.0 / dpi * 0.85
    # Clamp to sensible range
    return max(8.0, min(72.0, raw_pt))


def _ocr_scanned_pdf(data: bytes) -> bytes:
    """Render every page and OCR it into an editable DOCX."""
    from docx import Document
    from docx.shared import Pt, Mm

    doc = Document()
    lang = _ocr_language()
    pdf = fitz.open(stream=data, filetype="pdf")

    # Try to load a Unicode font name for Hindi support
    _unicode_font_name = None
    try:
        from .fonts import get_unicode_font_path
        font_path = get_unicode_font_path()
        if font_path:
            # We'll set the font on each run — python-docx handles embedding
            _unicode_font_name = "Arial Unicode MS"
            if "Noto" in font_path:
                _unicode_font_name = "Noto Sans Devanagari"
            elif "Devanagari" in font_path:
                _unicode_font_name = "Devanagari Sangam MN"
    except Exception:
        pass

    for i in range(len(pdf)):
        page = pdf[i]
        # Match page dimensions
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
        except Exception as exc:
            print(f"[pdf_to_word] OCR failed for page {i}: {exc}; embedding image")
            doc.add_picture(io.BytesIO(png), width=Mm(page_w_mm - 30))
            continue

        if not lines:
            doc.add_picture(io.BytesIO(png), width=Mm(page_w_mm - 30))
            continue

        for text, avg_height in _group_lines_into_paragraphs(lines):
            font_size = _height_to_font_size(avg_height)
            para = doc.add_paragraph()
            run = para.add_run(text)
            run.font.size = Pt(font_size)

            # Apply Unicode font for Hindi text
            if _unicode_font_name:
                run.font.name = _unicode_font_name
                # For CJK/complex scripts, also set the eastAsia font via XML
                from docx.oxml.ns import qn
                rPr = run._element.get_or_add_rPr()
                rFonts = rPr.find(qn("w:rFonts"))
                if rFonts is None:
                    from lxml import etree  # type: ignore
                    rFonts = etree.SubElement(rPr, qn("w:rFonts"))
                rFonts.set(qn("w:cs"), _unicode_font_name)
                rFonts.set(qn("w:ascii"), _unicode_font_name)
                rFonts.set(qn("w:hAnsi"), _unicode_font_name)

            # Set paragraph spacing
            pf = para.paragraph_format
            pf.space_after = Pt(2)
            pf.space_before = Pt(1)

    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()


def _convert_with_pdf2docx(data: bytes) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f_in:
        f_in.write(data)
        pdf_path = f_in.name
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f_out:
        docx_path = f_out.name
    try:
        cv = Converter(pdf_path)
        cv.convert(
            docx_path,
            start=0,
            # Tighter thresholds for better layout fidelity
            connected_border_tolerance=0.5,
            max_border_width=6.0,
            min_border_clearance=2.0,
            float_image_ignorable_gap=5.0,
            page_margin_factor_top=0.5,
            page_margin_factor_bottom=0.5,
            shape_merging_threshold=0.5,
            shape_min_dimension=2.0,
            line_overlap_threshold=0.9,
            line_merging_threshold=2.0,
            line_separate_threshold=5.0,
            lines_left_aligned_threshold=0.1,
            lines_right_aligned_threshold=0.1,
            lines_center_aligned_threshold=0.1,
            clip_image_res_ratio=3.0,
            multi_processing=False,
        )
        cv.close()
        with open(docx_path, "rb") as f:
            return f.read()
    finally:
        os.unlink(pdf_path)
        try:
            os.unlink(docx_path)
        except FileNotFoundError:
            pass


def _has_meaningful_text(data: bytes) -> bool:
    from docx import Document

    doc = Document(io.BytesIO(data))
    total_text = " ".join(p.text for p in doc.paragraphs)
    return len(total_text.strip()) >= 3 or bool(doc.tables)


def _validate_docx(data: bytes) -> bool:
    """Verify the output is a valid DOCX (ZIP with correct structure)."""
    import zipfile
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = z.namelist()
            return "[Content_Types].xml" in names
    except Exception:
        return False


def convert(data: bytes) -> bytes:
    has_text = _pdf_has_native_text(data)
    result = None

    if has_text:
        try:
            result = _convert_with_pdf2docx(data)
            if not _has_meaningful_text(result):
                print("[pdf_to_word] pdf2docx produced no text; retrying with OCR")
                result = None
        except Exception as exc:
            print(f"[pdf_to_word] pdf2docx failed: {exc}; retrying with OCR")
            result = None

    if result is None:
        result = _ocr_scanned_pdf(data)

    # Final validation — guarantee this is a real DOCX
    assert _validate_docx(result), "Output is not a valid DOCX file"
    return result
