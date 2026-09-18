from typing import Literal
from pydantic import BaseModel, Field, ConfigDict


class ConversionInfo(BaseModel):
    """Metadata for one conversion, returned by GET /v1/conversions."""
    id: str
    label: str
    description: str
    accepts: list[str]   # file extensions, e.g. [".png", ".jpg", ".jpeg"]
    output_ext: str
    output_mime: str
    supports_font_choice: bool = False
    supports_searchable_option: bool = False


class DetectResponse(BaseModel):
    """Returned by POST /v1/detect."""
    ext: str                          # detected file extension, e.g. ".pdf"
    suggested: list[str]              # ordered list of conversion IDs
    all_conversions: list[ConversionInfo]  # full list filtered to this file type


class CustomDocumentFormat(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page_size: Literal["A4", "Letter"] = "A4"
    margin_inches: float = Field(default=1.0, ge=0.5, le=1.5)
    line_spacing: float = Field(default=1.15, ge=1, le=2)
    heading_size: float = Field(default=15, ge=10, le=32)
    heading_alignment: Literal["left", "center"] = "left"
    section_order: list[str] = Field(default_factory=list, max_length=50)


class TextConvertRequest(BaseModel):
    """Payload for direct text-to-document conversion (live typing / paste)."""
    text: str = Field(min_length=1, max_length=500000)
    to_format: str = "docx"           # "docx" or "pdf"
    font: str = "Calibri"             # Times New Roman, Arial, Calibri, Georgia
    font_size: float = Field(default=12.0, ge=6, le=72)
    searchable: bool = True           # applicable when to_format is "pdf"

    template: Literal["general", "formal", "report", "resume", "custom"] = "general"
    title: str = Field(default="", max_length=200)
    custom_format: CustomDocumentFormat | None = None
