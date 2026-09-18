// Same-origin proxy also works on phones, where localhost refers to the phone itself.
export const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";
export interface ConversionInfo {
  id: string; label: string; description: string; accepts: string[];
  output_ext: string; output_mime: string;
  supports_font_choice?: boolean; supports_searchable_option?: boolean;
}
export interface DownloadResult { blob: Blob; filename: string; elapsed: string; warnings: string[] }
export interface DetectResponse { ext: string; suggested: string[]; all_conversions: ConversionInfo[] }
async function checked(response: Response) {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(typeof data?.detail === "string" ? data.detail : `Request failed (${response.status}). Please try again.`);
  }
  return response;
}
async function download(response: Response, fallback: string): Promise<DownloadResult> {
  await checked(response);
  const header = response.headers.get("Content-Disposition") ?? "";
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let filename = header.match(/filename="([^"]+)"/)?.[1] ?? fallback;
  if (encoded) { try { filename = decodeURIComponent(encoded); } catch { /* Keep fallback. */ } }
  let warnings: string[] = [];
  try { warnings = JSON.parse(response.headers.get("X-Conversion-Warnings") ?? "[]"); } catch { /* Older API. */ }
  return { blob: await response.blob(), filename, warnings, elapsed: response.headers.get("X-Elapsed-Seconds") ?? "" };
}
export async function listConversions(): Promise<ConversionInfo[]> {
  return (await checked(await fetch(`${API}/v1/conversions`))).json();
}
export async function detectFile(file: File): Promise<DetectResponse> {
  const body = new FormData(); body.append("file", file);
  return (await checked(await fetch(`${API}/v1/detect`, { method: "POST", body }))).json();
}
export async function convertFile(file: File, id: string, font = "original", searchable = true, fidelity = "appearance") {
  const body = new FormData(); body.append("file", file);
  const query = new URLSearchParams({ font, searchable: String(searchable), fidelity });
  const ext = id === "pdf_to_word" ? "docx" : id === "pdf_to_ppt" ? "pptx" : "pdf";
  return download(await fetch(`${API}/v1/convert/${id}?${query}`, { method: "POST", body }), `converted.${ext}`);
}
export interface ConvertTextParams { text: string; to_format: "docx" | "pdf"; font?: string; font_size?: number; searchable?: boolean }
export async function convertText(params: ConvertTextParams) {
  return download(await fetch(`${API}/v1/convert-text`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params),
  }), `typed-document.${params.to_format}`);
}
