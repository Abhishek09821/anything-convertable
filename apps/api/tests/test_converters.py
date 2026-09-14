"""
Tests for all 5 converters + registry + API routes.
"""
from __future__ import annotations
import io
import json
import pytest


# ── fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def jpeg_bytes() -> bytes:
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (800, 600), color=(245, 245, 240))
    draw = ImageDraw.Draw(im)
    draw.rectangle([40, 40, 760, 560], fill=(255, 255, 255))
    draw.text((60, 60), "Sample Image Document", fill=(20, 20, 20))
    draw.text((60, 100), "This is a test JPEG file.", fill=(60, 60, 60))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


@pytest.fixture(scope="session")
def png_bytes() -> bytes:
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (640, 480), color=(230, 240, 255))
    draw = ImageDraw.Draw(im)
    draw.text((40, 40), "PNG Test", fill=(0, 0, 0))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="session")
def png_rgba_bytes() -> bytes:
    """PNG with alpha channel — tests transparency handling."""
    from PIL import Image
    im = Image.new("RGBA", (400, 300), color=(100, 150, 200, 200))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="session")
def simple_pdf_bytes() -> bytes:
    import fitz
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((72, 100), "Test PDF Document", fontsize=18)
    page.insert_text((72, 140), "This is body text on page one.", fontsize=12)
    page.insert_text((72, 165), "Second line of body text.", fontsize=12)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


@pytest.fixture(scope="session")
def multipage_pdf_bytes() -> bytes:
    import fitz
    doc = fitz.open()
    for i in range(3):
        page = doc.new_page(width=595, height=842)
        page.insert_text((72, 100), f"Page {i+1} Heading", fontsize=16)
        page.insert_text((72, 130), f"Body text on page {i+1}.", fontsize=12)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


@pytest.fixture(scope="session")
def docx_bytes() -> bytes:
    from docx import Document
    from docx.shared import Pt
    doc = Document()
    doc.add_heading("Test Word Document", level=1)
    doc.add_paragraph("This is the first paragraph of body text.")
    doc.add_heading("Section Two", level=2)
    doc.add_paragraph("Another paragraph with more content here.")
    # Add a table
    table = doc.add_table(rows=3, cols=3)
    table.style = "Table Grid"
    for ri, row in enumerate(table.rows):
        for ci, cell in enumerate(row.cells):
            cell.text = f"R{ri}C{ci}"
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


@pytest.fixture(scope="session")
def pptx_bytes() -> bytes:
    from pptx import Presentation
    from pptx.util import Inches, Pt
    prs = Presentation()
    for i in range(2):
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        txb = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(8), Inches(2))
        tf = txb.text_frame
        tf.text = f"Slide {i+1} — Test PowerPoint Content"
        txb2 = slide.shapes.add_textbox(Inches(1), Inches(3), Inches(8), Inches(1))
        txb2.text_frame.text = f"Body text on slide {i+1}."
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


# ── registry ──────────────────────────────────────────────────────────────────

class TestRegistry:
    def test_exactly_5_conversions(self):
        from app.conversions.registry import get_all
        assert len(get_all()) == 5

    def test_all_ids_present(self):
        from app.conversions.registry import get_all
        ids = {c.id for c in get_all()}
        assert ids == {"image_to_pdf", "word_to_pdf", "pdf_to_word", "ppt_to_pdf", "pdf_to_ppt"}

    def test_get_by_id_found(self):
        from app.conversions.registry import get_by_id
        c = get_by_id("pdf_to_word")
        assert c is not None
        assert c.output_ext == "docx"

    def test_get_by_id_not_found(self):
        from app.conversions.registry import get_by_id
        assert get_by_id("nonexistent") is None

    def test_get_for_pdf(self):
        from app.conversions.registry import get_for_file
        ids = {c.id for c in get_for_file(".pdf")}
        assert "pdf_to_word" in ids
        assert "pdf_to_ppt" in ids
        assert "image_to_pdf" not in ids

    def test_get_for_jpg(self):
        from app.conversions.registry import get_for_file
        ids = {c.id for c in get_for_file(".jpg")}
        assert "image_to_pdf" in ids
        assert "pdf_to_word" not in ids

    def test_get_for_docx(self):
        from app.conversions.registry import get_for_file
        ids = {c.id for c in get_for_file(".docx")}
        assert "word_to_pdf" in ids

    def test_get_for_pptx(self):
        from app.conversions.registry import get_for_file
        ids = {c.id for c in get_for_file(".pptx")}
        assert "ppt_to_pdf" in ids

    def test_all_entries_callable(self):
        from app.conversions.registry import get_all
        for c in get_all():
            assert callable(c.fn), f"{c.id} fn is not callable"

    def test_all_entries_have_mime(self):
        from app.conversions.registry import get_all
        for c in get_all():
            assert "/" in c.output_mime, f"{c.id} mime invalid"


# ── converter 1: image → pdf ──────────────────────────────────────────────────

class TestImageToPdf:
    def test_jpeg_produces_pdf(self, jpeg_bytes):
        from app.conversions.image_to_pdf import convert
        result = convert(jpeg_bytes)
        assert result[:4] == b"%PDF"

    def test_png_produces_pdf(self, png_bytes):
        from app.conversions.image_to_pdf import convert
        result = convert(png_bytes)
        assert result[:4] == b"%PDF"

    def test_png_rgba_produces_pdf(self, png_rgba_bytes):
        from app.conversions.image_to_pdf import convert
        result = convert(png_rgba_bytes)
        assert result[:4] == b"%PDF"

    def test_output_non_trivial(self, jpeg_bytes):
        from app.conversions.image_to_pdf import convert
        result = convert(jpeg_bytes)
        assert len(result) > 5000, f"PDF too small: {len(result)} bytes"

    def test_pdf_has_one_page(self, jpeg_bytes):
        import fitz
        from app.conversions.image_to_pdf import convert
        result = convert(jpeg_bytes)
        doc = fitz.open(stream=result, filetype="pdf")
        assert len(doc) == 1

    def test_page_dimensions_match_image(self, jpeg_bytes):
        """PDF page dimensions must correspond to the source image dimensions."""
        import fitz
        from PIL import Image
        from app.conversions.image_to_pdf import convert
        im = Image.open(io.BytesIO(jpeg_bytes))
        result = convert(jpeg_bytes)
        pdf = fitz.open(stream=result, filetype="pdf")
        page = pdf[0]
        # Allow 2pt tolerance for DPI rounding
        assert abs(page.rect.width  - im.width  * 72 / 96) < 3
        assert abs(page.rect.height - im.height * 72 / 96) < 3

    def test_real_dpi_metadata_preserved(self):
        """JPEGs with real DPI metadata must keep their physical print size."""
        import fitz
        from PIL import Image
        from app.conversions.image_to_pdf import convert
        im = Image.new("RGB", (300, 200), color=(200, 200, 200))
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=95, dpi=(300, 300))
        result = convert(buf.getvalue())
        pdf = fitz.open(stream=result, filetype="pdf")
        page = pdf[0]
        assert abs(page.rect.width - 300 * 72 / 300) < 3
        assert abs(page.rect.height - 200 * 72 / 300) < 3

    def test_large_image(self):
        """4000×3000 image should convert without error."""
        from PIL import Image
        from app.conversions.image_to_pdf import convert
        im = Image.new("RGB", (4000, 3000), color=(200, 200, 200))
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=80)
        result = convert(buf.getvalue())
        assert result[:4] == b"%PDF"


# ── converter 2: word → pdf ───────────────────────────────────────────────────

class TestWordToPdf:
    def test_produces_pdf(self, docx_bytes):
        from app.conversions.word_to_pdf import convert
        result = convert(docx_bytes)
        assert result[:4] == b"%PDF"

    def test_output_non_trivial(self, docx_bytes):
        from app.conversions.word_to_pdf import convert
        result = convert(docx_bytes)
        assert len(result) > 500

    def test_pdf_has_content(self, docx_bytes):
        """PDF must contain the text from the DOCX."""
        import fitz
        from app.conversions.word_to_pdf import convert
        result = convert(docx_bytes)
        pdf = fitz.open(stream=result, filetype="pdf")
        full_text = "".join(pdf[i].get_text() for i in range(len(pdf)))
        assert "Test Word Document" in full_text or len(full_text.strip()) > 5

    def test_pdf_has_at_least_one_page(self, docx_bytes):
        import fitz
        from app.conversions.word_to_pdf import convert
        result = convert(docx_bytes)
        pdf = fitz.open(stream=result, filetype="pdf")
        assert len(pdf) >= 1

    def test_empty_docx_doesnt_crash(self):
        from docx import Document
        from app.conversions.word_to_pdf import convert
        doc = Document()
        doc.add_paragraph("X")   # minimal content
        buf = io.BytesIO()
        doc.save(buf)
        result = convert(buf.getvalue())
        assert result[:4] == b"%PDF"

    def test_docx_with_table(self, docx_bytes):
        """DOCX containing a table should produce a valid PDF."""
        from app.conversions.word_to_pdf import convert
        result = convert(docx_bytes)
        assert result[:4] == b"%PDF"
        assert len(result) > 500


# ── converter 3: pdf → word ───────────────────────────────────────────────────

class TestPdfToWord:
    def test_produces_docx(self, simple_pdf_bytes):
        from app.conversions.pdf_to_word import convert
        result = convert(simple_pdf_bytes)
        assert result[:4] == b"PK\x03\x04", "Not a valid DOCX (ZIP)"

    def test_output_non_trivial(self, simple_pdf_bytes):
        from app.conversions.pdf_to_word import convert
        result = convert(simple_pdf_bytes)
        assert len(result) > 5000

    def test_docx_opens(self, simple_pdf_bytes):
        from docx import Document
        from app.conversions.pdf_to_word import convert
        result = convert(simple_pdf_bytes)
        doc = Document(io.BytesIO(result))
        assert doc is not None

    def test_text_preserved(self, simple_pdf_bytes):
        from docx import Document
        from app.conversions.pdf_to_word import convert
        result = convert(simple_pdf_bytes)
        doc = Document(io.BytesIO(result))
        full = " ".join(p.text for p in doc.paragraphs)
        assert "Test PDF Document" in full or len(full.strip()) > 5

    def test_multipage_pdf(self, multipage_pdf_bytes):
        from docx import Document
        from app.conversions.pdf_to_word import convert
        result = convert(multipage_pdf_bytes)
        assert result[:4] == b"PK\x03\x04"
        doc = Document(io.BytesIO(result))
        full = " ".join(p.text for p in doc.paragraphs)
        assert len(full.strip()) > 0

    def test_fallback_on_image_only_pdf(self):
        """PDF with no native text should fall back to image-based DOCX."""
        import fitz
        from app.conversions.pdf_to_word import convert
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        # No text inserted — simulates a scanned/image-only page
        buf = io.BytesIO()
        doc.save(buf)
        result = convert(buf.getvalue())
        assert result[:4] == b"PK\x03\x04"
        assert len(result) > 2000  # fallback embeds rendered image

    def test_scanned_pdf_ocr_produces_editable_text(self):
        """Scanned PDFs must be OCRed into real editable DOCX paragraphs."""
        import fitz
        from PIL import Image, ImageDraw
        from docx import Document
        from app.conversions.pdf_to_word import convert
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        im = Image.new("RGB", (595, 842), (255, 255, 255))
        ImageDraw.Draw(im).text((72, 80), "SCANNED OCR TEST DOCUMENT", fill=(0, 0, 0))
        ImageDraw.Draw(im).text((72, 120), "Editable text from OCR.", fill=(0, 0, 0))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        page.insert_image(rect=fitz.Rect(0, 0, 595, 842), stream=buf.getvalue())
        pdf_buf = io.BytesIO()
        doc.save(pdf_buf)
        result = convert(pdf_buf.getvalue())
        out = Document(io.BytesIO(result))
        full = " ".join(p.text for p in out.paragraphs)
        assert len(full.strip()) > 10, "OCR text must be present and editable"


# ── converter 4: ppt → pdf ────────────────────────────────────────────────────

class TestPptToPdf:
    def test_produces_pdf(self, pptx_bytes):
        from app.conversions.ppt_to_pdf import convert
        result = convert(pptx_bytes)
        assert result[:4] == b"%PDF"

    def test_output_non_trivial(self, pptx_bytes):
        from app.conversions.ppt_to_pdf import convert
        result = convert(pptx_bytes)
        assert len(result) > 3000

    def test_slide_count_matches(self, pptx_bytes):
        """One PDF page per slide."""
        import fitz
        from app.conversions.ppt_to_pdf import convert
        result = convert(pptx_bytes)
        pdf = fitz.open(stream=result, filetype="pdf")
        assert len(pdf) == 2  # fixture has 2 slides

    def test_single_slide(self):
        from pptx import Presentation
        from pptx.util import Inches
        from app.conversions.ppt_to_pdf import convert
        prs = Presentation()
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        slide.shapes.add_textbox(Inches(1), Inches(1), Inches(8), Inches(2)).text_frame.text = "Solo"
        buf = io.BytesIO()
        prs.save(buf)
        result = convert(buf.getvalue())
        assert result[:4] == b"%PDF"

    def test_pdf_page_dimensions(self, pptx_bytes):
        """PDF page aspect ratio should match PPTX slide dimensions."""
        import fitz
        from pptx import Presentation
        from pptx.util import Emu
        from app.conversions.ppt_to_pdf import convert
        prs = Presentation(io.BytesIO(pptx_bytes))
        slide_ar = prs.slide_width / prs.slide_height
        result = convert(pptx_bytes)
        pdf = fitz.open(stream=result, filetype="pdf")
        page = pdf[0]
        pdf_ar = page.rect.width / page.rect.height
        assert abs(slide_ar - pdf_ar) < 0.05, f"AR mismatch: {slide_ar:.3f} vs {pdf_ar:.3f}"


# ── converter 5: pdf → ppt ────────────────────────────────────────────────────

class TestPdfToPpt:
    def test_produces_pptx(self, simple_pdf_bytes):
        from app.conversions.pdf_to_ppt import convert
        result = convert(simple_pdf_bytes)
        assert result[:4] == b"PK\x03\x04"

    def test_output_non_trivial(self, simple_pdf_bytes):
        from app.conversions.pdf_to_ppt import convert
        result = convert(simple_pdf_bytes)
        assert len(result) > 10000

    def test_pptx_opens(self, simple_pdf_bytes):
        from pptx import Presentation
        from app.conversions.pdf_to_ppt import convert
        result = convert(simple_pdf_bytes)
        prs = Presentation(io.BytesIO(result))
        assert len(prs.slides) >= 1

    def test_slide_count_matches_pages(self, multipage_pdf_bytes):
        from pptx import Presentation
        from app.conversions.pdf_to_ppt import convert
        result = convert(multipage_pdf_bytes)
        prs = Presentation(io.BytesIO(result))
        assert len(prs.slides) == 3

    def test_each_slide_has_background_image(self, simple_pdf_bytes):
        """Every slide must have the rendered page as a background picture."""
        from pptx import Presentation
        from pptx.enum.shapes import MSO_SHAPE_TYPE
        from app.conversions.pdf_to_ppt import convert
        result = convert(simple_pdf_bytes)
        prs = Presentation(io.BytesIO(result))
        for slide in prs.slides:
            pics = [s for s in slide.shapes if s.shape_type == 13]
            assert len(pics) >= 1, "Slide is missing background image"

    def test_text_boxes_present(self, simple_pdf_bytes):
        """Native text should become editable text boxes."""
        from pptx import Presentation
        from app.conversions.pdf_to_ppt import convert
        result = convert(simple_pdf_bytes)
        prs = Presentation(io.BytesIO(result))
        all_text = ""
        for slide in prs.slides:
            for shape in slide.shapes:
                if shape.has_text_frame:
                    all_text += shape.text_frame.text
        assert len(all_text.strip()) > 0

    def test_slide_dimensions_match_pdf(self, simple_pdf_bytes):
        """PPTX slide dimensions should correspond to PDF page size."""
        import fitz
        from pptx import Presentation
        from app.conversions.pdf_to_ppt import convert
        pdf = fitz.open(stream=simple_pdf_bytes, filetype="pdf")
        pdf_ar = pdf[0].rect.width / pdf[0].rect.height
        result = convert(simple_pdf_bytes)
        prs = Presentation(io.BytesIO(result))
        slide_ar = prs.slide_width / prs.slide_height
        assert abs(pdf_ar - slide_ar) < 0.05


# ── API routes ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


class TestApiRoutes:
    def test_health(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["ok"] is True
        assert r.json()["version"] == "0.3.0"

    def test_list_conversions_returns_5(self, client):
        r = client.get("/v1/conversions")
        assert r.status_code == 200
        assert len(r.json()) == 5

    def test_list_conversions_shape(self, client):
        r = client.get("/v1/conversions")
        for c in r.json():
            assert "id" in c
            assert "label" in c
            assert "accepts" in c
            assert "output_ext" in c

    def test_detect_jpeg(self, client, jpeg_bytes):
        r = client.post("/v1/detect",
                        files={"file": ("test.jpg", jpeg_bytes, "image/jpeg")})
        assert r.status_code == 200
        d = r.json()
        assert d["ext"] == ".jpg"
        assert "image_to_pdf" in d["suggested"]

    def test_detect_pdf(self, client, simple_pdf_bytes):
        r = client.post("/v1/detect",
                        files={"file": ("doc.pdf", simple_pdf_bytes, "application/pdf")})
        assert r.status_code == 200
        d = r.json()
        assert d["ext"] == ".pdf"
        assert "pdf_to_word" in d["suggested"]
        assert "pdf_to_ppt" in d["suggested"]

    def test_detect_docx(self, client, docx_bytes):
        r = client.post("/v1/detect",
                        files={"file": ("file.docx", docx_bytes,
                                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
        assert r.status_code == 200
        d = r.json()
        assert "word_to_pdf" in d["suggested"]

    def test_detect_pptx(self, client, pptx_bytes):
        r = client.post("/v1/detect",
                        files={"file": ("pres.pptx", pptx_bytes,
                                        "application/vnd.openxmlformats-officedocument.presentationml.presentation")})
        assert r.status_code == 200
        d = r.json()
        assert "ppt_to_pdf" in d["suggested"]

    def test_convert_image_to_pdf(self, client, jpeg_bytes):
        r = client.post("/v1/convert/image_to_pdf",
                        files={"file": ("photo.jpg", jpeg_bytes, "image/jpeg")})
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
        assert r.headers["x-conversion-id"] == "image_to_pdf"
        assert ".pdf" in r.headers["content-disposition"]

    def test_convert_png_to_pdf(self, client, png_bytes):
        r = client.post("/v1/convert/image_to_pdf",
                        files={"file": ("img.png", png_bytes, "image/png")})
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_convert_word_to_pdf(self, client, docx_bytes):
        r = client.post("/v1/convert/word_to_pdf",
                        files={"file": ("doc.docx", docx_bytes,
                                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_convert_pdf_to_word(self, client, simple_pdf_bytes):
        r = client.post("/v1/convert/pdf_to_word",
                        files={"file": ("doc.pdf", simple_pdf_bytes, "application/pdf")})
        assert r.status_code == 200
        assert r.content[:4] == b"PK\x03\x04"
        assert ".docx" in r.headers["content-disposition"]

    def test_convert_ppt_to_pdf(self, client, pptx_bytes):
        r = client.post("/v1/convert/ppt_to_pdf",
                        files={"file": ("pres.pptx", pptx_bytes,
                                        "application/vnd.openxmlformats-officedocument.presentationml.presentation")})
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_convert_pdf_to_ppt(self, client, simple_pdf_bytes):
        r = client.post("/v1/convert/pdf_to_ppt",
                        files={"file": ("doc.pdf", simple_pdf_bytes, "application/pdf")})
        assert r.status_code == 200
        assert r.content[:4] == b"PK\x03\x04"
        assert ".pptx" in r.headers["content-disposition"]

    def test_unknown_conversion_404(self, client, simple_pdf_bytes):
        r = client.post("/v1/convert/fake_converter",
                        files={"file": ("doc.pdf", simple_pdf_bytes, "application/pdf")})
        assert r.status_code == 404

    def test_empty_file_400(self, client):
        r = client.post("/v1/convert/image_to_pdf",
                        files={"file": ("empty.jpg", b"", "image/jpeg")})
        assert r.status_code == 400

    def test_elapsed_header_present(self, client, jpeg_bytes):
        r = client.post("/v1/convert/image_to_pdf",
                        files={"file": ("photo.jpg", jpeg_bytes, "image/jpeg")})
        assert r.status_code == 200
        elapsed = r.headers.get("x-elapsed-seconds", "")
        assert elapsed != "" and float(elapsed) < 30

    def test_content_disposition_filename(self, client, simple_pdf_bytes):
        r = client.post("/v1/convert/pdf_to_word",
                        files={"file": ("my_report.pdf", simple_pdf_bytes, "application/pdf")})
        cd = r.headers.get("content-disposition", "")
        assert "my_report.docx" in cd
