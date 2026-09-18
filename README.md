# Anything Convertable

A responsive document conversion workspace with five file converters and a text studio. The interface uses a minimal card-and-control layout inspired by [21st.dev](https://21st.dev), with Lucide icons, keyboard focus states, and a same-origin API proxy for mobile access.

## Conversion behavior

| Tool | Accuracy strategy | Limits |
| --- | --- | --- |
| Image to PDF | Original JPEG stream when possible; lossless embedding for other images; alpha masks; EXIF orientation; physical DPI; all TIFF/GIF frames; ICC-to-sRGB conversion | Color conversion can change pixel values. Image text remains an image. |
| Word to PDF | LibreOffice Writer renders paragraphs, headers, footers, tables, drawings and images; lossless image export without downsampling | Source fonts must be installed. Office engines can differ on unusual layouts. |
| PDF to Word | Native pages use pdf2docx; each scanned page uses Tesseract OCR; mixed documents process both kinds of pages | Editable layout is reconstructed. Each scanned page includes recognized text followed by its source image to retain graphics and allow comparison. OCR fonts are estimated; page counts can increase. |
| PowerPoint to PDF | LibreOffice Impress renders slides, master layouts, grouped shapes, charts and selectable text | Fonts must be installed; effects unsupported by LibreOffice may differ from Microsoft Office. |
| PDF to PowerPoint | **Preserve appearance** keeps the complete rendered page at up to 300 DPI. **Editable text** reconstructs native text over a complete graphics layer | Appearance mode is image-based. Graphics are not individually editable. Rotated/scanned pages remain images in editable mode. Mixed page sizes are fitted without stretching. |

The UI defaults to preserving source fonts. Selecting a different font changes family names while retaining sizes, emphasis and complex-script bindings. Font substitution can change line breaks. Scanned pixels do not identify an exact font family.

Conversion responses include quality notes. Missing OCR language packs, low-confidence recognition, image-based slides and fallback Office rendering are disclosed. Conversion errors are returned rather than silently skipping failed PDF pages. These changes improve specific failure cases; they are not a benchmark claim of parity with a commercial service.

The legacy Office renderers remain available when LibreOffice is missing and produce an explicit warning. Use the supplied container or install LibreOffice for the higher-fidelity path. The fallback PowerPoint renderer produces image pages even when selectable text is requested; the result discloses this limitation.

## Run locally

```bash
python3 -m venv .venv
.venv/bin/pip install -r apps/api/requirements.txt
# Install LibreOffice, Tesseract, and the OCR languages used by your documents.
# macOS:
brew install --cask libreoffice
brew install tesseract tesseract-lang

.venv/bin/uvicorn app.main:app --app-dir apps/api --port 8000
```

In another terminal:

```bash
npm ci
npm --workspace apps/web run dev -- --hostname 0.0.0.0
```

Open `http://localhost:3000`. On a phone connected to the same network, use the computer's LAN address and port 3000. The browser calls `/api`, which Next.js proxies to port 8000; it does not call localhost on the phone.

- `API_INTERNAL_URL`: server-side backend URL (default `http://127.0.0.1:8000`). Set before building when deploying separately.
- `NEXT_PUBLIC_API_URL`: optional direct browser API URL; requires suitable CORS configuration.
- `LIBREOFFICE_PATH`: optional path to the `soffice` executable.
- `OCR_LANGS`: requested Tesseract models, default `eng+hin`.

Install the licensed source fonts on the server for closest Office output. Arial, Calibri, Georgia, and Times New Roman are not bundled. The container includes Liberation, Carlito and Noto fonts; these are substitutes, not identical fonts. The bundled Devanagari font is installed in the container.

## Backend container

```bash
docker build -t anything-convertable-api apps/api
docker run --rm -p 8000:8000 anything-convertable-api
```

This image includes LibreOffice Writer/Impress, Tesseract English/Hindi, and open fonts, and runs the API as a non-root user. LibreOffice uses an isolated temporary profile per job and a 180-second timeout. The image must be built and validated in your deployment environment.

## API

- `GET /health`
- `GET /v1/conversions`
- `POST /v1/detect`: detects actual image/PDF/Office content, not just extensions.
- `POST /v1/convert/{id}`: multipart `file`; query `font`, `searchable`, `fidelity`.
- `POST /v1/convert-text`: JSON `text`, `to_format`, `font`, `font_size`, `searchable`.

IDs: `image_to_pdf`, `word_to_pdf`, `pdf_to_word`, `ppt_to_pdf`, `pdf_to_ppt`.

`fidelity=appearance|editable` applies to PDF-to-PowerPoint. The web interface recommends `appearance`; the API keeps `editable` as its compatibility default. `searchable=false` rasterizes PDF pages at 300 DPI. Flattening is not encryption or tamper protection; OCR can recover text.

Download responses expose `Content-Disposition` (including Unicode filenames), `X-Elapsed-Seconds`, and JSON `X-Conversion-Warnings`. CPU-heavy conversions run outside the async request loop.

## Verification

```bash
.venv/bin/python -B -m pytest -q apps/api/tests
npm run build:web
```

The regression suite covers image pixels, JPEG stream preservation, palette transparency, EXIF/DPI, multi-page TIFFs, complete slide graphics, mixed native/scanned PDFs, font-family overrides, content-based detection and quality notes. Integration tests use Tesseract and LibreOffice when installed, including searchable presentation text, rendered colors, headers, images and font overrides (including embedded Georgia when installed). On macOS, the renderer exposes local font directories to headless fontconfig without changing global settings.

For release validation, also compare representative real documents against their rendered sources, especially multi-column scans, unusual scripts, mathematical notation and custom Office effects. Automated fixtures cannot establish universal accuracy.

Implementation references: [LibreOffice PDF export parameters](https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html), [PyMuPDF page operations](https://pymupdf.readthedocs.io/en/latest/page.html).
