"""
pdf_utils.py — Shared PDF utilities for rasterization and searchability.
"""
from __future__ import annotations

import fitz  # PyMuPDF


def make_non_searchable_pdf(pdf_bytes: bytes, dpi: int = 300) -> bytes:
    """
    Convert a vector / searchable PDF into a flattened, non-searchable (raster) PDF.
    Every page is rendered at high resolution (300 DPI) and inserted as an image.
    Removes native text selection. This is not a security control: OCR can
    recover text and rasterization reduces vector detail.
    """
    src_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    out_doc = fitz.open()

    for page in src_doc:
        rect = page.rect
        pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csRGB)
        img_bytes = pix.tobytes("png")
        out_page = out_doc.new_page(width=rect.width, height=rect.height)
        out_page.insert_image(out_page.rect, stream=img_bytes)

    result = out_doc.tobytes()
    out_doc.close()
    src_doc.close()
    return result
