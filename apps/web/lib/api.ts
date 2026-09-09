// lib/api.ts — thin typed wrappers around the FastAPI backend

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// ── Types (mirror app/models/schemas.py) ─────────────────────────────────────

export interface ConversionMeta {
  id: string;
  label: string;
  description: string;
  input_types: string[];   // 'pdf' | 'image' | 'any'
  output_ext: string;
  output_mime: string;
}

export interface DetectResponse {
  doc_type: string;
  suggested_conversions: string[];
  page_count: number;
  has_tables: boolean;
  has_images: boolean;
  text_length: number;
  warnings: string[];
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchConversions(): Promise<ConversionMeta[]> {
  const r = await fetch(`${API_BASE}/v1/conversions`);
  if (!r.ok) throw new Error(`Failed to load conversions: ${r.status}`);
  return r.json();
}

export async function detectFile(file: File): Promise<DetectResponse> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(`${API_BASE}/v1/detect`, { method: 'POST', body: fd });
  if (!r.ok) {
    const msg = await r.text().catch(() => String(r.status));
    throw new Error(msg);
  }
  return r.json();
}

export async function convertFile(
  file: File,
  conversionId: string,
  onProgress?: (stage: string) => void,
): Promise<{ blob: Blob; filename: string }> {
  onProgress?.('Uploading');
  const fd = new FormData();
  fd.append('file', file);

  onProgress?.('Converting');
  const r = await fetch(`${API_BASE}/v1/convert/${conversionId}`, {
    method: 'POST',
    body: fd,
  });

  if (!r.ok) {
    const msg = await r.text().catch(() => String(r.status));
    throw new Error(msg);
  }

  onProgress?.('Validating');
  const blob = await r.blob();

  // Pull filename from Content-Disposition header
  const cd = r.headers.get('Content-Disposition') ?? '';
  const match = cd.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `document.${conversionId.split('_').pop()}`;

  onProgress?.('Ready');
  return { blob, filename };
}

// ── Icon mapping for doc types and conversions ────────────────────────────────

export const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: '🧾 Invoice',
  resume: '📄 Resume / CV',
  screenshot: '🖥️ Screenshot',
  pdf: '📕 PDF',
  image: '🖼️ Image / Scan',
  generic: '📋 Document',
};

export const OUTPUT_ICONS: Record<string, string> = {
  docx: '📝',
  xlsx: '📊',
  pptx: '📽️',
  pdf: '📕',
  html: '🌐',
  json: '{ }',
  csv: '📉',
};
