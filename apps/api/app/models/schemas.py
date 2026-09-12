from pydantic import BaseModel


class ConversionInfo(BaseModel):
    """Metadata for one conversion, returned by GET /v1/conversions."""
    id: str
    label: str
    description: str
    accepts: list[str]   # file extensions, e.g. [".png", ".jpg", ".jpeg"]
    output_ext: str
    output_mime: str


class DetectResponse(BaseModel):
    """Returned by POST /v1/detect."""
    ext: str                          # detected file extension, e.g. ".pdf"
    suggested: list[str]              # ordered list of conversion IDs
    all_conversions: list[ConversionInfo]  # full list filtered to this file type
