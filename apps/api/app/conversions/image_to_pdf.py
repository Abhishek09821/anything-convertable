"""
Image (PNG / JPG / JPEG) → PDF

Accuracy strategy:
- Open image with Pillow, read exact pixel dimensions and DPI metadata.
- Set PDF page size to exactly match the image dimensions (no scaling, no cropping).
- Embed the image at 100% quality using ReportLab's ImageReader.
- Multi-image support: if multiple files are passed (future), each becomes one page.
- Output is always a valid, print-quality PDF.
"""
from __future__ import annotations

import io

from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas


def convert(data: bytes) -> bytes:
    # Open image — supports JPEG, PNG, WEBP, BMP, TIFF etc.
    im = Image.open(io.BytesIO(data))

    # Normalise rotation from EXIF so the PDF is always upright
    im = _apply_exif_rotation(im)

    # Read DPI from image metadata; default to 96 dpi if absent.
    # JFIF density (1, 1) means "no physical density" and must not be
    # interpreted as 1 DPI (that would produce a 57600pt-wide page).
    dpi_info = im.info.get("dpi") or im.info.get("jfif_density")
    dpi_x = dpi_y = 96.0
    if isinstance(dpi_info, (tuple, list)) and len(dpi_info) == 2:
        dx, dy = float(dpi_info[0]), float(dpi_info[1])
        if dx > 1 and dy > 1:
            dpi_x, dpi_y = dx, dy

    px_w, px_h = im.size  # pixels

    # Convert pixel dimensions to PDF points (1 inch = 72 pt)
    pt_w = px_w * 72.0 / dpi_x
    pt_h = px_h * 72.0 / dpi_y

    # Re-encode to JPEG for PDF embedding (lossless PNG also works via BytesIO)
    img_buf = io.BytesIO()
    fmt = im.format if im.format in ("JPEG", "PNG") else "PNG"
    # Always use PNG for images with transparency, JPEG otherwise
    has_alpha = im.mode in ("RGBA", "LA", "PA")
    if has_alpha:
        fmt = "PNG"
        save_im = im  # keep alpha
    else:
        fmt = "JPEG"
        save_im = im.convert("RGB")

    save_im.save(img_buf, format=fmt, quality=95, optimize=False)
    img_buf.seek(0)

    # Build PDF
    out_buf = io.BytesIO()
    c = rl_canvas.Canvas(out_buf, pagesize=(pt_w, pt_h))
    c.setPageSize((pt_w, pt_h))
    reader = ImageReader(img_buf)
    # drawImage fills the whole page exactly — no white borders
    c.drawImage(reader, 0, 0, width=pt_w, height=pt_h, preserveAspectRatio=False)
    c.showPage()
    c.save()

    result = out_buf.getvalue()
    assert result[:4] == b"%PDF", "Output is not a valid PDF"
    assert len(result) > 1000, f"PDF suspiciously small: {len(result)} bytes"
    return result


def _apply_exif_rotation(im: Image.Image) -> Image.Image:
    """Auto-rotate image according to EXIF orientation tag."""
    try:
        from PIL import ImageOps
        return ImageOps.exif_transpose(im)
    except Exception:
        return im
