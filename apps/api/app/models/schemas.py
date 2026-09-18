from pydantic import BaseModel, Field


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


class TextConvertRequest(BaseModel):
    """Payload for direct text-to-document conversion (live typing / paste)."""
    text: str = Field(min_length=1, max_length=500000)
    to_format: str = "docx"           # "docx" or "pdf"
    font: str = "Calibri"             # Times New Roman, Arial, Calibri, Georgia
    font_size: float = Field(default=12.0, ge=6, le=72)
    searchable: bool = True           # applicable when to_format is "pdf"
