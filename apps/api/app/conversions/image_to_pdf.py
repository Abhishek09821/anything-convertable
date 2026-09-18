"""Image to PDF without lossy re-encoding; preserve orientation and every frame."""
from __future__ import annotations

import io
import math
from PIL import Image, ImageOps, ImageCms
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from .quality import note


def _density(image: Image.Image) -> tuple[float, float]:
    value = image.info.get("dpi", (96, 96))
    try:
        x, y = map(float, value)
        if all(math.isfinite(v) and 1 < v <= 9600 for v in (x, y)):
            return x, y
    except (ValueError, TypeError):
        pass
    return 96.0, 96.0


def convert(data: bytes, font: str = "original", searchable: bool = True) -> bytes:
    try:
        source = Image.open(io.BytesIO(data))
    except Exception as exc:
        raise ValueError("Cannot open image. Use PNG, JPEG, WEBP, BMP, GIF or TIFF.") from exc
    output = io.BytesIO()
    pdf = canvas.Canvas(output, pageCompression=1)
    with source:
        for index in range(getattr(source, "n_frames", 1)):
            source.seek(index)
            dx, dy = _density(source)
            orientation = source.getexif().get(274, 1)
            if orientation in (5, 6, 7, 8):
                dx, dy = dy, dx
            im = ImageOps.exif_transpose(source)
            im.load()
            profile = source.info.get("icc_profile")
            if profile:
                try:
                    im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(profile)),
                        ImageCms.createProfile("sRGB"), outputMode="RGBA" if "A" in im.getbands() else "RGB")
                except (OSError, ValueError, ImageCms.PyCMSError):
                    note("An image color profile could not be converted; colors may differ.")
            width, height = im.width * 72 / dx, im.height * 72 / dy
            # Pass the original JPEG stream through unchanged when no transformation is needed.
            if source.format == "JPEG" and orientation == 1 and not profile:
                reader = ImageReader(io.BytesIO(data))
            else:
                if im.mode == "P" or "transparency" in im.info:
                    im = im.convert("RGBA")
                elif im.mode not in ("RGB", "RGBA", "L", "LA", "CMYK"):
                    im = im.convert("RGB")
                reader = ImageReader(im)
            pdf.setPageSize((width, height))
            pdf.drawImage(reader, 0, 0, width=width, height=height, mask="auto")
            pdf.showPage()
    pdf.save()
    return output.getvalue()
