export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface ConversionInfo {
  id: string;
  label: string;
  description: string;
  accepts: string[];   // e.g. [".pdf"]
  output_ext: string;
  output_mime: string;
  supports_font_choice?: boolean;
  supports_searchable_option?: boolean;
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
  font: string = "original",
  searchable: boolean = true,
): Promise<{ blob: Blob; filename: string; elapsed: string }> {
  const fd = new FormData();
  fd.append("file", file);

  const params = new URLSearchParams();
  if (font && font !== "original") {
    params.set("font", font);
  }
  if (!searchable) {
    params.set("searchable", "false");
  }
  const qs = params.toString() ? `?${params.toString()}` : "";
  const url = `${API}/v1/convert/${conversionId}${qs}`;

  const r = await fetch(url, {
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
    word_to_pdf:  "pdf",
    pdf_to_word:  "docx",
    ppt_to_pdf:   "pdf",
    pdf_to_ppt:   "pptx",
  };
  const filename = match?.[1] ?? `converted.${OUTPUT_EXT[conversionId] ?? "file"}`;
  const elapsed = r.headers.get("X-Elapsed-Seconds") ?? "?";
  return { blob, filename, elapsed };
}

export interface ConvertTextParams {
  text: string;
  to_format: "docx" | "pdf";
  font?: string;
  font_size?: number;
  searchable?: boolean;
}

export async function convertText(
  params: ConvertTextParams,
): Promise<{ blob: Blob; filename: string; elapsed: string }> {
  const r = await fetch(`${API}/v1/convert-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: params.text,
      to_format: params.to_format,
      font: params.font ?? "Calibri",
      font_size: params.font_size ?? 12,
      searchable: params.searchable ?? true,
    }),
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => `HTTP ${r.status}`);
    throw new Error(msg);
  }
  const blob = await r.blob();
  const cd = r.headers.get("Content-Disposition") ?? "";
  const match = cd.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `typed-document.${params.to_format}`;
  const elapsed = r.headers.get("X-Elapsed-Seconds") ?? "?";
  return { blob, filename, elapsed };
}

// Icon for output format
export const FORMAT_ICON: Record<string, string> = {
  pdf:  "📕",
  docx: "📝",
  pptx: "📽️",
  txt:  "📄",
};

// Accepted extensions per conversion (mirrors registry)
export const ACCEPTS_LABEL: Record<string, string> = {
  image_to_pdf: "PNG, JPG, JPEG",
  word_to_pdf:  "DOCX",
  pdf_to_word:  "PDF",
  ppt_to_pdf:   "PPTX",
  pdf_to_ppt:   "PDF",
};
