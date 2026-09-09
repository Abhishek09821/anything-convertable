"""
registry.py — maps conversion IDs to metadata + callable.

Every entry has:
  id           unique slug used in the API
  label        human-readable name
  description  one-sentence description
  input_types  list of accepted input families: 'pdf', 'image', 'any'
  output_ext   file extension for the download
  output_mime  MIME type for Content-Type header
  fn           callable(data: bytes) -> bytes  (is_image handled inside)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


@dataclass
class ConversionEntry:
    id: str
    label: str
    description: str
    input_types: list[str]
    output_ext: str
    output_mime: str
    fn: Callable[[bytes], bytes]


def _load_registry() -> list[ConversionEntry]:
    # Lazy imports — keeps startup fast and avoids circular imports
    from .pdf_to_docx import convert as pdf_to_docx
    from .pdf_to_xlsx import convert as pdf_to_xlsx
    from .pdf_to_pptx import convert as pdf_to_pptx
    from .image_to_docx import convert as image_to_docx
    from .image_to_xlsx import convert as image_to_xlsx
    from .image_to_searchable_pdf import convert as image_to_spdf
    from .invoice_to_xlsx import convert as inv_xlsx
    from .invoice_to_json import convert_json as inv_json, convert_csv as inv_csv
    from .resume_to_docx import convert as resume_docx
    from .screenshot_to_html import convert as ss_html

    return [
        ConversionEntry(
            id='pdf_to_docx',
            label='PDF → DOCX',
            description='Convert PDF to editable Word document, preserving text, tables and layout.',
            input_types=['pdf'],
            output_ext='docx',
            output_mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            fn=pdf_to_docx,
        ),
        ConversionEntry(
            id='pdf_to_xlsx',
            label='PDF → XLSX',
            description='Extract tables from PDF into a real Excel spreadsheet with proper cells.',
            input_types=['pdf'],
            output_ext='xlsx',
            output_mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            fn=pdf_to_xlsx,
        ),
        ConversionEntry(
            id='pdf_to_pptx',
            label='PDF → PPTX',
            description='Reconstruct PDF pages as editable PowerPoint slides with text overlays.',
            input_types=['pdf'],
            output_ext='pptx',
            output_mime='application/vnd.openxmlformats-officedocument.presentationml.presentation',
            fn=pdf_to_pptx,
        ),
        ConversionEntry(
            id='image_to_docx',
            label='Image / Scan → DOCX',
            description='OCR an image or scanned document and produce a structured Word file.',
            input_types=['image'],
            output_ext='docx',
            output_mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            fn=image_to_docx,
        ),
        ConversionEntry(
            id='image_to_xlsx',
            label='Image / Scan → XLSX',
            description='Detect tables in an image and create a real Excel spreadsheet.',
            input_types=['image'],
            output_ext='xlsx',
            output_mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            fn=image_to_xlsx,
        ),
        ConversionEntry(
            id='image_to_searchable_pdf',
            label='Image / Scan → Searchable PDF',
            description='Add invisible OCR text layer to an image; result is visually identical but text-searchable.',
            input_types=['image'],
            output_ext='pdf',
            output_mime='application/pdf',
            fn=image_to_spdf,
        ),
        ConversionEntry(
            id='invoice_to_xlsx',
            label='Invoice → XLSX',
            description='Extract vendor, items, tax, totals from an invoice into structured spreadsheet sheets.',
            input_types=['pdf', 'image'],
            output_ext='xlsx',
            output_mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            fn=lambda data: inv_xlsx(data, is_image=False),   # router sets is_image correctly below
        ),
        ConversionEntry(
            id='invoice_to_json',
            label='Invoice → JSON',
            description='Return structured invoice data as machine-readable JSON.',
            input_types=['pdf', 'image'],
            output_ext='json',
            output_mime='application/json',
            fn=lambda data: inv_json(data, is_image=False),
        ),
        ConversionEntry(
            id='invoice_to_csv',
            label='Invoice → CSV',
            description='Return invoice line items and summary as a CSV file.',
            input_types=['pdf', 'image'],
            output_ext='csv',
            output_mime='text/csv',
            fn=lambda data: inv_csv(data, is_image=False),
        ),
        ConversionEntry(
            id='resume_to_docx',
            label='Resume → DOCX',
            description='Reconstruct a resume PDF or image into a clean, editable Word document.',
            input_types=['pdf', 'image'],
            output_ext='docx',
            output_mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            fn=lambda data: resume_docx(data, is_image=False),
        ),
        ConversionEntry(
            id='screenshot_to_html',
            label='Screenshot → HTML/CSS',
            description='Reconstruct a screenshot into real, positioned HTML/CSS — not just a background image.',
            input_types=['image'],
            output_ext='html',
            output_mime='text/html',
            fn=ss_html,
        ),
    ]


# Singleton loaded once
_REGISTRY: list[ConversionEntry] | None = None


def get_registry() -> list[ConversionEntry]:
    global _REGISTRY
    if _REGISTRY is None:
        _REGISTRY = _load_registry()
    return _REGISTRY


def get_entry(conversion_id: str) -> ConversionEntry | None:
    for e in get_registry():
        if e.id == conversion_id:
            return e
    return None
