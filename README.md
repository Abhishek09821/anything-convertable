# Anything Editable

A runnable MVP for **document reconstruction**: PDF/image input → AEDOM → editable canvas → AI-style commands → PDF/DOCX/HTML/SVG export.

## What is implemented
- FastAPI backend with PDF text/layout extraction via PyMuPDF.
- Optional image OCR via `pytesseract` when the host has Tesseract installed.
- Optional OpenAI vision refinement via `OPENAI_API_KEY`.
- AEDOM TypeScript package for the central editable document representation.
- Next.js + React-Konva editor with selection, direct text editing, drag, delete, zoom and export.
- AI edit endpoint supporting the MVP command patterns in the PRD.
- Confidence score and low-confidence review flagging.
- Chrome Manifest V3 extension popup + context menu integration.

## Run

### API
```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Optional:
```bash
export OPENAI_API_KEY=...
```

For image OCR, install the system Tesseract binary separately. The backend remains functional without it.

### Web
```bash
cd apps/web
npm install
npm run dev
```
Open `http://localhost:3000`.

Optional API URL:
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

### Extension
```bash
cd extension
npm install
npm run build
```
Load the generated extension build from Chrome's `chrome://extensions` using Developer Mode → Load unpacked.

## Architecture

`Input → Reconstruction → AEDOM → Editor → Export`

The key design decision is that AI edits operate on AEDOM elements rather than regenerating a screenshot. The vision provider is therefore a refinement stage, not the editor itself.

## Next production steps
- Redis/RQ or Celery job queue for heavy jobs.
- S3-compatible object storage for source files and page renders.
- PostgreSQL persistence and authentication.
- Better table/object reconstruction and image cropping.
- Page thumbnails and multi-page editor.
- Visual diff renderer using page snapshots.
- Provider abstraction for OCR/VLM vendors and retry/cost controls.
