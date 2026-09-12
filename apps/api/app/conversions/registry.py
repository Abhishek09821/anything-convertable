"""
registry.py — single source of truth for the 5 supported conversions.

Each entry defines:
  id           slug used in POST /v1/convert/{id}
  label        human-readable name shown in the UI
  description  one-line description
  accepts      set of accepted file extensions (lower-case, with dot)
  output_ext   extension of the downloaded output file
  output_mime  MIME type for Content-Type header
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class Conversion:
    id: str
    label: str
    description: str
    accepts: frozenset[str]      # e.g. frozenset({'.png', '.jpg', '.jpeg'})
    output_ext: str
    output_mime: str
    fn: Callable[[bytes], bytes]


def _build() -> list[Conversion]:
    from .image_to_pdf import convert as _img_pdf
    from .word_to_pdf  import convert as _word_pdf
    from .pdf_to_word  import convert as _pdf_word
    from .ppt_to_pdf   import convert as _ppt_pdf
    from .pdf_to_ppt   import convert as _pdf_ppt

    return [
        Conversion(
            id="image_to_pdf",
            label="Image → PDF",
            description="Convert PNG, JPG or JPEG to a print-quality PDF at original resolution.",
            accepts=frozenset({".png", ".jpg", ".jpeg"}),
            output_ext="pdf",
            output_mime="application/pdf",
            fn=_img_pdf,
        ),
        Conversion(
            id="word_to_pdf",
            label="Word → PDF",
            description="Convert a DOCX file to PDF, preserving text, headings, tables and images.",
            accepts=frozenset({".docx"}),
            output_ext="pdf",
            output_mime="application/pdf",
            fn=_word_pdf,
        ),
        Conversion(
            id="pdf_to_word",
            label="PDF → Word",
            description="Convert a PDF to an editable DOCX, reconstructing layout, tables and images.",
            accepts=frozenset({".pdf"}),
            output_ext="docx",
            output_mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            fn=_pdf_word,
        ),
        Conversion(
            id="ppt_to_pdf",
            label="PowerPoint → PDF",
            description="Convert a PPTX presentation to PDF with all slides rendered faithfully.",
            accepts=frozenset({".pptx"}),
            output_ext="pdf",
            output_mime="application/pdf",
            fn=_ppt_pdf,
        ),
        Conversion(
            id="pdf_to_ppt",
            label="PDF → PowerPoint",
            description="Convert a PDF to an editable PPTX — each page becomes a slide with selectable text.",
            accepts=frozenset({".pdf"}),
            output_ext="pptx",
            output_mime="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            fn=_pdf_ppt,
        ),
    ]


_REGISTRY: list[Conversion] | None = None


def get_all() -> list[Conversion]:
    global _REGISTRY
    if _REGISTRY is None:
        _REGISTRY = _build()
    return _REGISTRY


def get_by_id(conversion_id: str) -> Conversion | None:
    return next((c for c in get_all() if c.id == conversion_id), None)


def get_for_file(ext: str) -> list[Conversion]:
    """Return all conversions that accept the given file extension."""
    e = ext.lower() if ext.startswith(".") else f".{ext.lower()}"
    return [c for c in get_all() if e in c.accepts]
