"""
Invoice → JSON and Invoice → CSV

Reuses the same parsing logic as invoice_to_xlsx.
Returns (json_bytes, csv_bytes) as a tuple so the API can serve either.
"""
from __future__ import annotations

import csv
import io
import json

from .shared import (
    ConversionError, extract_pdf_pages, load_image, ocr_image,
    validate_json, validate_csv,
)
from .invoice_to_xlsx import _parse_invoice


def convert_json(data: bytes, is_image: bool = False) -> bytes:
    """Return structured invoice data as JSON bytes."""
    lines = _extract_lines(data, is_image)
    inv = _parse_invoice(lines)

    payload = {
        "vendor": inv.vendor,
        "invoice_number": inv.invoice_number,
        "date": inv.date,
        "bill_to": inv.bill_to,
        "gstin": inv.gstin,
        "subtotal": inv.subtotal,
        "tax": inv.tax,
        "total": inv.total,
        "currency": inv.currency,
        "line_items": inv.items,
    }
    validate_json(payload, required_keys=["vendor", "invoice_number", "total"])
    return json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")


def convert_csv(data: bytes, is_image: bool = False) -> bytes:
    """Return line items + summary as CSV bytes."""
    lines = _extract_lines(data, is_image)
    inv = _parse_invoice(lines)

    buf = io.StringIO()
    writer = csv.writer(buf)

    # Summary section
    writer.writerow(["SUMMARY", ""])
    for k, v in [
        ("Vendor", inv.vendor),
        ("Invoice Number", inv.invoice_number),
        ("Date", inv.date),
        ("Bill To", inv.bill_to),
        ("GSTIN", inv.gstin),
        ("Subtotal", inv.subtotal),
        ("Tax", inv.tax),
        ("Total", inv.total),
    ]:
        writer.writerow([k, v])

    writer.writerow([])
    writer.writerow(["LINE ITEMS", "", "", ""])
    writer.writerow(["#", "Description", "Quantity", "Amount"])
    if inv.items:
        for i, item in enumerate(inv.items, start=1):
            writer.writerow([i, item["description"], item["quantity"], item["amount"]])
    else:
        for i, line in enumerate(lines[:100], start=1):
            writer.writerow([i, line, "", ""])

    result = buf.getvalue().encode("utf-8-sig")  # BOM for Excel compatibility
    validate_csv(result)
    return result


def _extract_lines(data: bytes, is_image: bool) -> list[str]:
    if is_image:
        im = load_image(data)
        ocr_lines = ocr_image(im)
        lines = [ln["text"] for ln in ocr_lines]
    else:
        pages = extract_pdf_pages(data)
        lines = [s.text for p in pages for s in p.spans]
    if not lines:
        raise ConversionError("No text could be extracted")
    return lines
