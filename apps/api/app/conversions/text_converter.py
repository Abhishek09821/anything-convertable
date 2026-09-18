"""Generate Word first, then render that same document to PDF for consistent layouts."""
from __future__ import annotations
from .document_templates import build_document
from .office import render_office
from .pdf_utils import make_non_searchable_pdf

FONTS = {"Arial", "Calibri", "Times New Roman", "Georgia"}


def text_to_word(text_data: str | bytes, font: str = "Calibri", font_size: float = 12.0,
                 template: str = "general", title: str = "", custom_format: dict | None = None) -> bytes:
    text = text_data.decode("utf-8") if isinstance(text_data, bytes) else text_data
    if font not in FONTS:
        raise ValueError("Choose Arial, Calibri, Times New Roman or Georgia.")
    return build_document(text, font, font_size, template, title, custom_format)


def text_to_pdf(text_data: str | bytes, font: str = "Calibri", font_size: float = 12.0,
                searchable: bool = True, template: str = "general", title: str = "",
                custom_format: dict | None = None) -> bytes:
    if template == "resume" and not searchable:
        raise ValueError("Resume PDFs must keep selectable text. Enable 'Keep text selectable'.")
    document = text_to_word(text_data, font, font_size, template, title, custom_format)
    pdf = render_office(document, "docx")
    if pdf is None:
        raise ValueError("PDF document layouts require LibreOffice on the server. Download Word instead, or install LibreOffice and retry.")
    return pdf if searchable else make_non_searchable_pdf(pdf, dpi=300)
