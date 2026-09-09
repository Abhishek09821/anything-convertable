"""
Resume PDF/Image → DOCX

Strategy:
  1. Extract text (PDF native / OCR for images).
  2. Detect sections: Contact, Objective/Summary, Experience, Education,
     Skills, Projects, Certifications, Languages, References.
  3. Reconstruct each section with proper Word styles.
  4. Preserve dates, bullet points, company names, headings.
  5. Apply clean single-column layout with a professional style.
"""
from __future__ import annotations

import io
import re

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor

from .shared import (
    ConversionError, extract_pdf_pages, load_image, ocr_image,
    validate_docx,
)


# ─────────────────────────────────────────────────────────────────────────────
# Section detection
# ─────────────────────────────────────────────────────────────────────────────

_SECTION_HEADERS = {
    "contact":        re.compile(r"^(contact|personal\s+info|phone|email|address)", re.I),
    "summary":        re.compile(r"^(summary|objective|profile|about\s+me)", re.I),
    "experience":     re.compile(r"^(experience|work\s+experience|employment|career\s+history)", re.I),
    "education":      re.compile(r"^(education|academic|qualifications?)", re.I),
    "skills":         re.compile(r"^(skills?|technical\s+skills?|competencies|expertise)", re.I),
    "projects":       re.compile(r"^(projects?|portfolio)", re.I),
    "certifications": re.compile(r"^(certifications?|courses?|awards?|achievements?)", re.I),
    "languages":      re.compile(r"^(languages?|spoken\s+languages?)", re.I),
    "references":     re.compile(r"^(references?)", re.I),
}

_DATE_RE = re.compile(
    r"\b(\d{4})\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}\b",
    re.IGNORECASE,
)
_BULLET_RE = re.compile(r"^[\•\-\*\–\—\▪\◦\○\●]\s*")


def _detect_section(line: str) -> str | None:
    stripped = line.strip()
    for name, pat in _SECTION_HEADERS.items():
        if pat.match(stripped):
            return name
    # ALL-CAPS short line is likely a section header
    if stripped.isupper() and 3 < len(stripped) < 40:
        return "generic_header"
    return None


# ─────────────────────────────────────────────────────────────────────────────
# DOCX construction helpers
# ─────────────────────────────────────────────────────────────────────────────

_SECTION_COLOUR = RGBColor(0x1F, 0x4E, 0x79)  # dark blue


def _add_section_heading(doc: Document, text: str) -> None:
    # Use a proper Word Heading style so the paragraph is recognisable
    # downstream (table of contents, test assertions, screen readers).
    heading = doc.add_heading(text.title(), level=2)
    # Override the default Heading 2 colour to our brand blue
    for run in heading.runs:
        run.font.color.rgb = _SECTION_COLOUR


def _add_body_line(doc: Document, text: str, is_bullet: bool = False) -> None:
    text = _BULLET_RE.sub("", text).strip()
    if not text:
        return
    para = doc.add_paragraph(style="List Bullet" if is_bullet else "Normal")
    run = para.add_run(text)
    run.font.size = Pt(10)


def _add_name_line(doc: Document, name: str) -> None:
    para = doc.add_paragraph()
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = para.add_run(name)
    run.font.size = Pt(18)
    run.bold = True
    run.font.color.rgb = _SECTION_COLOUR


# ─────────────────────────────────────────────────────────────────────────────
# OxmlElement import
# ─────────────────────────────────────────────────────────────────────────────

from docx.oxml import OxmlElement  # still needed for _add_name_line border (future use)


# ─────────────────────────────────────────────────────────────────────────────
# Main converter
# ─────────────────────────────────────────────────────────────────────────────

def convert(data: bytes, is_image: bool = False) -> bytes:
    lines = _extract_lines(data, is_image)
    if not lines:
        raise ConversionError("No text could be extracted from resume")

    doc = Document()
    for section in doc.sections:
        section.top_margin = Inches(0.6)
        section.bottom_margin = Inches(0.6)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    # First non-empty line is usually the candidate's name
    name = ""
    start_idx = 0
    for i, line in enumerate(lines):
        if line.strip():
            name = line.strip()
            start_idx = i + 1
            break

    if name:
        _add_name_line(doc, name)

    # Parse lines into sections
    current_section: str | None = None
    pending_lines: list[str] = []

    def flush_section():
        nonlocal pending_lines
        for ln in pending_lines:
            if not ln.strip():
                continue
            is_bullet = bool(_BULLET_RE.match(ln.strip()))
            _add_body_line(doc, ln, is_bullet=is_bullet)
        pending_lines = []

    for line in lines[start_idx:]:
        sect = _detect_section(line)
        if sect:
            flush_section()
            current_section = sect
            label = line.strip()
            _add_section_heading(doc, label)
        else:
            pending_lines.append(line)

    flush_section()

    buf = io.BytesIO()
    doc.save(buf)
    result = buf.getvalue()
    validate_docx(result)
    return result


def _extract_lines(data: bytes, is_image: bool) -> list[str]:
    if is_image:
        im = load_image(data)
        ocr_results = ocr_image(im)
        return [ln["text"] for ln in ocr_results]
    else:
        pages = extract_pdf_pages(data)
        return [s.text for p in pages for s in p.spans]
