# Anything Convertable

An **accuracy-first AI document converter** — convert PDFs, scans, invoices, resumes and screenshots into editable, structured formats that normal converters can't produce.

## What it does

Upload a PDF, image, invoice, resume or screenshot and get back a real, structured output file:

| Input | Output | What's preserved |
|---|---|---|
| PDF | DOCX | Text, headings, tables, images, layout order |
| PDF | XLSX | Tables extracted as real cells, numeric coercion |
| PDF | PPTX | One slide per page with editable text + background |
| Image / Scan | DOCX | OCR text, heading detection, embedded source image |
| Image / Scan | XLSX | Column-detection → real spreadsheet cells |
| Image / Scan | Searchable PDF | Original visual + invisible OCR text layer |
| Invoice | XLSX | Vendor, invoice #, date, line items, tax, totals |
| Invoice | JSON / CSV | Machine-readable structured invoice data |
| Resume | DOCX | Sections, headings, dates, skills, experience |
| Screenshot | HTML/CSS | Positioned real HTML — not a background image |

## Run

### Backend (FastAPI)

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Optional — enable OpenAI vision refinement:
```bash
export OPENAI_API_KEY=sk-...
```

For OCR on images and scanned PDFs, Tesseract must be installed:
```bash
# macOS
brew install tesseract tesseract-lang

# Ubuntu / Debian
sudo apt install tesseract-ocr tesseract-ocr-hin
```

The server starts and all non-OCR converters work without Tesseract.

### Frontend (Next.js)

```bash
cd apps/web
npm install
npm run dev
```

Open `http://localhost:3000`.

Custom API URL:
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

### Chrome Extension

```bash
cd extension
npm install
npm run build
```

Load the built folder in Chrome via `chrome://extensions` → Developer Mode → Load unpacked.

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe |
| `GET` | `/v1/conversions` | List all available conversions with metadata |
| `POST` | `/v1/detect` | Classify uploaded file, return ordered conversion suggestions |
| `POST` | `/v1/convert/{id}` | Run a specific conversion, stream the output file |

### Example

```bash
# Detect what a file is and what conversions are recommended
curl -F "file=@invoice.pdf" http://localhost:8000/v1/detect

# Convert a PDF to DOCX
curl -F "file=@report.pdf" http://localhost:8000/v1/convert/pdf_to_docx -o report.docx

# Extract structured invoice data as JSON
curl -F "file=@invoice.pdf" http://localhost:8000/v1/convert/invoice_to_json

# Convert a screenshot to HTML/CSS
curl -F "file=@screen.png" http://localhost:8000/v1/convert/screenshot_to_html -o page.html
```

### Conversion IDs

```
pdf_to_docx              PDF → Word document
pdf_to_xlsx              PDF → Excel spreadsheet
pdf_to_pptx              PDF → PowerPoint presentation
image_to_docx            Image/Scan → Word document
image_to_xlsx            Image/Scan → Excel spreadsheet
image_to_searchable_pdf  Image/Scan → Searchable PDF
invoice_to_xlsx          Invoice → Excel (Summary + Line Items sheets)
invoice_to_json          Invoice → JSON
invoice_to_csv           Invoice → CSV
resume_to_docx           Resume → Word document
screenshot_to_html       Screenshot → HTML/CSS
```

## Tests

```bash
cd apps/api
python -m pytest tests/test_converters.py -v
# 109 tests — shared layer, all 10 converters, registry, API routes, accuracy
```

## Architecture

```
Upload → /v1/detect → classify document
       → /v1/convert/{id} → shared extraction layer
                           → OCR (Tesseract, eng+hin)
                           → PDF extraction (PyMuPDF)
                           → table detection
                           → converter module
                           → output validation
                           → download
```

### Backend modules

```
app/
  main.py                    FastAPI routes
  core/config.py             Settings / env vars
  models/schemas.py          Pydantic request/response models
  conversions/
    shared.py                OCR, PDF extraction, validators, classifiers
    registry.py              Conversion catalogue (id → metadata + callable)
    pdf_to_docx.py
    pdf_to_xlsx.py
    pdf_to_pptx.py
    image_to_docx.py
    image_to_xlsx.py
    image_to_searchable_pdf.py
    invoice_to_xlsx.py
    invoice_to_json.py       (also exports convert_csv)
    resume_to_docx.py
    screenshot_to_html.py
```

### Frontend

Single-page Next.js app (`apps/web/app/page.tsx`):

1. Drop zone — upload PDF / image (up to 50 MB)
2. Detection — calls `/v1/detect`, shows document type and suggested conversions
3. Conversion picker — all 11 conversions shown, suggested ones highlighted
4. Progress states — Uploading → Converting → Validating → Ready
5. Download — direct browser download of the converted file
6. History — recent conversions in the session

## Accuracy notes

- **PDF text extraction** uses PyMuPDF native text (fastest, most accurate for text PDFs).
- **Scanned PDFs** are rendered at 2× resolution then OCR'd with Tesseract.
- **Table detection** uses PyMuPDF's built-in table finder for bordered tables; falls back to x-position clustering for tab-separated layouts.
- **Invoice parsing** is regex-based and handles common Indian (GSTIN, INR) and international formats.
- **Hindi + English** mixed OCR uses `tesseract -l eng+hin`. Requires `tesseract-ocr-hin` language pack.
- If OCR or a parser step fails, the converter surfaces the error rather than returning a blank file.

## Known limitations

- DOCX output is linearised (no absolute positioning — Word doesn't support it for body text).
- PPTX text boxes are approximate; font metrics differ between PDF and PowerPoint renderers.
- Invoice field extraction is regex-based; non-standard templates may miss some fields.
- Screenshot → HTML uses absolute positioning at original viewport size; responsive layouts are not reconstructed.
- Handwriting is not supported by Tesseract without a custom trained model.

## Production next steps

- Job queue (Celery / RQ) for long-running conversions.
- S3-compatible object storage for uploaded files and output artefacts.
- PostgreSQL persistence + authentication.
- Streaming progress events via SSE / WebSocket.
- Better table reconstruction for complex merged-cell layouts.
- Vision model integration (GPT-4o) for layout understanding when Tesseract confidence is low.
- Provider abstraction layer for swappable OCR and VLM backends.
