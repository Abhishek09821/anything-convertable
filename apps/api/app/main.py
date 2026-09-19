"""
Anything Convertable — FastAPI backend
=======================================

7 conversions:
  image_to_pdf   PNG / JPG / JPEG  → PDF
  word_to_pdf    DOCX               → PDF
  pdf_to_word    PDF                → DOCX
  ppt_to_pdf     PPTX               → PDF
  pdf_to_ppt     PDF                → PPTX
  text_to_word   TXT / typed text   → DOCX
  text_to_pdf    TXT / typed text   → PDF

Routes:
  GET  /health
  GET  /v1/conversions          list all conversions
  POST /v1/detect               detect file type, return matching conversions
  POST /v1/convert/{id}         run file conversion, stream result file
  POST /v1/convert-text         run typed/pasted text conversion to DOCX or PDF
"""
from __future__ import annotations

import os
import io
import json
import zipfile
from urllib.parse import quote
from starlette.concurrency import run_in_threadpool
from .conversions.quality import begin_report, get_notes
import time

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .core.config import settings
from .models.schemas import ConversionInfo, DetectResponse, TextConvertRequest
from .conversions.registry import Conversion, get_all, get_by_id, get_for_file
from .conversions.text_converter import text_to_word, text_to_pdf

app = FastAPI(title=settings.app_name, version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Elapsed-Seconds", "X-Conversion-Id", "X-Conversion-Warnings"],
)


# ── helpers ───────────────────────────────────────────────────────────────────

def _to_info(c: Conversion) -> ConversionInfo:
    return ConversionInfo(
        id=c.id,
        label=c.label,
        description=c.description,
        accepts=sorted(c.accepts),
        output_ext=c.output_ext,
        output_mime=c.output_mime,
        supports_font_choice=c.supports_font_choice,
        supports_searchable_option=c.supports_searchable_option,
    )


# ── routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root() -> dict:
    return {
        "service": settings.app_name,
        "version": "0.3.0",
        "status": "online",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "anything-convertable-api", "version": "0.3.0"}


@app.get("/v1/conversions", response_model=list[ConversionInfo])
def list_conversions():
    """Return all supported conversions."""
    return [_to_info(c) for c in get_all()]


def _detect_content(data: bytes) -> str:
    if data.startswith(b"%PDF"):
        return ".pdf"
    if data.startswith(b"PK"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                names = set(archive.namelist())
                if "word/document.xml" in names:
                    return ".docx"
                if "ppt/presentation.xml" in names:
                    return ".pptx"
        except zipfile.BadZipFile:
            return ""
    from PIL import Image
    try:
        with Image.open(io.BytesIO(data)) as image:
            return {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp", "TIFF": ".tiff", "BMP": ".bmp", "GIF": ".gif"}.get(image.format or "", "")
    except Exception:
        return ""


async def _read_upload(file: UploadFile) -> bytes:
    data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {settings.max_upload_mb} MB limit")
    if not data:
        raise HTTPException(400, "Uploaded file is empty")
    return data


def _run_conversion(fn, data, kwargs):
    begin_report()
    result = fn(data, **kwargs)
    return result, get_notes()


@app.post("/v1/detect", response_model=DetectResponse)
async def detect(file: UploadFile = File(...)):
    data = await _read_upload(file)
    ext = await run_in_threadpool(_detect_content, data)
    matching = get_for_file(ext) if ext else []
    return DetectResponse(ext=ext, suggested=[c.id for c in matching],
        all_conversions=[_to_info(c) for c in matching])


@app.post("/v1/convert/{conversion_id}")
async def convert(
    conversion_id: str,
    file: UploadFile = File(...),
    font: str = "original",
    searchable: bool = True,
    fidelity: str = "editable",
):
    """
    Run a conversion and stream back the output file.
    """
    conv = get_by_id(conversion_id)
    if conv is None:
        valid = [c.id for c in get_all()]
        raise HTTPException(404, f"Unknown conversion '{conversion_id}'. Valid: {valid}")

    data = await _read_upload(file)
    filename = file.filename or "document"
    ext = await run_in_threadpool(_detect_content, data)
    if ext not in conv.accepts:
        raise HTTPException(422, "The file contents do not match this converter. Choose a supported, undamaged file.")
    if font not in ("original", "Times New Roman", "Arial", "Calibri", "Georgia"):
        raise HTTPException(422, "Unsupported font choice")
    if fidelity not in ("appearance", "editable"):
        raise HTTPException(422, "Unsupported conversion mode")
    t0 = time.perf_counter()

    try:
        kwargs: dict[str, object] = {}
        if conv.supports_font_choice:
            kwargs["font"] = font
        if conv.supports_searchable_option:
            kwargs["searchable"] = searchable

        if conversion_id == "pdf_to_ppt":
            kwargs["fidelity"] = fidelity
        result, warnings = await run_in_threadpool(_run_conversion, conv.fn, data, kwargs)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
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
            "Content-Disposition": f"attachment; filename=converted.{conv.output_ext}; filename*=UTF-8''{quote(dl_name, safe='')}",
            "X-Conversion-Warnings": json.dumps(warnings, ensure_ascii=True),
            "X-Conversion-Id": conversion_id,
            "X-Elapsed-Seconds": f"{elapsed:.2f}",
        },
    )


@app.post("/v1/convert-text")
async def convert_text(req: TextConvertRequest):
    """
    Directly convert typed or pasted text into DOCX or PDF with font and searchable options.
    """
    if not req.text or not req.text.strip():
        raise HTTPException(400, "Text content is empty")

    fmt = req.to_format.lower().strip().lstrip(".")
    if fmt not in ("docx", "word", "pdf"):
        raise HTTPException(400, f"Unsupported output format '{req.to_format}'. Valid: docx, pdf")

    options = {"font": req.font, "font_size": req.font_size,
               "template": req.template, "title": req.title,
               "custom_format": req.custom_format.model_dump() if req.custom_format else None}
    t0 = time.perf_counter()
    try:
        if fmt in ("docx", "word"):
            result, warnings = await run_in_threadpool(_run_conversion, text_to_word, req.text, options)
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            dl_name = f"{req.template}-document.docx"
            out_id = "text_to_word"
        else:
            result, warnings = await run_in_threadpool(_run_conversion, text_to_pdf, req.text, {**options, "searchable": req.searchable})
            media_type = "application/pdf"
            dl_name = f"{req.template}-document.pdf"
            out_id = "text_to_pdf"
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:
        print(f"[convert_text] ERROR: {exc}")
        raise HTTPException(500, f"Text conversion failed: {exc}")

    elapsed = time.perf_counter() - t0
    print(f"[convert_text] OK {out_id} → {len(result):,} bytes in {elapsed:.2f}s")

    return Response(
        content=result,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{dl_name}"',
            "X-Conversion-Warnings": json.dumps(warnings, ensure_ascii=True),
            "X-Conversion-Id": out_id,
            "X-Elapsed-Seconds": f"{elapsed:.2f}",
        },
    )
