"""
PDF → XLSX

Strategy:
  1. Extract tables via PyMuPDF's table finder.
  2. Fall back to column-alignment heuristic for non-bordered tables.
  3. Each PDF page with tables → one worksheet.
  4. If no tables: dump all text spans in reading order (still useful).
  5. Auto-size columns, freeze header row, apply basic formatting.
"""
from __future__ import annotations

import io
import re

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from .shared import (
    ConversionError, PageData, TableBlock,
    extract_pdf_pages, validate_xlsx,
)


def convert(data: bytes) -> bytes:
    pages = extract_pdf_pages(data)
    if not pages:
        raise ConversionError("PDF has no pages")

    wb = openpyxl.Workbook()
    wb.remove(wb.active)  # remove default sheet

    sheets_added = 0
    for page in pages:
        if page.tables:
            for ti, tb in enumerate(page.tables):
                sname = f"P{page.page_num + 1}T{ti + 1}"[:31]
                ws = wb.create_sheet(title=sname)
                _write_table(ws, tb)
                sheets_added += 1
        else:
            # no formal tables — try column-alignment heuristic
            rows = _spans_to_grid(page)
            if rows:
                sname = f"Page{page.page_num + 1}"[:31]
                ws = wb.create_sheet(title=sname)
                _write_rows(ws, rows)
                sheets_added += 1

    if sheets_added == 0:
        # last resort: dump all text into one sheet
        ws = wb.create_sheet(title="Content")
        row = 1
        for page in pages:
            for span in page.spans:
                ws.cell(row=row, column=1, value=span.text)
                row += 1
        sheets_added = 1

    buf = io.BytesIO()
    wb.save(buf)
    result = buf.getvalue()
    validate_xlsx(result)
    return result


# ─────────────────────────────────────────────────────────────────────────────

_HEADER_FILL = PatternFill("solid", fgColor="1F4E79")
_HEADER_FONT = Font(bold=True, color="FFFFFF", size=10)
_ALT_FILL = PatternFill("solid", fgColor="EBF3FB")
_BORDER_FONT = Font(size=9)


def _write_table(ws, tb: TableBlock) -> None:
    rows = tb.as_rows()
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            cell = ws.cell(row=ri + 1, column=ci + 1)
            cell.value = _coerce(val)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            if ri == 0:
                cell.font = _HEADER_FONT
                cell.fill = _HEADER_FILL
            elif ri % 2 == 0:
                cell.fill = _ALT_FILL
                cell.font = _BORDER_FONT
            else:
                cell.font = _BORDER_FONT

    # Auto-size columns (cap at 50)
    for col in ws.columns:
        max_len = max((len(str(c.value or "")) for c in col), default=0)
        ws.column_dimensions[get_column_letter(col[0].column)].width = min(max_len + 4, 50)

    if ws.max_row > 1:
        ws.freeze_panes = ws["A2"]


def _write_rows(ws, rows: list[list[str]]) -> None:
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            cell = ws.cell(row=ri + 1, column=ci + 1)
            cell.value = _coerce(val)
            cell.alignment = Alignment(wrap_text=True)
            if ri == 0:
                cell.font = _HEADER_FONT
                cell.fill = _HEADER_FILL
    for col in ws.columns:
        max_len = max((len(str(c.value or "")) for c in col), default=0)
        ws.column_dimensions[get_column_letter(col[0].column)].width = min(max_len + 4, 50)


def _coerce(val: str):
    """Convert a cell string to int/float if it looks numeric."""
    v = val.strip().replace(",", "")
    if not v:
        return None
    # Strip common currency symbols
    stripped = re.sub(r"^[₹$€£¥\s]+", "", v).strip()
    try:
        return int(stripped)
    except ValueError:
        pass
    try:
        return float(stripped)
    except ValueError:
        pass
    return val


def _spans_to_grid(page: PageData) -> list[list[str]]:
    """
    Heuristic column detection: cluster x-positions into columns.
    Only applied when there are no table structures.
    """
    if not page.spans:
        return []

    # Collect unique x-origins
    xs = sorted(set(round(s.x, 0) for s in page.spans))
    if len(xs) < 2:
        # Single column
        return [[s.text] for s in page.spans]

    # Build column buckets (within 20px = same column)
    col_buckets: list[float] = [xs[0]]
    for x in xs[1:]:
        if x - col_buckets[-1] > 20:
            col_buckets.append(x)

    if len(col_buckets) < 2:
        return [[s.text] for s in page.spans]

    # Group spans by row (same y within 4px)
    row_groups: dict[int, list] = {}
    for span in page.spans:
        ry = round(span.y / 4) * 4
        row_groups.setdefault(ry, []).append(span)

    grid_rows: list[list[str]] = []
    for ry in sorted(row_groups):
        row_spans = sorted(row_groups[ry], key=lambda s: s.x)
        row_cells = [""] * len(col_buckets)
        for span in row_spans:
            # Assign to nearest column bucket
            col_idx = min(range(len(col_buckets)), key=lambda i: abs(col_buckets[i] - span.x))
            row_cells[col_idx] = (row_cells[col_idx] + " " + span.text).strip()
        grid_rows.append(row_cells)

    return grid_rows
