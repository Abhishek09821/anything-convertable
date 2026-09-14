# Anything Convertable

An **accuracy-first document conversion suite** (iLovePDF-grade) featuring 7 core converters with native layout fidelity, image preservation, font customization (Times New Roman, Arial, Calibri, Georgia), Searchable vs. Non-Searchable PDF output options, and full Hindi / Devanagari Unicode support.

---

## 🚀 The 7 Converters & How They Work

### 1. Image → PDF (`image_to_pdf`)
Converts PNG, JPG, JPEG, WEBP, BMP, and TIFF images into print-quality PDF documents matching the exact pixel dimensions and aspect ratio without artificial scaling or compression artifacts.

* **Under the Hood:**
  * **Pillow (`PIL.Image`)**: Reads native image dimensions, EXIF orientation metadata (auto-rotating landscape/portrait photos upright), and DPI density tags.
  * **ReportLab (`reportlab.pdfgen.canvas`)**: Emits high-quality PDF page geometry where 1 inch = 72 pt, matching the source image's physical resolution.
  * **Multi-frame handling**: Handles animated GIFs, multi-page TIFFs, and alpha transparency channels (RGBA, LA) with automatic lossless PNG embedding for transparent assets.

---

### 2. Word → PDF (`word_to_pdf`)
Converts Microsoft Word `.docx` documents into vector PDF files, faithfully reconstructing paragraph styles, headings, tables, borders, and embedded pictures.

* **Under the Hood:**
  * **`python-docx`**: Parses document structure, XML runs (`w:r`), paragraph formatting (`w:pPr`), tables, borders, cell shading, and picture parts (`w:drawing`).
  * **ReportLab Flowable Engine**: Uses `SimpleDocTemplate`, `Paragraph`, `Table`, `TableStyle`, and `ImageReader` to produce vector-accurate typography and page layouts.
  * **Font Resolution Engine**: Discovers system TrueType fonts (`Times New Roman`, `Arial`, `Calibri`, `Georgia`, and bundled `Noto Sans Devanagari`) and registers them dynamically with ReportLab (`pdfmetrics.registerFont`), ensuring complex Hindi conjuncts render without blank boxes or encoding errors.
  * **Searchable vs. Non-Searchable Toggle**: Generates either selectable vector text or flattened 300 DPI high-resolution raster pages.

---

### 3. PDF → Word (`pdf_to_word`)
Converts PDF documents into genuine, editable Microsoft Word `.docx` files (guaranteed `.docx` format with valid OpenXML ZIP structure). Reconstructs complex multi-column layouts, tables, and images.

* **Under the Hood:**
  * **`pdf2docx`**: Advanced layout analysis engine utilizing PyMuPDF. Identifies paragraph boundaries, reading order, lattice tables, stream tables, and floating/inline images.
  * **Custom Font Selection Engine**:
    * **Keep Original Font (Recommended)**: Preserves native fonts detected from the PDF.
    * **Times New Roman**: Classic academic & formal serif typography.
    * **Arial**: Clean modern sans-serif typography.
    * **Calibri**: Standard Microsoft Office sans-serif typography.
    * **Georgia**: High-legibility editorial serif typography.
  * **Hindi / Complex Script Support**: Scans text runs for Devanagari Unicode ranges (`\u0900-\u097F`) and injects Word OpenXML `<w:rFonts w:ascii="..." w:hAnsi="..." w:cs="..."/>` properties so Hindi text renders flawlessly in Microsoft Word.
  * **Scanned PDF OCR Fallback**: For image-only PDFs, runs **Tesseract OCR** at 300 DPI with bilingual English+Hindi models (`eng+hin`), detects line heights, groups lines into paragraphs, and outputs fully editable Word paragraphs.

---

### 4. PowerPoint → PDF (`ppt_to_pdf`)
Converts Microsoft PowerPoint `.pptx` presentations into high-resolution PDF presentations, rendering each slide with exact slide dimensions, text alignments, tables, shapes, and pictures.

* **Under the Hood:**
  * **`python-pptx`**: Traverses slides, shape trees (`p:spTree`), text frames, tables, and color themes.
  * **Universal Image Processing Engine**:
    * Extracts standard picture shapes (`MSO_SHAPE_TYPE.PICTURE = 13`).
    * Resolves picture placeholders (`MSO_SHAPE_TYPE.PLACEHOLDER = 14`).
    * Resolves shape picture fills (`<a:blipFill>` on rectangles, callouts, and avatars).
    * Extracts slide background images (`<p:bg>` and `<p:bgPr>`).
    * **Recursive Group Shape Renderer**: Traverses grouped shapes (`MSO_SHAPE_TYPE.GROUP = 6`) with offset coordinate transforms so grouped images and captions are never missed.
    * **Alpha Masking**: Uses Pillow's alpha compositing (`im.paste(..., mask=...)`) so transparent PNG icons, logos, and graphics blend seamlessly without black borders.
  * **Per-Run TrueType Font Resolution**: Dynamically matches each PowerPoint run's font family with system TrueType fonts (`Times New Roman`, `Arial`, `Calibri`, `Georgia`, or `Noto Sans Devanagari`) via `get_pil_font_by_name`.
  * **Searchable vs. Non-Searchable Toggle**: Option to export as selectable vector PDF or flattened 300 DPI tamper-resistant document.

---

### 5. PDF → PowerPoint (`pdf_to_ppt`)
Converts PDF pages into editable PowerPoint `.pptx` slides. Each PDF page becomes an individual slide containing native, selectable text boxes, background styling, and real embedded picture shapes.

* **Under the Hood:**
  * **PyMuPDF**:
    * Extracts high-resolution embedded images using object cross-references (`page.get_images()` and `page.get_image_rects(xref)`).
    * Extracts structured text dictionary blocks (`page.get_text("dict")`) with bounding boxes, font sizes, colors, and alignments.
  * **Native PowerPoint Image Placement**: Places extracted images as real, independent PowerPoint `Picture` shapes (`slide.shapes.add_picture`) at their exact coordinates. Users can select, move, resize, and replace images in PowerPoint!
  * **Font Customization & XML Binding**:
    * Allows choosing **Keep Original**, **Times New Roman**, **Arial**, **Calibri**, or **Georgia**.
    * Merges adjacent text spans on the same line to minimize shape fragmentation.
    * Injects OpenXML `<a:latin typeface="..."/>` and `<a:cs typeface="Noto Sans Devanagari"/>` tags for seamless cross-platform font rendering.
  * **Scanned Page Fallback**: For scanned documents with no extractable text or images, embeds a high-resolution 200/300 DPI raster slide.

---

### 6. Text → Word (`text_to_word`)
Converts raw or typed text into a beautifully formatted Microsoft Word `.docx` document.

* **Under the Hood:**
  * **`python-docx`**: Builds standard 1-inch margin business documents with clean line spacing (1.15) and paragraph spacing.
  * **Typography Selection**: Supports Times New Roman, Arial, Calibri, and Georgia with user-selected point sizes.
  * **Devanagari XML Pairing**: Automatically attaches `w:rFonts w:cs="..."` properties pointing to Noto Sans Devanagari, ensuring Hindi letters and matras render properly in Word.

---

### 7. Text → PDF (`text_to_pdf`)
Converts raw or typed text into professional PDF documents.

* **Under the Hood:**
  * **ReportLab Platypus Engine**: Uses `SimpleDocTemplate`, `ParagraphStyle`, and `Spacer` for automatic pagination, word wrapping, and margins.
  * **Unicode TrueType Registration**: Directly registers system TrueType fonts and Google Noto Sans Devanagari with ReportLab.
  * **Searchable vs. Non-Searchable PDF**:
    * **Searchable**: Generates vector text with copy/paste and search support.
    * **Non-Searchable**: Flattens pages into 300 DPI raster images using PyMuPDF, providing tamper-resistant document output.

---

## ✍️ Live Typing & Direct Text Conversion

Users can type or paste text directly into the web application without uploading files:
* Live word and character counting.
* Instant toggle between **Word (.docx)** and **PDF (.pdf)** output.
* Real-time font selection: **Times New Roman**, **Arial**, **Calibri**, **Georgia**.
* Configurable font sizes: 10 pt, 11 pt, 12 pt, 14 pt, 16 pt.
* Searchable vs. Non-Searchable PDF security toggle.

---

## 🔒 Searchable vs. Non-Searchable PDF Options

Every PDF-producing converter (`word_to_pdf`, `ppt_to_pdf`, `text_to_pdf`) includes a searchable mode option:
1. **Searchable PDF (Vector Text)** *(Default)*:
   * Retains full vector text, selectable glyphs, and searchable document content.
   * Minimal file size and fast viewing.
2. **Non-Searchable PDF (Protected Flat Raster - 300 DPI)**:
   * Uses PyMuPDF to rasterize each page at 300 DPI high resolution and re-embeds it into a flat image-backed PDF.
   * Text cannot be copied, selected, or scraped by bots.
   * Ideal for contracts, official forms, legal documents, and tamper-resistant distribution.

---

## 🛠️ Architecture & Technologies

| Purpose | Technology / Library | Version | Role |
|---|---|---|---|
| **Backend API** | FastAPI + Uvicorn | 0.115+ | High-performance asynchronous REST API |
| **Frontend Web** | Next.js 15 + React 19 + TailwindCSS | 15.1+ | Tabbed modern UI with file converter & live text typing |
| **PDF Processing** | PyMuPDF (`fitz`) | 1.25+ | Fast vector PDF parsing, font extraction, xref image extraction, 300 DPI rasterization |
| **PDF → DOCX Engine** | `pdf2docx` | 0.5.8+ | Layout analysis, lattice/stream table reconstruction |
| **Word Processing** | `python-docx` | 1.1+ | DOCX generation, OpenXML styling, and complex script run manipulation |
| **PowerPoint Processing**| `python-pptx` | 1.0+ | PPTX slide generation, shape tree manipulation, picture relationships |
| **PDF Generation** | ReportLab | 4.2+ | Vector PDF canvas rendering and TrueType font metrics |
| **Image Processing** | Pillow (PIL) | 11.1+ | High-resolution image manipulation, EXIF rotation, alpha blending |
| **Devanagari Font** | Noto Sans Devanagari | TTF | Bundled Google Font for 100% universal Hindi rendering |
| **Optical OCR** | Tesseract OCR (`pytesseract`) | Optional | Fallback OCR for scanned PDFs in Hindi (`hin`) and English (`eng`) |

---

## 💻 Quick Start

### 1. Backend Setup (FastAPI)

```bash
cd apps/api

# Create & activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the API server
uvicorn app.main:app --reload --port 8000
```
Backend will be live at `http://127.0.0.1:8000` (Swagger docs at `http://127.0.0.1:8000/docs`).

### 2. Frontend Setup (Next.js)

```bash
# From repository root
npm install

# Run development server
npm --workspace apps/web run dev
```
Frontend will be live at `http://localhost:3000`.

---

## 📡 REST API Reference

### 1. List Conversions
```http
GET /v1/conversions
```
Returns metadata for all 7 supported converters and their supported features (`supports_font_choice` and `supports_searchable_option`).

### 2. Detect File
```http
POST /v1/detect
Content-Type: multipart/form-data
```
Inspects file magic bytes and returns matching converter suggestions.

### 3. Convert File
```http
POST /v1/convert/{conversion_id}?font={font_name}&searchable={true|false}
Content-Type: multipart/form-data
```

#### Parameters:
* `conversion_id`: `image_to_pdf` | `word_to_pdf` | `pdf_to_word` | `ppt_to_pdf` | `pdf_to_ppt` | `text_to_word` | `text_to_pdf`
* `font` *(optional)*: `original` | `Times New Roman` | `Arial` | `Calibri` | `Georgia`
* `searchable` *(optional, for PDF outputs)*: `true` (default) or `false` (300 DPI flat raster)

### 4. Direct Text Conversion (Live Typing)
```http
POST /v1/convert-text
Content-Type: application/json

{
  "text": "Hello World\nनमस्ते भारत!",
  "to_format": "docx",
  "font": "Times New Roman",
  "font_size": 12.0,
  "searchable": true
}
```

---

## 🇮🇳 Hindi & Unicode Support
All 7 converters feature automatic Hindi / Devanagari detection:
* Bundled TrueType `NotoSansDevanagari-Regular.ttf` ensures zero missing glyphs ("tofu" boxes) on any operating system.
* Complex script attributes (`w:cs` in Word OpenXML and `a:cs` in PowerPoint OpenXML) ensure conjuncts, matras, and ligatures display correctly across macOS, Windows, and Linux.
