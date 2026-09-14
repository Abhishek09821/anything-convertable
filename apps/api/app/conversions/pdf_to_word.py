"""
PDF → Word (DOCX)

Accuracy strategy:
- Searchable PDFs (with native text) use pdf2docx, the best pure-Python
  layout-preserving converter. It reconstructs text blocks, tables, images
  and approximate positioning.
- Scanned / image-only PDFs are rendered at 200 DPI and OCRed with Tesseract
  (eng+hin for mixed Hindi/English, configurable via OCR_LANGS). The OCR text
  is grouped into paragraphs and written as real editable DOCX paragraphs —
  never a flat image — so the result stays editable and searchable.
- If OCR is unavailable or produces no text on a page, that page is embedded
  as a rendered picture so content is never lost.
- Multi-page PDFs are fully supported.
- Typical conversion: < 5 sec for a 10-page document.
"""
from __future__ import annotations

import io
import os
import tempfile

import fitz  # PyMuPDF
from pdf2docx import Converter


OCR_LANGS = os.getenv("OCR_LANGS", "eng+hin")
OCR_DPI = 200


def _ocr_language() -> str:
    """Return the best Tesseract language string available in this runtime."""
    try:
        import pytesseract
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
        for page in pdf:
            if page.get_text("text").strip():
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
    import pytesseract
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
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append(
            {
                "text": text,
                "top": data["top"][i],
                "height": data["height"][i],
                "conf": data["conf"][i],
            }
        )
    result: list[tuple[float, float, str, float]] = []
    for key in sorted(lines):
        words = sorted(lines[key], key=lambda word: word["top"])
        text = " ".join(word["text"] for word in words)
        top = min(word["top"] for word in words)
        height = max(word["height"] for word in words)
        confs = [max(0.0, min(1.0, float(word["conf"]) / 100.0)) for word in words]
        conf = sum(confs) / len(confs) if confs else 0.5
        result.append((top, height, text, conf))
    return sorted(result)


def _group_lines_into_paragraphs(
    lines: list[tuple[float, float, str, float]],
) -> list[str]:
    """Merge vertically close OCR lines into readable paragraphs."""
    if not lines:
        return []
    heights = sorted(line[1] for line in lines)
    median_height = heights[len(heights) // 2]
    gap_threshold = median_height * 1.5
    paragraphs: list[str] = []
    current: list[str] = []
    prev_bottom: float | None = None
    for top, height, text, _ in lines:
        if prev_bottom is None or top - prev_bottom > gap_threshold:
            if current:
                paragraphs.append(" ".join(current))
            current = [text]
        else:
            current.append(text)
        prev_bottom = top + height
    if current:
        paragraphs.append(" ".join(current))
    return paragraphs


def _ocr_scanned_pdf(data: bytes) -> bytes:
    """Render every page and OCRed it into an editable DOCX."""
    from docx import Document
    from docx.shared import Inches

    doc = Document()
    lang = _ocr_language()
    pdf = fitz.open(stream=data, filetype="pdf")
    for i, page in enumerate(pdf):
        if i > 0:
            doc.add_page_break()
        png = _render_page(page)
        try:
            lines = _ocr_page_lines(png, lang)
        except Exception as exc:
            print(f"[pdf_to_word] OCR failed for page {i}: {exc}; embedding image")
            doc.add_picture(io.BytesIO(png), width=Inches(6.5))
            continue
        if not lines:
            doc.add_picture(io.BytesIO(png), width=Inches(6.5))
            continue
        for text in _group_lines_into_paragraphs(lines):
            doc.add_paragraph(text)

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
            end=None,
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


def convert(data: bytes) -> bytes:
    has_text = _pdf_has_native_text(data)
    if has_text:
        try:
            result = _convert_with_pdf2docx(data)
            if _has_meaningful_text(result):
                return result
            print("[pdf_to_word] pdf2docx produced no text; retrying with OCR")
        except Exception as exc:
            print(f"[pdf_to_word] pdf2docx failed: {exc}; retrying with OCR")
    return _ocr_scanned_pdf(data)
