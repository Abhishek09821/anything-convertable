"""
Invoice → XLSX

Strategy:
  1. Extract text (PDF native or OCR for images).
  2. Parse invoice fields: vendor, invoice#, date, line items, tax, totals.
  3. Write a two-sheet workbook:
     - "Summary" sheet with header fields.
     - "Line Items" sheet with itemized rows.
  4. Format currency columns, bold headers, freeze first row.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from .shared import (
    ConversionError, extract_pdf_pages, load_image, ocr_image,
    classify_document, validate_xlsx,
)


# ─────────────────────────────────────────────────────────────────────────────
# Parsed invoice structure
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class InvoiceData:
    vendor: str = ""
    invoice_number: str = ""
    date: str = ""
    bill_to: str = ""
    gstin: str = ""
    subtotal: str = ""
    tax: str = ""
    total: str = ""
    currency: str = "INR"
    items: list[dict] = field(default_factory=list)
    raw_lines: list[str] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Parsing helpers
# ─────────────────────────────────────────────────────────────────────────────

_AMOUNT_RE = re.compile(r"[₹$€£¥]?\s*([\d,]+(?:\.\d{1,2})?)", re.IGNORECASE)
_DATE_RE = re.compile(
    r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{2}[/-]\d{2}|"
    r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{1,2},?\s*\d{4})\b",
    re.IGNORECASE,
)
_INV_NO_RE = re.compile(
    r"(?:invoice\s*(?:no\.?|number|#|num\.?)|inv(?:oice)?\s*(?:no\.?|number|#|num\.?)|bill\s*no\.?)[\s:]*([A-Z0-9/\-]{3,})",
    re.IGNORECASE,
)
_GSTIN_RE = re.compile(r"\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z])\b")
_TOTAL_RE = re.compile(r"(?:grand\s+)?total[\s:]*[₹$€£¥]?\s*([\d,]+(?:\.\d{1,2})?)", re.IGNORECASE)
_SUBTOTAL_RE = re.compile(r"sub\s*total[\s:]*[₹$€£¥]?\s*([\d,]+(?:\.\d{1,2})?)", re.IGNORECASE)
_TAX_RE = re.compile(r"(?:gst|tax|vat|igst|cgst|sgst)[\s:@%0-9]*[₹$€£¥]?\s*([\d,]+(?:\.\d{1,2})?)", re.IGNORECASE)


def _parse_invoice(lines: list[str]) -> InvoiceData:
    inv = InvoiceData(raw_lines=lines)
    full_text = "\n".join(lines)

    # Invoice number
    m = _INV_NO_RE.search(full_text)
    if m:
        inv.invoice_number = m.group(1).strip()

    # Date
    m = _DATE_RE.search(full_text)
    if m:
        inv.date = m.group(0).strip()

    # GSTIN
    m = _GSTIN_RE.search(full_text)
    if m:
        inv.gstin = m.group(1)

    # Totals
    m = _TOTAL_RE.search(full_text)
    if m:
        inv.total = m.group(1).strip()

    m = _SUBTOTAL_RE.search(full_text)
    if m:
        inv.subtotal = m.group(1).strip()

    m = _TAX_RE.search(full_text)
    if m:
        inv.tax = m.group(1).strip()

    # Vendor: typically first non-empty line before "invoice" keyword
    upper_lines = [l.strip() for l in lines[:10] if l.strip()]
    inv.vendor = upper_lines[0] if upper_lines else ""

    # Bill to
    for i, line in enumerate(lines):
        if re.search(r"bill\s*to|ship\s*to|customer", line, re.I):
            # grab next non-empty line
            for j in range(i + 1, min(i + 4, len(lines))):
                if lines[j].strip():
                    inv.bill_to = lines[j].strip()
                    break

    # Line items — look for lines that have a description + amount pattern
    items = _extract_line_items(lines)
    inv.items = items

    return inv


def _extract_line_items(lines: list[str]) -> list[dict]:
    """
    Heuristic: a line item has text + at least one numeric/currency value.
    Skip header/total/tax lines.
    """
    items: list[dict] = []
    skip_patterns = re.compile(
        r"^\s*(description|item|qty|quantity|rate|amount|total|subtotal|tax|gst|date|invoice|"
        r"s\.?\s*no\.?|sr\.?\s*no\.?)\s*$",
        re.IGNORECASE,
    )
    for line in lines:
        line = line.strip()
        if not line or skip_patterns.match(line):
            continue
        amounts = _AMOUNT_RE.findall(line)
        if not amounts:
            continue
        # Strip amounts from description
        desc = _AMOUNT_RE.sub("", line).strip(" \t:-|")
        desc = re.sub(r"\s{2,}", " ", desc).strip()
        if len(desc) < 2:
            continue
        # Try to interpret: last amount = unit price or total
        nums = [a.replace(",", "") for a in amounts]
        try:
            price = float(nums[-1])
        except ValueError:
            price = None
        try:
            qty = float(nums[0]) if len(nums) > 1 else 1
        except ValueError:
            qty = 1
        items.append({"description": desc, "quantity": qty, "amount": price})
    return items


# ─────────────────────────────────────────────────────────────────────────────
# Main converter
# ─────────────────────────────────────────────────────────────────────────────

def convert(data: bytes, is_image: bool = False) -> bytes:
    if is_image:
        im = load_image(data)
        ocr_lines = ocr_image(im)
        lines = [ln["text"] for ln in ocr_lines]
    else:
        pages = extract_pdf_pages(data)
        lines = [s.text for p in pages for s in p.spans]

    if not lines:
        raise ConversionError("No text could be extracted for invoice parsing")

    inv = _parse_invoice(lines)

    wb = openpyxl.Workbook()
    # ── Sheet 1: Summary ────────────────────────────────────────────────────
    ws_sum = wb.active
    ws_sum.title = "Summary"
    hdr_fill = PatternFill("solid", fgColor="1F4E79")
    hdr_font = Font(bold=True, color="FFFFFF", size=11)
    val_font = Font(size=11)

    summary_rows = [
        ("Field", "Value"),
        ("Vendor / Company", inv.vendor),
        ("Invoice Number", inv.invoice_number),
        ("Date", inv.date),
        ("Bill To", inv.bill_to),
        ("GSTIN", inv.gstin),
        ("Subtotal", inv.subtotal),
        ("Tax / GST", inv.tax),
        ("Grand Total", inv.total),
    ]
    for ri, (k, v) in enumerate(summary_rows, start=1):
        c1 = ws_sum.cell(row=ri, column=1, value=k)
        c2 = ws_sum.cell(row=ri, column=2, value=v)
        if ri == 1:
            c1.font = hdr_font; c1.fill = hdr_fill
            c2.font = hdr_font; c2.fill = hdr_fill
        else:
            c1.font = Font(bold=True, size=11)
            c2.font = val_font
        c1.alignment = Alignment(vertical="top")
        c2.alignment = Alignment(vertical="top", wrap_text=True)

    ws_sum.column_dimensions["A"].width = 22
    ws_sum.column_dimensions["B"].width = 40

    # ── Sheet 2: Line Items ─────────────────────────────────────────────────
    ws_items = wb.create_sheet("Line Items")
    item_headers = ["#", "Description", "Quantity", "Amount"]
    for ci, h in enumerate(item_headers, start=1):
        cell = ws_items.cell(row=1, column=ci, value=h)
        cell.font = hdr_font
        cell.fill = hdr_fill

    if inv.items:
        for ri, item in enumerate(inv.items, start=2):
            ws_items.cell(row=ri, column=1, value=ri - 1)
            ws_items.cell(row=ri, column=2, value=item["description"])
            ws_items.cell(row=ri, column=3, value=item["quantity"])
            ws_items.cell(row=ri, column=4, value=item["amount"])
    else:
        # No structured items found — dump raw lines
        for ri, line in enumerate(lines[: 100], start=2):
            ws_items.cell(row=ri, column=1, value=ri - 1)
            ws_items.cell(row=ri, column=2, value=line)

    ws_items.column_dimensions["A"].width = 5
    ws_items.column_dimensions["B"].width = 45
    ws_items.column_dimensions["C"].width = 12
    ws_items.column_dimensions["D"].width = 15
    ws_items.freeze_panes = ws_items["A2"]

    # ── Sheet 3: Raw Text ────────────────────────────────────────────────────
    ws_raw = wb.create_sheet("Raw Text")
    for ri, line in enumerate(lines[:500], start=1):
        ws_raw.cell(row=ri, column=1, value=line)
    ws_raw.column_dimensions["A"].width = 80

    buf = io.BytesIO()
    wb.save(buf)
    result = buf.getvalue()
    validate_xlsx(result)
    return result
