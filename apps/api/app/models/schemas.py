from pydantic import BaseModel, Field
from typing import Any, Literal


# ── Conversion request (multipart handled by FastAPI directly) ────────────────

CONVERSION_IDS = Literal[
    'pdf_to_docx',
    'pdf_to_xlsx',
    'pdf_to_pptx',
    'image_to_docx',
    'image_to_xlsx',
    'image_to_searchable_pdf',
    'invoice_to_xlsx',
    'invoice_to_json',
    'invoice_to_csv',
    'resume_to_docx',
    'screenshot_to_html',
]


class ConversionMeta(BaseModel):
    """Describes one available conversion."""
    id: str
    label: str
    description: str
    input_types: list[str]   # 'pdf', 'image', 'any'
    output_ext: str
    output_mime: str


class ConvertResponse(BaseModel):
    """Returned on success — file is streamed separately."""
    conversion_id: str
    filename: str
    bytes_size: int
    validation: str = 'passed'
    warnings: list[str] = []
    metadata: dict[str, Any] = {}


class DetectResponse(BaseModel):
    """Returned by /v1/detect — document classification."""
    doc_type: str          # invoice | resume | screenshot | pdf | image | generic
    suggested_conversions: list[str]   # ordered list of conversion IDs
    page_count: int = 0
    has_tables: bool = False
    has_images: bool = False
    text_length: int = 0
    warnings: list[str] = []
