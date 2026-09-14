"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Shield,
  Sparkles,
  Trash2,
  Type,
  UploadCloud,
} from "lucide-react";
import {
  ConversionInfo,
  FORMAT_ICON,
  convertFile,
  convertText,
  detectFile,
  listConversions,
} from "../lib/api";

// ── types ─────────────────────────────────────────────────────────────────────
type Stage = "idle" | "detecting" | "ready" | "converting" | "done" | "error";
type ActiveTab = "file" | "text";

interface Result {
  blob: Blob;
  filename: string;
  elapsed: string;
  label: string;
}

// ── Tile configurations for file conversions ──────────────────────────────────
const TILES = [
  {
    id: "image_to_pdf",
    icon: "🖼️",
    arrow: "📕",
    title: "Image → PDF",
    subtitle: "PNG · JPG · JPEG",
    accepts: ".png,.jpg,.jpeg",
  },
  {
    id: "word_to_pdf",
    icon: "📝",
    arrow: "📕",
    title: "Word → PDF",
    subtitle: "DOCX → PDF",
    accepts: ".docx",
  },
  {
    id: "pdf_to_word",
    icon: "📕",
    arrow: "📝",
    title: "PDF → Word",
    subtitle: "PDF → DOCX",
    accepts: ".pdf",
  },
  {
    id: "ppt_to_pdf",
    icon: "📽️",
    arrow: "📕",
    title: "PowerPoint → PDF",
    subtitle: "PPTX → PDF",
    accepts: ".pptx",
  },
  {
    id: "pdf_to_ppt",
    icon: "📕",
    arrow: "📽️",
    title: "PDF → PowerPoint",
    subtitle: "PDF → PPTX",
    accepts: ".pdf",
  },
];

// ── Font options with descriptions ───────────────────────────────────────────
const FILE_FONT_OPTIONS = [
  { id: "original", label: "Keep Original Font (Recommended)", description: "Preserve exact detected document fonts" },
  { id: "Times New Roman", label: "Times New Roman", description: "Classic academic & formal serif" },
  { id: "Arial", label: "Arial", description: "Clean, ultra-legible modern sans-serif" },
  { id: "Calibri", label: "Calibri", description: "Standard Microsoft Office typeface" },
  { id: "Georgia", label: "Georgia", description: "High-contrast elegant editorial serif" },
];

const TYPED_FONT_OPTIONS = [
  { id: "Calibri", label: "Calibri", description: "Modern & balanced standard font" },
  { id: "Times New Roman", label: "Times New Roman", description: "Formal, academic & legal standard" },
  { id: "Arial", label: "Arial", description: "Clean, crisp sans-serif" },
  { id: "Georgia", label: "Georgia", description: "High-legibility elegant book serif" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const SAMPLE_TEXT = `Anything Convertable — High Accuracy Document Engine
==================================================

Welcome to the highest-fidelity document conversion suite!
This system features TrueType font resolution, ligature-preserving Hindi & multilingual Devanagari text processing, and crystal-clear vector or raster PDF output.

हिंदी और बहुभाषी समर्थन (Hindi & Multilingual Support):
- नमस्ते भारत! यह एक उच्च गुणवत्ता वाला दस्तावेज़ रूपांतरण है।
- सटीक फ़ॉन्ट रूपांतरण (Devanagari matras, ligatures & complex scripts).
- गणित और प्रतीक: E = mc², π ≈ 3.14159, ₹ 99,999.00

Features Tested:
1. Searchable Vector PDF vs. 300 DPI Flat Non-Searchable Raster.
2. Direct typography binding (Times New Roman, Arial, Calibri, Georgia).
3. 100% native Word (.docx) and PowerPoint (.pptx) styling.`;

// ── Main Page Component ──────────────────────────────────────────────────────
export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("file");

  // File conversion state
  const [stage, setStage]               = useState<Stage>("idle");
  const [error, setError]               = useState("");
  const [file, setFile]                 = useState<File | null>(null);
  const [convId, setConvId]             = useState<string | null>(null);
  const [selectedFont, setSelectedFont] = useState<string>("original");
  const [searchablePdf, setSearchablePdf] = useState<boolean>(true);
  const [available, setAvailable]       = useState<ConversionInfo[]>([]);
  const [result, setResult]             = useState<Result | null>(null);
  const [history, setHistory]           = useState<Result[]>([]);
  const [allConversions, setAllConversions] = useState<ConversionInfo[]>([]);

  // Typed text converter state
  const [typedText, setTypedText]           = useState("");
  const [typedFormat, setTypedFormat]       = useState<"docx" | "pdf">("docx");
  const [typedFont, setTypedFont]           = useState("Calibri");
  const [typedFontSize, setTypedFontSize]   = useState(12);
  const [typedSearchable, setTypedSearchable] = useState(true);
  const [textStage, setTextStage]           = useState<"idle" | "converting" | "done" | "error">("idle");
  const [textError, setTextError]           = useState("");
  const [textResult, setTextResult]         = useState<Result | null>(null);

  // Hidden file picker references
  const hiddenInput = useRef<HTMLInputElement>(null);
  const dropInput   = useRef<HTMLInputElement>(null);
  const [pendingTileId, setPendingTileId] = useState<string | null>(null);
  const [pendingAccepts, setPendingAccepts] = useState("");

  // Load conversions once on mount
  useEffect(() => {
    listConversions().then(setAllConversions).catch(() => {});
  }, []);

  const convMap = Object.fromEntries(allConversions.map((c) => [c.id, c]));

  // ── Tile clicked in File mode ────────────────────────────────────────────────
  const onTileClick = (id: string, accepts: string) => {
    setPendingTileId(id);
    setPendingAccepts(accepts);
    setTimeout(() => hiddenInput.current?.click(), 0);
  };

  const onTileFile = useCallback(
    async (f: File) => {
      if (!pendingTileId) return;
      setFile(f);
      setConvId(pendingTileId);
      setSelectedFont("original");
      setSearchablePdf(true);
      setError("");
      setResult(null);
      const match = allConversions.find((c) => c.id === pendingTileId);
      setAvailable(match ? [match] : []);
      setStage("ready");
    },
    [pendingTileId, allConversions],
  );

  // ── Drag and drop file ───────────────────────────────────────────────────────
  const handleDropFile = useCallback(async (f: File) => {
    setFile(f);
    setConvId(null);
    setError("");
    setResult(null);
    setAvailable([]);
    setSelectedFont("original");
    setSearchablePdf(true);
    setStage("detecting");
    try {
      const d = await detectFile(f);
      if (d.all_conversions.length === 0) {
        throw new Error(
          `No converter supports "${f.name}". ` +
            "Accepted formats: PNG, JPG, JPEG, PDF, DOCX, PPTX.",
        );
      }
      setAvailable(d.all_conversions);
      setConvId(d.suggested[0] ?? d.all_conversions[0].id);
      setStage("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detection failed");
      setStage("error");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) handleDropFile(f);
    },
    [handleDropFile],
  );

  // ── Execute File Conversion ──────────────────────────────────────────────────
  const runConversion = useCallback(async () => {
    if (!file || !convId) return;
    setStage("converting");
    setError("");
    try {
      const { blob, filename, elapsed } = await convertFile(
        file,
        convId,
        selectedFont,
        searchablePdf,
      );
      const r: Result = {
        blob,
        filename,
        elapsed,
        label: convMap[convId]?.label ?? convId,
      };
      setResult(r);
      setHistory((h) => [r, ...h].slice(0, 8));
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed");
      setStage("error");
    }
  }, [file, convId, convMap, selectedFont, searchablePdf]);

  const resetFileMode = () => {
    setStage("idle");
    setFile(null);
    setConvId(null);
    setAvailable([]);
    setResult(null);
    setError("");
  };

  // ── Execute Live Typed Text Conversion ──────────────────────────────────────
  const runTextConversion = async () => {
    if (!typedText.trim()) {
      setTextError("Please enter some text before converting.");
      return;
    }
    setTextStage("converting");
    setTextError("");
    try {
      const { blob, filename, elapsed } = await convertText({
        text: typedText,
        to_format: typedFormat,
        font: typedFont,
        font_size: typedFontSize,
        searchable: typedSearchable,
      });
      const r: Result = {
        blob,
        filename,
        elapsed,
        label: `Text → ${typedFormat.toUpperCase()}`,
      };
      setTextResult(r);
      setHistory((h) => [r, ...h].slice(0, 8));
      setTextStage("done");
    } catch (e) {
      setTextError(e instanceof Error ? e.message : "Text conversion failed");
      setTextStage("error");
    }
  };

  const busy = stage === "detecting" || stage === "converting";
  const activeConv = convId ? convMap[convId] : null;
  const isPdfOutput = activeConv?.output_ext === "pdf" || activeConv?.id?.endsWith("_to_pdf");

  // Word & character counts for typed text
  const charCount = typedText.length;
  const wordCount = typedText.trim() ? typedText.trim().split(/\s+/).length : 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      {/* ── Nav Header ── */}
      <header className="bg-white border-b px-6 py-4 flex items-center gap-3 sticky top-0 z-30 shadow-xs">
        <div className="w-8 h-8 rounded-lg bg-black text-white grid place-items-center font-bold text-sm select-none">
          AC
        </div>
        <div>
          <span className="font-bold text-[15px] block leading-tight">Anything Convertable</span>
          <span className="text-[11px] text-slate-400 font-medium">Highest Accuracy · TrueType Fonts · Searchable / Flat PDF</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium hidden sm:inline-block">
            7 Converters Active
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 space-y-7">
        {/* ── Hero ── */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-1">
            <Sparkles size={13} /> Studio-Grade Document Conversion
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight text-slate-900">
            High Accuracy Document Converter
          </h1>
          <p className="text-slate-500 text-sm max-w-lg mx-auto">
            Upload files or type directly to convert between Word, PDF, PPTX, and Images with perfect font rendering &amp; Hindi Unicode support.
          </p>
        </div>

        {/* ── Mode Tabs Switcher ── */}
        <div className="flex bg-slate-200/80 p-1 rounded-xl max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setActiveTab("file")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "file"
                ? "bg-white text-black shadow-xs"
                : "text-slate-600 hover:text-black"
            }`}
          >
            <UploadCloud size={16} /> File Converter
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("text")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "text"
                ? "bg-white text-black shadow-xs"
                : "text-slate-600 hover:text-black"
            }`}
          >
            <Type size={16} /> Type to Word / PDF
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 1: FILE CONVERTER
           ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "file" && (
          <div className="space-y-6">
            {/* ── 7 conversion tiles ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {TILES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onTileClick(t.id, t.accepts)}
                  disabled={busy}
                  className="group bg-white border border-slate-200 rounded-xl p-4 text-left
                             hover:border-black hover:shadow-sm transition-all disabled:opacity-40
                             active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2 text-xl mb-2">
                    <span>{t.icon}</span>
                    <ArrowRight size={14} className="text-slate-300 group-hover:text-black transition-colors" />
                    <span>{t.arrow}</span>
                  </div>
                  <p className="font-semibold text-xs sm:text-sm text-slate-800">{t.title}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{t.subtitle}</p>
                </button>
              ))}
            </div>

            {/* ── Hidden file picker for tiles ── */}
            <input
              ref={hiddenInput}
              type="file"
              hidden
              accept={pendingAccepts}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onTileFile(f);
                e.target.value = "";
              }}
            />

            {/* ── Drop zone (auto-detect) ── */}
            {stage === "idle" && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => dropInput.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-slate-500
                           rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer
                           transition-colors bg-white shadow-2xs"
              >
                <UploadCloud size={34} className="text-slate-400" />
                <div className="text-center">
                  <p className="font-semibold text-sm text-slate-800">Drag &amp; drop any file here, or click to browse</p>
                  <p className="text-xs text-slate-400 mt-1">
                    PNG · JPG · JPEG · PDF · DOCX · PPTX · TXT — up to 100 MB
                  </p>
                </div>
                <input
                  ref={dropInput}
                  type="file"
                  hidden
                  accept=".png,.jpg,.jpeg,.pdf,.docx,.pptx,.txt"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleDropFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
            )}

            {/* ── Detecting / Converting spinner ── */}
            {(stage === "detecting" || stage === "converting") && (
              <div className="bg-white rounded-2xl border p-8 flex flex-col items-center gap-4 shadow-xs">
                <Loader2 size={32} className="animate-spin text-slate-700" />
                <div className="text-center">
                  <p className="font-semibold text-sm text-slate-800">
                    {stage === "detecting" ? "Detecting file format…" : "Converting document with maximum accuracy…"}
                  </p>
                  {stage === "converting" && file && (
                    <p className="text-xs text-slate-400 mt-1">{file.name}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    {stage === "converting"
                      ? "Resolving TrueType fonts, high-res images & layout structure…"
                      : "Inspecting magic bytes…"}
                  </p>
                </div>
              </div>
            )}

            {/* ── Ready state: options picker & convert ── */}
            {stage === "ready" && file && available.length > 0 && (
              <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                {/* File summary header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b bg-slate-50">
                  <div className="w-8 h-8 rounded-lg bg-slate-200 grid place-items-center text-lg shrink-0">
                    {FORMAT_ICON[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "📄"}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate text-slate-800">{file.name}</p>
                    <p className="text-xs text-slate-400">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    onClick={resetFileMode}
                    className="ml-auto text-xs text-slate-500 hover:text-black flex items-center gap-1 font-medium"
                  >
                    <RefreshCw size={13} /> Change File
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {/* Output format picker */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">
                      Target Conversion
                    </p>
                    <div className="space-y-2">
                      {available.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setConvId(c.id)}
                          className={`w-full text-left flex items-center gap-3 px-4 py-3
                            rounded-xl border transition-all
                            ${convId === c.id
                              ? "border-black bg-slate-950 text-white shadow-xs"
                              : "border-slate-200 hover:border-slate-400 bg-white text-slate-800"
                            }`}
                        >
                          <span className="text-xl shrink-0">
                            {FORMAT_ICON[c.output_ext] ?? "📄"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`font-semibold text-sm ${convId === c.id ? "text-white" : "text-slate-900"}`}>
                              {c.label}
                            </p>
                            <p className={`text-xs mt-0.5 ${convId === c.id ? "text-slate-300" : "text-slate-500"}`}>
                              {c.description}
                            </p>
                          </div>
                          {convId === c.id && (
                            <CheckCircle2 size={18} className="text-white shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Customization (for converters supporting font choices) */}
                  {(activeConv?.supports_font_choice || convId === "pdf_to_word" || convId === "pdf_to_ppt" || convId === "word_to_pdf" || convId === "ppt_to_pdf" || convId === "text_to_word" || convId === "text_to_pdf") && (
                    <div className="pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                          <Type size={14} /> Document Font Engine
                        </label>
                        <span className="text-[11px] text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded-full">
                          Full Hindi/Devanagari Unicode
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {FILE_FONT_OPTIONS.map((f) => {
                          const isSelected = selectedFont === f.id;
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setSelectedFont(f.id)}
                              className={`text-left p-3 rounded-xl border transition-all flex flex-col justify-between ${
                                isSelected
                                  ? "border-black bg-slate-900 text-white shadow-xs"
                                  : "border-slate-200 hover:border-slate-400 bg-slate-50 text-slate-700"
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className={`font-semibold text-xs ${isSelected ? "text-white" : "text-slate-900"}`}>
                                  {f.label}
                                </span>
                                {isSelected && <CheckCircle2 size={14} className="text-white shrink-0 ml-1" />}
                              </div>
                              <span className={`text-[11px] mt-0.5 ${isSelected ? "text-slate-300" : "text-slate-400"}`}>
                                {f.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Searchable vs Non-Searchable PDF Toggle (if output is PDF) */}
                  {(isPdfOutput || activeConv?.supports_searchable_option) && (
                    <div className="pt-3 border-t border-slate-100">
                      <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                        <Shield size={14} /> PDF Text &amp; Security Mode
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSearchablePdf(true)}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            searchablePdf
                              ? "border-black bg-slate-900 text-white shadow-xs"
                              : "border-slate-200 hover:border-slate-400 bg-slate-50 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`font-semibold text-xs ${searchablePdf ? "text-white" : "text-slate-900"}`}>
                              Searchable PDF (Vector Text)
                            </span>
                            {searchablePdf && <CheckCircle2 size={14} className="text-white shrink-0" />}
                          </div>
                          <p className={`text-[11px] mt-1 ${searchablePdf ? "text-slate-300" : "text-slate-400"}`}>
                            Normal selectable vector text. Allows copy, search &amp; indexing.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSearchablePdf(false)}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            !searchablePdf
                              ? "border-black bg-slate-900 text-white shadow-xs"
                              : "border-slate-200 hover:border-slate-400 bg-slate-50 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`font-semibold text-xs ${!searchablePdf ? "text-white" : "text-slate-900"}`}>
                              Non-Searchable PDF (Flat 300 DPI)
                            </span>
                            {!searchablePdf && <CheckCircle2 size={14} className="text-white shrink-0" />}
                          </div>
                          <p className={`text-[11px] mt-1 ${!searchablePdf ? "text-slate-300" : "text-slate-400"}`}>
                            Flattened high-res raster pages. Uncopyable &amp; bot-tamper resistant.
                          </p>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-5 pb-5">
                  <button
                    onClick={runConversion}
                    disabled={!convId}
                    className="w-full py-3.5 rounded-xl bg-black text-white font-semibold
                               text-sm flex items-center justify-center gap-2
                               disabled:opacity-40 hover:bg-slate-800 transition-colors shadow-xs"
                  >
                    Convert File Now <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* ── Done state ── */}
            {stage === "done" && result && (
              <div className="bg-white rounded-2xl border shadow-sm p-8 flex flex-col items-center gap-5 text-center">
                <div className="w-14 h-14 rounded-full bg-green-100 grid place-items-center">
                  <CheckCircle2 size={28} className="text-green-600" />
                </div>
                <div>
                  <p className="font-bold text-xl text-slate-900">Conversion Successful!</p>
                  <p className="text-slate-600 text-sm mt-1">{result.label}</p>
                  <p className="text-slate-400 text-xs mt-1">
                    {result.filename} · {(result.blob.size / 1024).toFixed(1)} KB
                  </p>
                  {result.elapsed !== "?" && (
                    <p className="text-slate-400 text-xs flex items-center justify-center gap-1 mt-1">
                      <Clock size={11} /> Converted in {result.elapsed}s
                    </p>
                  )}
                </div>
                <div className="flex gap-3 flex-wrap justify-center">
                  <button
                    onClick={() => triggerDownload(result.blob, result.filename)}
                    className="px-7 py-2.5 bg-black text-white rounded-xl font-semibold
                               text-sm flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-xs"
                  >
                    <Download size={16} /> Download File
                  </button>
                  <button
                    onClick={resetFileMode}
                    className="px-5 py-2.5 border rounded-xl text-sm flex items-center gap-2
                               hover:bg-slate-50 transition-colors font-medium text-slate-700"
                  >
                    <RefreshCw size={14} /> Convert Another File
                  </button>
                </div>
              </div>
            )}

            {/* ── Error state ── */}
            {stage === "error" && (
              <div className="bg-white rounded-2xl border border-red-200 p-6 flex flex-col items-center gap-4 text-center">
                <div className="w-12 h-12 rounded-full bg-red-100 grid place-items-center">
                  <AlertCircle size={24} className="text-red-500" />
                </div>
                <div>
                  <p className="font-semibold text-red-700">Conversion failed</p>
                  <p className="text-xs text-red-500 mt-1 max-w-sm">{error}</p>
                </div>
                <button
                  onClick={resetFileMode}
                  className="px-5 py-2 border rounded-xl text-sm flex items-center gap-2
                             hover:bg-slate-50 transition-colors font-medium"
                >
                  <RefreshCw size={14} /> Try again
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 2: TYPE TO WORD / PDF CONVERTER
           ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "text" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b">
              <div>
                <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <FileText size={18} className="text-blue-600" /> Type or Paste Document Text
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Type your content directly. Outputs a professionally styled Word (.docx) or PDF document.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTypedText(SAMPLE_TEXT)}
                  className="text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                >
                  Load Sample
                </button>
                {typedText && (
                  <button
                    type="button"
                    onClick={() => setTypedText("")}
                    className="text-xs text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                    title="Clear text"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Typography & Format Control Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
              {/* Target Format */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Output Format
                </label>
                <div className="flex rounded-lg border border-slate-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setTypedFormat("docx")}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all ${
                      typedFormat === "docx"
                        ? "bg-blue-600 text-white shadow-2xs"
                        : "text-slate-600 hover:text-black"
                    }`}
                  >
                    <span>📝</span> Word (.docx)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypedFormat("pdf")}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all ${
                      typedFormat === "pdf"
                        ? "bg-blue-600 text-white shadow-2xs"
                        : "text-slate-600 hover:text-black"
                    }`}
                  >
                    <span>📕</span> PDF (.pdf)
                  </button>
                </div>
              </div>

              {/* Font Family */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Font Family
                </label>
                <select
                  value={typedFont}
                  onChange={(e) => setTypedFont(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-black"
                >
                  {TYPED_FONT_OPTIONS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label} ({f.description})
                    </option>
                  ))}
                </select>
              </div>

              {/* Font Size */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Font Size
                </label>
                <select
                  value={typedFontSize}
                  onChange={(e) => setTypedFontSize(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-black"
                >
                  <option value={10}>10 pt (Compact)</option>
                  <option value={11}>11 pt (Standard Modern)</option>
                  <option value={12}>12 pt (Standard Academic)</option>
                  <option value={14}>14 pt (Large Print)</option>
                  <option value={16}>16 pt (Headlines / Prominent)</option>
                </select>
              </div>
            </div>

            {/* If PDF selected in Typed Mode: Searchable toggle */}
            {typedFormat === "pdf" && (
              <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-blue-700" />
                  <div>
                    <span className="text-xs font-bold text-blue-900 block">PDF Output Mode</span>
                    <span className="text-[11px] text-blue-700">
                      {typedSearchable
                        ? "Searchable vector PDF (selectable text & small size)"
                        : "Non-searchable 300 DPI flat raster PDF (tamper-proof image)"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-blue-200">
                  <button
                    type="button"
                    onClick={() => setTypedSearchable(true)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      typedSearchable ? "bg-blue-600 text-white shadow-2xs" : "text-blue-800"
                    }`}
                  >
                    Searchable
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypedSearchable(false)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      !typedSearchable ? "bg-blue-600 text-white shadow-2xs" : "text-blue-800"
                    }`}
                  >
                    Non-Searchable
                  </button>
                </div>
              </div>
            )}

            {/* Live Textarea */}
            <div className="relative">
              <textarea
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="Type or paste your text here (supports English, Hindi / हिन्दी, numbers, symbols, lists)..."
                rows={12}
                className="w-full p-4 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:border-black focus:ring-1 focus:ring-black placeholder:text-slate-400 font-sans leading-relaxed resize-y"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5 px-1">
                <span>{wordCount} words · {charCount} characters</span>
                <span className="text-blue-600 font-medium">Automatic Devanagari ligature pairing active</span>
              </div>
            </div>

            {textError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
                <AlertCircle size={15} /> {textError}
              </div>
            )}

            {/* Action button */}
            <button
              type="button"
              onClick={runTextConversion}
              disabled={textStage === "converting" || !typedText.trim()}
              className="w-full py-3.5 rounded-xl bg-black text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-slate-800 transition-all shadow-xs"
            >
              {textStage === "converting" ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Generating Document…
                </>
              ) : (
                <>
                  Convert &amp; Download {typedFormat === "docx" ? "Word (.docx)" : "PDF (.pdf)"}{" "}
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            {/* Text conversion done banner */}
            {textStage === "done" && textResult && (
              <div className="p-5 bg-green-50/80 border border-green-200 rounded-xl flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 grid place-items-center text-green-700">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-green-950">Document Created Successfully!</p>
                    <p className="text-xs text-green-800 mt-0.5">
                      {textResult.filename} · {(textResult.blob.size / 1024).toFixed(1)} KB · {textResult.elapsed}s
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => triggerDownload(textResult.blob, textResult.filename)}
                  className="px-5 py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-lg font-semibold text-xs flex items-center gap-2 transition-colors shadow-2xs"
                >
                  <Download size={14} /> Download Again
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Conversion History (Persists across both tabs) ── */}
        {history.length > 0 && (
          <div className="bg-white rounded-2xl border p-5 shadow-xs">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Recent Conversions
            </p>
            <div className="divide-y divide-slate-100">
              {history.map((h, i) => (
                <div key={i} className="py-2.5 flex items-center gap-3">
                  <span className="text-xl shrink-0">
                    {FORMAT_ICON[h.filename.split(".").pop() ?? ""] ?? "📄"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium truncate text-slate-800">{h.filename}</p>
                    <p className="text-[11px] text-slate-400">
                      {h.label} · {(h.blob.size / 1024).toFixed(1)} KB
                      {h.elapsed !== "?" && ` · ${h.elapsed}s`}
                    </p>
                  </div>
                  <button
                    onClick={() => triggerDownload(h.blob, h.filename)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0"
                    title="Download again"
                  >
                    <Download size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="text-center text-xs text-slate-400 py-6 border-t bg-white mt-auto">
        Anything Convertable · Image→PDF · Word→PDF · PDF→Word · PPT→PDF · PDF→PPT · Text→Word · Text→PDF
      </footer>
    </div>
  );
}
