"""
Anything Convertable — FastAPI backend
=======================================

5 conversions:
  image_to_pdf   PNG / JPG / JPEG  → PDF
  word_to_pdf    DOCX               → PDF
  pdf_to_word    PDF                → DOCX
  ppt_to_pdf     PPTX               → PDF
  pdf_to_ppt     PDF                → PPTX

Routes:
  GET  /health
  GET  /v1/conversions          list all 5 conversions
  POST /v1/detect               detect file type, return matching conversions
  POST /v1/convert/{id}         run conversion, stream result file
"""
from __future__ import annotations

import os
import time

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .core.config import settings
from .models.schemas import ConversionInfo, DetectResponse
from .conversions.registry import Conversion, get_all, get_by_id, get_for_file

app = FastAPI(title=settings.app_name, version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── helpers ───────────────────────────────────────────────────────────────────

def _ext(filename: str, content_type: str) -> str:
    """Best-effort file extension from name or MIME type."""
    if filename:
        _, dot_ext = os.path.splitext(filename.lower())
        if dot_ext:
            return dot_ext

    mime = (content_type or "").lower()
    _MIME_MAP = {
        "image/jpeg": ".jpg",
        "image/jpg":  ".jpg",
        "image/png":  ".png",
        "application/pdf": ".pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
        "application/msword": ".doc",
        "application/vnd.ms-powerpoint": ".ppt",
    }
    return _MIME_MAP.get(mime, "")


def _to_info(c: Conversion) -> ConversionInfo:
    return ConversionInfo(
        id=c.id,
        label=c.label,
        description=c.description,
        accepts=sorted(c.accepts),
        output_ext=c.output_ext,
        output_mime=c.output_mime,
    )


# ── routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "anything-convertable-api", "version": "0.3.0"}


@app.get("/v1/conversions", response_model=list[ConversionInfo])
def list_conversions():
    """Return all 5 supported conversions."""
    return [_to_info(c) for c in get_all()]


@app.post("/v1/detect", response_model=DetectResponse)
async def detect(file: UploadFile = File(...)):
    """
    Detect file type and return the conversions available for it.
    Reads only the first 4 bytes (magic bytes) — very fast.
    """
    header = await file.read(4)
    await file.seek(0)

    filename = file.filename or ""
    content_type = file.content_type or ""
    ext = _ext(filename, content_type)

    # Magic-byte override for common formats (more reliable than extension)
    if header[:4] == b"%PDF":
        ext = ".pdf"
    elif header[:4] in (b"PK\x03\x04",):
        # ZIP-based: DOCX or PPTX — trust extension
        if not ext:
            ext = ".docx"  # safer default
    elif header[:3] in (b"\xff\xd8\xff",):
        ext = ".jpg"
    elif header[:8] == b"\x89PNG\r\n\x1a\n":
        ext = ".png"

    matching = get_for_file(ext)

    # Suggestion order: exact match first, then others
    suggested = [c.id for c in matching]

    return DetectResponse(
        ext=ext,
        suggested=suggested,
        all_conversions=[_to_info(c) for c in matching],
    )


@app.post("/v1/convert/{conversion_id}")
async def convert(conversion_id: str, file: UploadFile = File(...)):
    """
    Run a conversion and stream back the output file.
    """
    conv = get_by_id(conversion_id)
    if conv is None:
        valid = [c.id for c in get_all()]
        raise HTTPException(404, f"Unknown conversion '{conversion_id}'. Valid: {valid}")

    data = await file.read()
    filename = file.filename or "document"

    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {settings.max_upload_mb} MB limit")

    if len(data) == 0:
        raise HTTPException(400, "Uploaded file is empty")

    # Validate extension matches what this conversion accepts
    ext = _ext(filename, file.content_type or "")
    if ext and ext not in conv.accepts:
        # Soft warning only — don't block (user may rename files)
        print(f"[convert] WARNING: {filename} has ext '{ext}' but {conversion_id} accepts {conv.accepts}")

    print(f"[convert] id={conversion_id} file={filename} size={len(data):,} bytes")
    t0 = time.perf_counter()

    try:
        result = conv.fn(data)
    except AssertionError as exc:
        raise HTTPException(422, f"Conversion validation failed: {exc}")
    except Exception as exc:
        print(f"[convert] ERROR {conversion_id}: {exc}")
        raise HTTPException(500, f"Conversion failed: {exc}")

    elapsed = time.perf_counter() - t0
    print(f"[convert] OK {conversion_id} → {len(result):,} bytes in {elapsed:.2f}s")

    stem = os.path.splitext(filename)[0] or "document"
    dl_name = f"{stem}.{conv.output_ext}"

    return Response(
        content=result,
        media_type=conv.output_mime,
        headers={
            "Content-Disposition": f'attachment; filename="{dl_name}"',
            "X-Conversion-Id": conversion_id,
            "X-Elapsed-Seconds": f"{elapsed:.2f}",
        },
    )
