from __future__ import annotations
import base64, io, os, uuid
from datetime import datetime, timezone
from typing import Any
import fitz
from PIL import Image


def uid() -> str:
    return str(uuid.uuid4())


def classify(name: str, text: str) -> str:
    s = (name + ' ' + text[:5000]).lower()
    if any(k in s for k in ['invoice', 'gstin', 'subtotal', 'tax invoice']):
        return 'invoice'
    if any(k in s for k in ['resume', 'curriculum vitae', 'experience', 'education', 'skills']):
        return 'resume'
    if any(k in s for k in ['sale', 'offer', 'limited time', 'call now', 'www.']):
        return 'poster'
    return 'document'


def guess_style(size: float, text: str) -> dict:
    upper = text.strip().isupper()
    weight = 700 if upper or size >= 20 else 400
    return {
        'fontFamily': 'Arial',
        'fontSize': round(max(8, min(72, size)), 1),
        'fontWeight': weight,
        'fontStyle': 'normal',
        'color': '#111827',
        'align': 'left',
        'lineHeight': 1.2,
    }


# ── PDF reconstruction ────────────────────────────────────────────────────────

def page_from_words(page: Any, page_num: int) -> dict:
    rect = page.rect
    blocks = page.get_text('dict')['blocks']
    els: list[dict] = []
    for b in blocks:
        if 'lines' not in b:
            continue
        for line in b['lines']:
            text = ''.join(span.get('text', '') for span in line['spans']).strip()
            if not text:
                continue
            bb = line['bbox']
            max_size = max((span.get('size', 12) for span in line['spans']), default=12)
            els.append({
                'id': uid(),
                'type': 'text',
                'text': text,
                'bounds': {
                    'x': bb[0], 'y': bb[1],
                    'width': max(1, bb[2] - bb[0]),
                    'height': max(1, bb[3] - bb[1]),
                },
                'zIndex': 10,
                'confidence': 0.98,
                'style': guess_style(max_size, text),
            })
    els.sort(key=lambda e: (e['bounds']['y'], e['bounds']['x']))
    return {
        'id': uid(),
        'width': rect.width,
        'height': rect.height,
        'background': '#ffffff',
        'elements': els,
        'source': {'page': page_num},
    }


# ── Image OCR ─────────────────────────────────────────────────────────────────

def _ocr_to_elements(im: Image.Image) -> list[dict]:
    """
    Run Tesseract at block level so we get meaningful text chunks rather than
    isolated words.  Returns a list of AEDOM text elements.
    Falls back to word-level if block-level returns nothing useful.
    """
    import pytesseract  # type: ignore  # lazy — only needed here

    results: list[dict] = []

    # ── Block level (best for paragraphs / multi-word strings) ───────────────
    try:
        tsv = pytesseract.image_to_data(
            im,
            output_type=pytesseract.Output.DICT,
            config='--psm 11',   # sparse text — good for mixed layouts
        )
        n = len(tsv['text'])

        # Group words by (block_num, par_num, line_num)
        from collections import defaultdict
        lines: dict[tuple, list[int]] = defaultdict(list)
        for i in range(n):
            if tsv['text'][i].strip():
                key = (tsv['block_num'][i], tsv['par_num'][i], tsv['line_num'][i])
                lines[key].append(i)

        for key, idxs in sorted(lines.items()):
            words = [tsv['text'][i].strip() for i in idxs if tsv['text'][i].strip()]
            if not words:
                continue
            text = ' '.join(words)
            # bounding box = union of all word boxes in this line
            xs = [tsv['left'][i] for i in idxs]
            ys = [tsv['top'][i] for i in idxs]
            x2s = [tsv['left'][i] + tsv['width'][i] for i in idxs]
            y2s = [tsv['top'][i] + tsv['height'][i] for i in idxs]
            x, y = min(xs), min(ys)
            w = max(x2s) - x
            h = max(y2s) - y
            if w < 2 or h < 2:
                continue
            confs = []
            for i in idxs:
                try:
                    confs.append(float(tsv['conf'][i]) / 100)
                except Exception:
                    confs.append(0.5)
            conf = max(0.0, min(1.0, sum(confs) / len(confs))) if confs else 0.5
            if conf < 0.0:
                conf = 0.0
            results.append({
                'id': uid(),
                'type': 'text',
                'text': text,
                'bounds': {'x': x, 'y': y, 'width': w, 'height': h},
                'zIndex': 10,
                'confidence': round(conf, 3),
                'style': guess_style(max(10, h * 0.8), text),
            })

        if results:
            print(f'[reconstruct] OCR line-level: {len(results)} text elements')
            return results

    except Exception as exc:
        print(f'[reconstruct] OCR block-level failed: {exc}, falling back to word-level')

    # ── Word level fallback ───────────────────────────────────────────────────
    try:
        d = pytesseract.image_to_data(im, output_type=pytesseract.Output.DICT)
        for i in range(len(d['text'])):
            text = d['text'][i].strip()
            if not text:
                continue
            try:
                conf = float(d['conf'][i]) / 100
            except Exception:
                conf = 0.5
            x, y, w, h = int(d['left'][i]), int(d['top'][i]), int(d['width'][i]), int(d['height'][i])
            if w < 2 or h < 2:
                continue
            results.append({
                'id': uid(),
                'type': 'text',
                'text': text,
                'bounds': {'x': x, 'y': y, 'width': w, 'height': h},
                'zIndex': 10,
                'confidence': max(0.0, min(1.0, conf)),
                'style': guess_style(max(10, h * 0.8), text),
            })
        print(f'[reconstruct] OCR word-level fallback: {len(results)} text elements')
    except Exception as exc:
        print(f'[reconstruct] OCR word-level failed: {exc}')

    return results


# ── Image → AEDOM ─────────────────────────────────────────────────────────────

def image_to_aedom(data: bytes, name: str) -> tuple[dict[str, Any], bytes | None]:
    im = Image.open(io.BytesIO(data)).convert('RGB')

    # Always embed the source image as a base64 data URL so the browser can
    # display it without a server round-trip.
    buf = io.BytesIO()
    im.save(buf, format='JPEG', quality=92)
    b64 = base64.b64encode(buf.getvalue()).decode()
    data_url = f'data:image/jpeg;base64,{b64}'

    print(f'[reconstruct] image_to_aedom: {name} {im.width}×{im.height} '
          f'data_url_len={len(data_url)}')

    # Layer 0 — original image (locked, non-draggable background reference)
    bg_el: dict = {
        'id': uid(),
        'type': 'image',
        'src': data_url,
        'alt': name,
        'objectFit': 'fill',
        'bounds': {'x': 0, 'y': 0, 'width': im.width, 'height': im.height},
        'zIndex': 0,
        'confidence': 1.0,
        'locked': True,
    }

    page: dict = {
        'id': uid(),
        'width': im.width,
        'height': im.height,
        'background': '#ffffff',
        'elements': [bg_el],
    }

    # Layer 10+ — OCR text elements
    ocr_els: list[dict] = []
    try:
        ocr_els = _ocr_to_elements(im)
    except ImportError:
        print('[reconstruct] pytesseract not available — no OCR text elements')

    page['elements'].extend(ocr_els)

    # Sort: image (zIndex 0) always first, then text by position
    page['elements'].sort(key=lambda e: (e['zIndex'], e['bounds']['y'], e['bounds']['x']))

    all_text = ' '.join(e.get('text', '') for e in page['elements'] if e['type'] == 'text')
    doc = make_doc(name, 'image', classify(name, all_text), [page])

    print(f'[reconstruct] image done: {len(page["elements"])} elements '
          f'({len(ocr_els)} OCR text)')
    return doc, buf.getvalue()


# ── Document helpers ──────────────────────────────────────────────────────────

def make_doc(title: str, source_type: str, doc_type: str, pages: list) -> dict:
    return {
        'schemaVersion': '0.1',
        'id': uid(),
        'title': os.path.splitext(title)[0] or 'Untitled',
        'width': pages[0]['width'],
        'height': pages[0]['height'],
        'pages': pages,
        'metadata': {
            'sourceType': source_type,
            'documentType': doc_type,
            'createdAt': datetime.now(timezone.utc).isoformat(),
        },
    }


def reconstruct(data: bytes, name: str, content_type: str) -> tuple[dict, bytes | None]:
    print(f'[reconstruct] name={name} content_type={content_type} bytes={len(data)}')
    if content_type == 'application/pdf' or name.lower().endswith('.pdf'):
        pdf = fitz.open(stream=data, filetype='pdf')
        pages = [page_from_words(pdf[i], i) for i in range(len(pdf))]
        text = ' '.join(e['text'] for pg in pages for e in pg['elements'])
        doc = make_doc(name, 'pdf', classify(name, text), pages)
        total_els = sum(len(p['elements']) for p in pages)
        print(f'[reconstruct] PDF: {len(pages)} pages, {total_els} text elements')
        return doc, None
    return image_to_aedom(data, name)


def score(doc: dict[str, Any]) -> dict[str, Any]:
    els = [e for p in doc.get('pages', []) for e in p.get('elements', [])]
    text_els = [e for e in els if e['type'] == 'text']
    if not text_els:
        return {
            'overall': 0.25,
            'textAccuracy': 0.0,
            'layoutAccuracy': 0.35,
            'elementAccuracy': 0.25,
            'visualSimilarity': 0.3,
            'lowConfidenceElementIds': [],
            'notes': [
                'No text elements were detected. '
                'Install pytesseract + Tesseract for OCR, or provide OPENAI_API_KEY for vision refinement.'
            ],
        }
    avg = sum(float(e.get('confidence', 0.75)) for e in text_els) / len(text_els)
    low = [e['id'] for e in text_els if float(e.get('confidence', 0.75)) < 0.7]
    layout = 0.85 if len(text_els) < 200 else 0.75
    elem = 0.8
    visual = 0.78
    overall = round(0.35 * avg + 0.25 * layout + 0.2 * elem + 0.2 * visual, 3)
    return {
        'overall': overall,
        'textAccuracy': round(avg, 3),
        'layoutAccuracy': layout,
        'elementAccuracy': elem,
        'visualSimilarity': visual,
        'lowConfidenceElementIds': low,
        'notes': [],
    }
