export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface ConversionInfo {
  id: string;
  label: string;
  description: string;
  accepts: string[];   // e.g. [".pdf"]
  output_ext: string;
  output_mime: string;
}

export interface DetectResponse {
  ext: string;
  suggested: string[];
  all_conversions: ConversionInfo[];
}

export async function listConversions(): Promise<ConversionInfo[]> {
  const r = await fetch(`${API}/v1/conversions`);
  if (!r.ok) throw new Error(`Failed to load conversions (${r.status})`);
  return r.json();
}

export async function detectFile(file: File): Promise<DetectResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API}/v1/detect`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text().catch(() => `HTTP ${r.status}`));
  return r.json();
}

export async function convertFile(
  file: File,
  conversionId: string,
): Promise<{ blob: Blob; filename: string; elapsed: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API}/v1/convert/${conversionId}`, {
    method: "POST",
    body: fd,
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => `HTTP ${r.status}`);
    throw new Error(msg);
  }
  const blob = await r.blob();
  const cd = r.headers.get("Content-Disposition") ?? "";
  const match = cd.match(/filename="([^"]+)"/);
  const OUTPUT_EXT: Record<string, string> = {
    image_to_pdf: "pdf",
    word_to_pdf: "pdf",
    pdf_to_word: "docx",
    ppt_to_pdf: "pdf",
    pdf_to_ppt: "pptx",
  };
  const filename = match?.[1] ?? `converted.${OUTPUT_EXT[conversionId] ?? "file"}`;
  const elapsed = r.headers.get("X-Elapsed-Seconds") ?? "?";
  return { blob, filename, elapsed };
}

// Icon for output format
export const FORMAT_ICON: Record<string, string> = {
  pdf:  "📕",
  docx: "📝",
  pptx: "📽️",
};

// Accepted extensions per conversion (mirrors registry)
export const ACCEPTS_LABEL: Record<string, string> = {
  image_to_pdf: "PNG, JPG, JPEG",
  word_to_pdf:  "DOCX",
  pdf_to_word:  "PDF",
  ppt_to_pdf:   "PPTX",
  pdf_to_ppt:   "PDF",
};
