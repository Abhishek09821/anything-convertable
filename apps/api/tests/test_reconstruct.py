"""
Backend unit tests.
Covers reconstruct, score, ai_edit, and exporter.
"""
import base64, io
from PIL import Image as PILImage
from app.services.ai_edit import apply_command
from app.services.reconstruct import reconstruct, score
from app.services.exporter import to_pdf, to_html, to_svg, _data_url_to_bytes, _hex


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_jpeg(w=100, h=80) -> bytes:
    im = PILImage.new('RGB', (w, h), color=(128, 64, 32))
    buf = io.BytesIO()
    im.save(buf, format='JPEG')
    return buf.getvalue()


def _minimal_doc(extra_elements=None):
    els = [
        {
            'id': '1', 'type': 'text',
            'bounds': {'x': 0, 'y': 0, 'width': 100, 'height': 20},
            'text': '₹10,000', 'zIndex': 10,
            'style': {'fontFamily': 'Arial', 'fontSize': 12, 'fontWeight': 400, 'color': '#111827'},
            'confidence': 0.9,
        }
    ]
    if extra_elements:
        els.extend(extra_elements)
    return {
        'schemaVersion': '0.1', 'id': 'doc1', 'title': 'Test',
        'width': 200, 'height': 200,
        'pages': [{'id': 'p1', 'width': 200, 'height': 200, 'background': '#ffffff', 'elements': els}],
        'metadata': {'sourceType': 'test', 'documentType': 'document', 'createdAt': '2026-01-01T00:00:00+00:00'},
    }


# ── reconstruct ───────────────────────────────────────────────────────────────

def test_image_reconstruct_has_image_element():
    """image_to_aedom must always include an image element with a data URL src."""
    data = _make_jpeg()
    doc, preview = reconstruct(data, 'test.jpg', 'image/jpeg')
    page = doc['pages'][0]
    image_els = [e for e in page['elements'] if e['type'] == 'image']
    assert len(image_els) == 1, f'Expected 1 image element, got {len(image_els)}'
    src = image_els[0]['src']
    assert src.startswith('data:image/jpeg;base64,'), f'src must be a data URL, got: {src[:60]}'
    assert len(src) > 100, 'data URL too short'


def test_image_reconstruct_dimensions():
    """Page dimensions must match the uploaded image."""
    data = _make_jpeg(w=320, h=240)
    doc, _ = reconstruct(data, 'photo.jpg', 'image/jpeg')
    page = doc['pages'][0]
    assert page['width'] == 320
    assert page['height'] == 240


def test_image_reconstruct_fallback_no_ocr():
    """Even with no OCR available, image element must be present (never blank canvas)."""
    data = _make_jpeg()
    doc, _ = reconstruct(data, 'img.png', 'image/png')
    els = doc['pages'][0]['elements']
    assert any(e['type'] == 'image' for e in els), 'Must have at least one image element'


def test_image_element_zindex_zero():
    """Background image element must have zIndex=0 so text renders above it."""
    data = _make_jpeg()
    doc, _ = reconstruct(data, 'test.jpg', 'image/jpeg')
    img_el = next(e for e in doc['pages'][0]['elements'] if e['type'] == 'image')
    assert img_el['zIndex'] == 0


def test_pdf_reconstruct():
    """PDF reconstruction must return a document with at least one page."""
    import fitz
    # create a minimal single-page PDF with text
    pdf_doc = fitz.open()
    page = pdf_doc.new_page(width=595, height=842)
    page.insert_text((72, 72), 'Hello World', fontsize=12)
    buf = io.BytesIO()
    pdf_doc.save(buf)
    data = buf.getvalue()
    doc, preview = reconstruct(data, 'test.pdf', 'application/pdf')
    assert len(doc['pages']) == 1
    assert preview is None  # PDF returns no preview bytes
    text_els = [e for e in doc['pages'][0]['elements'] if e['type'] == 'text']
    assert len(text_els) >= 1


# ── score ─────────────────────────────────────────────────────────────────────

def test_score_with_elements():
    d = {'pages': [{'elements': [{'id': '1', 'type': 'text', 'confidence': 0.9}]}]}
    s = score(d)
    assert s['overall'] > 0
    assert 0 <= s['overall'] <= 1


def test_score_empty_elements():
    d = {'pages': [{'elements': []}]}
    s = score(d)
    assert s['overall'] == 0.25  # fallback value


# ── ai_edit ───────────────────────────────────────────────────────────────────

def test_edit_amount():
    doc = _minimal_doc()
    out = apply_command(doc, 'Change ₹10,000 to ₹15,000')
    assert out['pages'][0]['elements'][0]['text'] == '₹15,000'


def test_edit_bold():
    doc = _minimal_doc()
    out = apply_command(doc, 'Make bold')
    assert out['pages'][0]['elements'][0]['style']['fontWeight'] == 700


def test_edit_italic():
    doc = _minimal_doc()
    out = apply_command(doc, 'Make italic')
    assert out['pages'][0]['elements'][0]['style']['fontStyle'] == 'italic'


def test_edit_color():
    doc = _minimal_doc()
    out = apply_command(doc, 'Change color to blue')
    assert out['pages'][0]['elements'][0]['style']['color'] == '#2563eb'


def test_edit_font_size():
    doc = _minimal_doc()
    out = apply_command(doc, 'Set font size to 24')
    assert out['pages'][0]['elements'][0]['style']['fontSize'] == 24.0


def test_edit_move_right():
    doc = _minimal_doc()
    original_x = doc['pages'][0]['elements'][0]['bounds']['x']
    out = apply_command(doc, 'Move right 50px', selected_id='1')
    assert out['pages'][0]['elements'][0]['bounds']['x'] == original_x + 50


def test_edit_delete_by_id():
    doc = _minimal_doc()
    out = apply_command(doc, 'Delete', selected_id='1')
    assert len(out['pages'][0]['elements']) == 0


def test_edit_no_match_returns_unchanged():
    doc = _minimal_doc()
    out = apply_command(doc, 'xyzzy nonexistent command')
    assert out['pages'][0]['elements'][0]['text'] == '₹10,000'


def test_edit_selected_id_scopes_bold():
    """Bold with a selected_id should only affect that element."""
    doc = _minimal_doc(extra_elements=[{
        'id': '2', 'type': 'text',
        'bounds': {'x': 0, 'y': 30, 'width': 100, 'height': 20},
        'text': 'Other', 'zIndex': 10,
        'style': {'fontFamily': 'Arial', 'fontSize': 12, 'fontWeight': 400, 'color': '#111827'},
        'confidence': 0.9,
    }])
    out = apply_command(doc, 'Make bold', selected_id='1')
    els = {e['id']: e for e in out['pages'][0]['elements']}
    assert els['1']['style']['fontWeight'] == 700
    assert els['2']['style']['fontWeight'] == 400  # unaffected


# ── exporter ─────────────────────────────────────────────────────────────────

def _doc_with_image():
    """Create a minimal AEDOM doc with an image element (base64 JPEG)."""
    jpeg_bytes = _make_jpeg(64, 48)
    b64 = base64.b64encode(jpeg_bytes).decode()
    data_url = f'data:image/jpeg;base64,{b64}'
    return {
        'schemaVersion': '0.1', 'id': 'doc2', 'title': 'Export Test',
        'width': 200, 'height': 200,
        'pages': [{
            'id': 'p1', 'width': 200, 'height': 200, 'background': '#ffffff',
            'elements': [
                {
                    'id': 'img1', 'type': 'image', 'src': data_url,
                    'bounds': {'x': 0, 'y': 0, 'width': 200, 'height': 200},
                    'zIndex': 0, 'confidence': 1.0, 'locked': True,
                },
                {
                    'id': 'txt1', 'type': 'text', 'text': 'Hello Export',
                    'bounds': {'x': 10, 'y': 10, 'width': 180, 'height': 30},
                    'zIndex': 10, 'confidence': 0.95,
                    'style': {'fontFamily': 'Arial', 'fontSize': 14, 'fontWeight': 400, 'color': '#111827'},
                },
            ],
        }],
        'metadata': {'sourceType': 'image', 'documentType': 'document', 'createdAt': '2026-01-01T00:00:00+00:00'},
    }


def test_pdf_export_non_empty():
    doc = _doc_with_image()
    data, mime = to_pdf(doc)
    assert mime == 'application/pdf'
    assert len(data) > 1000, 'PDF must be non-trivial size'
    assert data[:4] == b'%PDF', 'Must start with PDF magic bytes'


def test_html_export_contains_image_and_text():
    doc = _doc_with_image()
    data, mime = to_html(doc)
    html = data.decode('utf-8')
    assert 'data:image/jpeg;base64,' in html, 'HTML must embed the image data URL'
    assert 'Hello Export' in html, 'HTML must contain text'


def test_svg_export_contains_image_and_text():
    doc = _doc_with_image()
    data, mime = to_svg(doc)
    svg = data.decode('utf-8')
    assert 'data:image/jpeg;base64,' in svg, 'SVG must embed the image'
    assert 'Hello Export' in svg, 'SVG must contain text'


def test_data_url_roundtrip():
    jpeg = _make_jpeg(10, 10)
    b64 = base64.b64encode(jpeg).decode()
    url = f'data:image/jpeg;base64,{b64}'
    recovered = _data_url_to_bytes(url)
    assert recovered == jpeg


def test_hex_helper():
    assert _hex('#ff0000') == '#ff0000'
    assert _hex('#abc') == '#aabbcc'
    assert _hex('garbage', '#123456') == '#123456'
    assert _hex('') == '#000000'
