"""
Screenshot → HTML/CSS

Strategy:
  1. OCR the screenshot for text elements with bounding boxes.
  2. Analyse dominant colours from image regions.
  3. Detect structural regions: header (top 12%), footer (bottom 8%),
     sidebar (left/right 20%), main content area.
  4. Generate semantic HTML5 with absolute-positioned CSS for each text element.
  5. Embed the original screenshot as a background reference image.
  6. Output is self-contained HTML with inline CSS (no external deps).

This produces a real re-constructable layout, NOT just an <img> tag.
"""
from __future__ import annotations

import base64
import io
import re

from PIL import Image

from .shared import ConversionError, load_image, ocr_image, validate_html


# ─────────────────────────────────────────────────────────────────────────────
# Colour helpers
# ─────────────────────────────────────────────────────────────────────────────

def _dominant_color(im: Image.Image, x: int, y: int, w: int, h: int) -> str:
    """Sample dominant colour from a region of the image."""
    x, y = max(0, x), max(0, y)
    w = min(w, im.width - x)
    h = min(h, im.height - y)
    if w < 1 or h < 1:
        return "#ffffff"
    region = im.crop((x, y, x + w, y + h)).convert("RGB")
    region = region.resize((16, 16))
    pixels = list(region.getdata())
    r_avg = sum(p[0] for p in pixels) // len(pixels)
    g_avg = sum(p[1] for p in pixels) // len(pixels)
    b_avg = sum(p[2] for p in pixels) // len(pixels)
    return f"#{r_avg:02x}{g_avg:02x}{b_avg:02x}"


def _contrast_color(bg_hex: str) -> str:
    """Return black or white for text contrast."""
    h = bg_hex.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    luminance = 0.299 * r + 0.587 * g + 0.114 * b
    return "#000000" if luminance > 128 else "#ffffff"


# ─────────────────────────────────────────────────────────────────────────────
# Region classification
# ─────────────────────────────────────────────────────────────────────────────

def _classify_region(y: float, h_total: float) -> str:
    """Classify a text element as header / footer / content."""
    ratio = y / h_total if h_total else 0
    if ratio < 0.12:
        return "header"
    if ratio > 0.88:
        return "footer"
    return "content"


# ─────────────────────────────────────────────────────────────────────────────
# Font size heuristic from bounding box height
# ─────────────────────────────────────────────────────────────────────────────

def _estimate_font_size(h: float) -> int:
    return max(9, min(72, int(h * 0.72)))


# ─────────────────────────────────────────────────────────────────────────────
# Main converter
# ─────────────────────────────────────────────────────────────────────────────

def convert(data: bytes) -> bytes:
    im = load_image(data)
    w, h = im.size

    ocr_lines = ocr_image(im)
    if not ocr_lines:
        raise ConversionError("OCR found no text in screenshot")

    # Overall background colour
    bg_color = _dominant_color(im, 0, 0, w, h)
    text_color = _contrast_color(bg_color)

    # Header background
    header_h = max(1, int(h * 0.12))
    header_bg = _dominant_color(im, 0, 0, w, header_h)
    header_text = _contrast_color(header_bg)

    footer_start = int(h * 0.88)
    footer_bg = _dominant_color(im, 0, footer_start, w, h - footer_start)
    footer_text = _contrast_color(footer_bg)

    # Encode original as reference image (placed behind with 0.25 opacity)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=60)
    ref_b64 = base64.b64encode(buf.getvalue()).decode()
    ref_url = f"data:image/jpeg;base64,{ref_b64}"

    # Build HTML elements
    elements_html: list[str] = []
    for ln in ocr_lines:
        region = _classify_region(ln["y"], h)
        font_size = _estimate_font_size(ln["h"])
        is_bold = ln["text"].isupper() or ln["h"] > 30

        # Element colour: sample from behind this text
        elem_bg = _dominant_color(im, int(ln["x"]), int(ln["y"]), max(1, int(ln["w"])), max(1, int(ln["h"])))
        elem_fg = _contrast_color(elem_bg)

        tag = "h1" if (region == "header" and font_size > 20) else \
              "h2" if font_size > 18 else \
              "p"
        escaped = _esc(ln["text"])
        style = (
            f"position:absolute;"
            f"left:{ln['x']}px;top:{ln['y']}px;"
            f"width:{max(ln['w'], 10)}px;"
            f"min-height:{ln['h']}px;"
            f"font-size:{font_size}px;"
            f"line-height:1.2;"
            f"font-weight:{'700' if is_bold else '400'};"
            f"color:{elem_fg};"
            f"margin:0;padding:0;"
            f"white-space:nowrap;overflow:hidden;"
        )
        elements_html.append(f'<{tag} style="{style}">{escaped}</{tag}>')

    elements_joined = "\n    ".join(elements_html)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Screenshot Reconstruction</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: #1e2030; display: flex; justify-content: center; padding: 24px; }}
  .page {{
    position: relative;
    width: {w}px;
    height: {h}px;
    background: {bg_color};
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  }}
  .page-bg {{
    position: absolute;
    inset: 0;
    background-image: url("{ref_url}");
    background-size: {w}px {h}px;
    background-repeat: no-repeat;
    opacity: 0.15;
    pointer-events: none;
  }}
  header.site-header {{
    position: absolute;
    top: 0; left: 0; right: 0;
    height: {header_h}px;
    background: {header_bg};
    display: flex;
    align-items: center;
    padding: 0 16px;
  }}
  footer.site-footer {{
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: {h - footer_start}px;
    background: {footer_bg};
  }}
  .content {{
    position: absolute;
    top: {header_h}px;
    bottom: {h - footer_start}px;
    left: 0; right: 0;
  }}
</style>
</head>
<body>
<div class="page" role="main">
  <!-- Original screenshot reference (low-opacity background) -->
  <div class="page-bg" aria-hidden="true"></div>

  <!-- Structural regions -->
  <header class="site-header" style="color:{header_text};"></header>
  <footer class="site-footer" style="color:{footer_text};"></footer>

  <!-- Reconstructed text elements -->
  {elements_joined}
</div>
</body>
</html>"""

    result = html.encode("utf-8")
    validate_html(result)
    return result


def _esc(text: str) -> str:
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))
