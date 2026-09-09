"""
Anything Convertable — FastAPI backend
====================================
Routes
------
GET  /health                   liveness probe
GET  /v1/conversions           list all available conversions + metadata
POST /v1/detect                classify uploaded file, suggest conversions
POST /v1/convert/{id}          run a specific conversion, stream the result file
"""
from __future__ import annotations

import os
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .core.config import settings
from .models.schemas import ConversionMeta, ConvertResponse, DetectResponse
from .conversions.registry import get_entry, get_registry
from .conversions.shared import (
    classify_document,
    extract_pdf_pages,
    load_image,
    ocr_image,
    ConversionError,
    ValidationError,
)

app = FastAPI(title='Anything Convertable API', version='0.2.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_image(content_type: str, filename: str) -> bool:
    ct = (content_type or '').lower()
    fn = (filename or '').lower()
    return (
        ct.startswith('image/')
        or fn.endswith(('.png', '.jpg', '.jpeg', '.webp'))
    )


def _is_pdf(content_type: str, filename: str) -> bool:
    return (
        'pdf' in (content_type or '').lower()
        or (filename or '').lower().endswith('.pdf')
    )


_SUGGESTION_MAP: dict[str, list[str]] = {
    'invoice':    ['invoice_to_xlsx', 'invoice_to_json', 'invoice_to_csv',
                   'pdf_to_docx', 'image_to_docx'],
    'resume':     ['resume_to_docx', 'pdf_to_docx', 'image_to_docx'],
    'screenshot': ['screenshot_to_html', 'image_to_docx', 'image_to_xlsx'],
    'pdf':        ['pdf_to_docx', 'pdf_to_xlsx', 'pdf_to_pptx'],
    'image':      ['image_to_docx', 'image_to_xlsx', 'image_to_searchable_pdf'],
    'generic':    ['pdf_to_docx', 'pdf_to_xlsx', 'image_to_docx'],
}


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get('/health')
def health() -> dict:
    return {'ok': True, 'service': 'anything-convertable-api', 'version': '0.2.0'}


@app.get('/v1/conversions', response_model=list[ConversionMeta])
def list_conversions() -> list[ConversionMeta]:
    """Return all 10 (+ invoice_to_csv) available conversions."""
    return [
        ConversionMeta(
            id=e.id,
            label=e.label,
            description=e.description,
            input_types=e.input_types,
            output_ext=e.output_ext,
            output_mime=e.output_mime,
        )
        for e in get_registry()
    ]


@app.post('/v1/detect', response_model=DetectResponse)
async def detect(file: UploadFile = File(...)) -> DetectResponse:
    """
    Classify the uploaded file and return ordered conversion suggestions.
    Does NOT store the file — the caller must re-upload for /v1/convert.
    """
    data = await file.read()
    filename = file.filename or 'document'
    content_type = file.content_type or ''

    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f'File exceeds {settings.max_upload_mb} MB limit')

    text = ''
    page_count = 0
    has_tables = False
    has_images = False
    warnings: list[str] = []

    try:
        if _is_pdf(content_type, filename):
            pages = extract_pdf_pages(data, ocr_scanned=True)
            page_count = len(pages)
            text = ' '.join(s.text for p in pages for s in p.spans)
            has_tables = any(p.tables for p in pages)
            has_images = any(p.images for p in pages)
        elif _is_image(content_type, filename):
            im = load_image(data)
            lines = ocr_image(im)
            text = ' '.join(ln['text'] for ln in lines)
            has_images = True
        else:
            warnings.append('Unknown file type — treating as generic document')
    except Exception as exc:
        warnings.append(f'Partial extraction: {exc}')

    doc_type = classify_document(filename, text)
    suggestions = _SUGGESTION_MAP.get(doc_type, _SUGGESTION_MAP['generic'])

    # Filter suggestions to those that accept the actual input type
    if _is_pdf(content_type, filename):
        family = 'pdf'
    elif _is_image(content_type, filename):
        family = 'image'
    else:
        family = 'pdf'   # treat unknown as PDF

    filtered = [
        sid for sid in suggestions
        if (entry := get_entry(sid)) and
           (family in entry.input_types or 'any' in entry.input_types)
    ]
    if not filtered:
        filtered = suggestions

    print(f'[detect] file={filename} type={doc_type} pages={page_count} '
          f'text_len={len(text)} tables={has_tables}')

    return DetectResponse(
        doc_type=doc_type,
        suggested_conversions=filtered,
        page_count=page_count,
        has_tables=has_tables,
        has_images=has_images,
        text_length=len(text),
        warnings=warnings,
    )


@app.post('/v1/convert/{conversion_id}')
async def convert(conversion_id: str, file: UploadFile = File(...)) -> Response:
    """
    Run a conversion and stream the result file.

    The conversion_id must be one of the IDs returned by GET /v1/conversions.
    """
    entry = get_entry(conversion_id)
    if entry is None:
        raise HTTPException(404, f'Unknown conversion: {conversion_id!r}. '
                            f'Valid IDs: {[e.id for e in get_registry()]}')

    data = await file.read()
    filename = file.filename or 'document'
    content_type = file.content_type or ''

    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f'File exceeds {settings.max_upload_mb} MB limit')

    # For converters that have an is_image flag, wire it correctly here
    is_img = _is_image(content_type, filename)
    print(f'[convert] id={conversion_id} file={filename} size={len(data)} is_image={is_img}')

    try:
        # Converters that accept both PDF and image need the is_image flag
        if conversion_id in ('invoice_to_xlsx', 'invoice_to_json',
                             'invoice_to_csv', 'resume_to_docx'):
            from .conversions import (
                invoice_to_xlsx, invoice_to_json, resume_to_docx,
            )
            if conversion_id == 'invoice_to_xlsx':
                result = invoice_to_xlsx.convert(data, is_image=is_img)
            elif conversion_id == 'invoice_to_json':
                result = invoice_to_json.convert_json(data, is_image=is_img)
            elif conversion_id == 'invoice_to_csv':
                result = invoice_to_json.convert_csv(data, is_image=is_img)
            else:  # resume_to_docx
                result = resume_to_docx.convert(data, is_image=is_img)
        else:
            result = entry.fn(data)

    except (ConversionError, ValidationError) as exc:
        print(f'[convert] ERROR id={conversion_id}: {exc}')
        raise HTTPException(422, str(exc))
    except Exception as exc:
        print(f'[convert] UNEXPECTED ERROR id={conversion_id}: {exc}')
        raise HTTPException(500, f'Conversion failed: {exc}')

    stem = os.path.splitext(filename)[0] or 'document'
    dl_filename = f'{stem}.{entry.output_ext}'

    print(f'[convert] SUCCESS id={conversion_id} output={len(result)} bytes')

    return Response(
        content=result,
        media_type=entry.output_mime,
        headers={
            'Content-Disposition': f'attachment; filename="{dl_filename}"',
            'X-Conversion-Id': conversion_id,
            'X-Output-Size': str(len(result)),
        },
    )
