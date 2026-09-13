"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import {
  ACCEPTS_LABEL,
  API,
  ConversionInfo,
  FORMAT_ICON,
  convertFile,
  detectFile,
  listConversions,
} from "../lib/api";

// ── types ─────────────────────────────────────────────────────────────────────
type Stage = "idle" | "detecting" | "ready" | "converting" | "done" | "error";

interface Result {
  blob: Blob;
  filename: string;
  elapsed: string;
  label: string;
}

// ── The 5 conversions shown on the homepage tiles ─────────────────────────────
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
    subtitle: "DOCX",
    accepts: ".docx",
  },
  {
    id: "pdf_to_word",
    icon: "📕",
    arrow: "📝",
    title: "PDF → Word",
    subtitle: "PDF",
    accepts: ".pdf",
  },
  {
    id: "ppt_to_pdf",
    icon: "📽️",
    arrow: "📕",
    title: "PowerPoint → PDF",
    subtitle: "PPTX",
    accepts: ".pptx",
  },
  {
    id: "pdf_to_ppt",
    icon: "📕",
    arrow: "📽️",
    title: "PDF → PowerPoint",
    subtitle: "PDF",
    accepts: ".pdf",
  },
];

// ── helpers ───────────────────────────────────────────────────────────────────
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

// ── main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [stage, setStage]         = useState<Stage>("idle");
  const [error, setError]         = useState("");
  const [file, setFile]           = useState<File | null>(null);
  const [convId, setConvId]       = useState<string | null>(null);
  const [available, setAvailable] = useState<ConversionInfo[]>([]);
  const [result, setResult]       = useState<Result | null>(null);
  const [history, setHistory]     = useState<Result[]>([]);
  const [allConversions, setAllConversions] = useState<ConversionInfo[]>([]);

  // Load full conversion list once (for labels)
  useEffect(() => {
    listConversions().then(setAllConversions).catch(() => {});
  }, []);

  const convMap = Object.fromEntries(allConversions.map((c) => [c.id, c]));

  // ── tile click: open file picker pre-filtered ──────────────────────────────
  const hiddenInput = useRef<HTMLInputElement>(null);
  const [pendingTileId, setPendingTileId] = useState<string | null>(null);
  const [pendingAccepts, setPendingAccepts] = useState("");

  const onTileClick = (id: string, accepts: string) => {
    setPendingTileId(id);
    setPendingAccepts(accepts);
    // small delay so state updates before click
    setTimeout(() => hiddenInput.current?.click(), 0);
  };

  // ── file chosen from tile click (single-conversion shortcut) ──────────────
  const onTileFile = useCallback(
    async (f: File) => {
      if (!pendingTileId) return;
      setFile(f);
      setConvId(pendingTileId);
      setError("");
      setResult(null);
      setStage("converting");
      try {
        const { blob, filename, elapsed } = await convertFile(f, pendingTileId);
        const r: Result = {
          blob,
          filename,
          elapsed,
          label: convMap[pendingTileId]?.label ?? pendingTileId,
        };
        setResult(r);
        setHistory((h) => [r, ...h].slice(0, 8));
        setStage("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Conversion failed");
        setStage("error");
      }
    },
    [pendingTileId, convMap],
  );

  // ── drop-zone (auto-detect mode) ──────────────────────────────────────────
  const dropRef = useRef<HTMLDivElement>(null);
  const dropInput = useRef<HTMLInputElement>(null);

  const handleDropFile = useCallback(async (f: File) => {
    setFile(f);
    setConvId(null);
    setError("");
    setResult(null);
    setAvailable([]);
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

  // ── run conversion from auto-detect panel ─────────────────────────────────
  const runConversion = useCallback(async () => {
    if (!file || !convId) return;
    setStage("converting");
    setError("");
    try {
      const { blob, filename, elapsed } = await convertFile(file, convId);
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
  }, [file, convId, convMap]);

  const reset = () => {
    setStage("idle");
    setFile(null);
    setConvId(null);
    setAvailable([]);
    setResult(null);
    setError("");
  };

  const busy = stage === "detecting" || stage === "converting";

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Nav ── */}
      <header className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-black text-white grid place-items-center font-bold text-sm select-none">
          AC
        </div>
        <span className="font-bold text-[15px]">Anything Convertable</span>
        <span className="ml-auto text-xs text-slate-400 hidden sm:block">
          5 conversions · accuracy-first · 5–20 sec
        </span>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-10 space-y-8">

        {/* ── Hero ── */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
            Convert any document,<br className="hidden sm:block" /> accurately.
          </h1>
          <p className="text-slate-500 text-sm">
            Click a conversion below — or drag &amp; drop any file.
          </p>
        </div>

        {/* ── 5 conversion tiles ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TILES.map((t) => (
            <button
              key={t.id}
              onClick={() => onTileClick(t.id, t.accepts)}
              disabled={busy}
              className="group bg-white border border-slate-200 rounded-2xl p-5 text-left
                         hover:border-black hover:shadow-md transition-all disabled:opacity-40
                         active:scale-[0.98]"
            >
              <div className="flex items-center gap-2 text-2xl mb-3">
                <span>{t.icon}</span>
                <ArrowRight size={16} className="text-slate-300 group-hover:text-black transition-colors" />
                <span>{t.arrow}</span>
              </div>
              <p className="font-semibold text-sm">{t.title}</p>
              <p className="text-xs text-slate-400 mt-0.5">{t.subtitle}</p>
            </button>
          ))}
        </div>

        {/* ── hidden file inputs ── */}
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
            ref={dropRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => dropInput.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-slate-500
                       rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer
                       transition-colors bg-white"
          >
            <UploadCloud size={32} className="text-slate-400" />
            <div className="text-center">
              <p className="font-medium text-sm">Or drag &amp; drop — we'll detect the format</p>
              <p className="text-xs text-slate-400 mt-1">
                PNG · JPG · JPEG · PDF · DOCX · PPTX — up to 100 MB
              </p>
            </div>
            <input
              ref={dropInput}
              type="file"
              hidden
              accept=".png,.jpg,.jpeg,.pdf,.docx,.pptx"
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
          <div className="bg-white rounded-2xl border p-8 flex flex-col items-center gap-4">
            <Loader2 size={32} className="animate-spin text-slate-500" />
            <div className="text-center">
              <p className="font-semibold text-sm">
                {stage === "detecting" ? "Detecting file type…" : "Converting…"}
              </p>
              {stage === "converting" && file && (
                <p className="text-xs text-slate-400 mt-1">{file.name}</p>
              )}
              <p className="text-xs text-slate-400 mt-1">
                {stage === "converting"
                  ? "Typically 5–20 seconds depending on file size."
                  : "Reading file header…"}
              </p>
            </div>
          </div>
        )}

        {/* ── Ready: auto-detect result — pick conversion & convert ── */}
        {stage === "ready" && file && available.length > 0 && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            {/* file strip */}
            <div className="flex items-center gap-3 px-5 py-4 border-b bg-slate-50">
              <div className="w-8 h-8 rounded-lg bg-slate-200 grid place-items-center text-lg shrink-0">
                {FORMAT_ICON[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "📄"}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{file.name}</p>
                <p className="text-xs text-slate-400">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <button
                onClick={reset}
                className="ml-auto text-xs text-slate-400 hover:text-black flex items-center gap-1"
              >
                <RefreshCw size={13} /> Change
              </button>
            </div>

            {/* conversion picker */}
            <div className="p-5 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Choose output format
              </p>
              {available.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setConvId(c.id)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3
                    rounded-xl border transition-all
                    ${convId === c.id
                      ? "border-black bg-black text-white"
                      : "border-slate-200 hover:border-slate-400 bg-white"
                    }`}
                >
                  <span className="text-xl shrink-0">
                    {FORMAT_ICON[c.output_ext] ?? "📄"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold text-sm ${convId === c.id ? "text-white" : ""}`}>
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

            <div className="px-5 pb-5">
              <button
                onClick={runConversion}
                disabled={!convId}
                className="w-full py-3 rounded-xl bg-black text-white font-semibold
                           text-sm flex items-center justify-center gap-2
                           disabled:opacity-40 hover:bg-slate-800 transition-colors"
              >
                Convert <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {stage === "done" && result && (
          <div className="bg-white rounded-2xl border shadow-sm p-8 flex flex-col items-center gap-5 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 grid place-items-center">
              <CheckCircle2 size={28} className="text-green-600" />
            </div>
            <div>
              <p className="font-bold text-xl">Done!</p>
              <p className="text-slate-600 text-sm mt-1">{result.label}</p>
              <p className="text-slate-400 text-xs mt-1">
                {result.filename} · {(result.blob.size / 1024).toFixed(1)} KB
              </p>
              {result.elapsed !== "?" && (
                <p className="text-slate-400 text-xs flex items-center justify-center gap-1 mt-1">
                  <Clock size={11} /> {result.elapsed}s
                </p>
              )}
            </div>
            <div className="flex gap-3 flex-wrap justify-center">
              <button
                onClick={() => triggerDownload(result.blob, result.filename)}
                className="px-7 py-2.5 bg-black text-white rounded-xl font-semibold
                           text-sm flex items-center gap-2 hover:bg-slate-800 transition-colors"
              >
                <Download size={16} /> Download
              </button>
              <button
                onClick={reset}
                className="px-5 py-2.5 border rounded-xl text-sm flex items-center gap-2
                           hover:bg-slate-50 transition-colors"
              >
                <RefreshCw size={14} /> Convert another
              </button>
            </div>
          </div>
        )}

        {/* ── Error ── */}
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
              onClick={reset}
              className="px-5 py-2 border rounded-xl text-sm flex items-center gap-2
                         hover:bg-slate-50 transition-colors"
            >
              <RefreshCw size={14} /> Try again
            </button>
          </div>
        )}

        {/* ── History ── */}
        {history.length > 0 && stage === "idle" && (
          <div className="bg-white rounded-2xl border p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Recent
            </p>
            <div className="divide-y">
              {history.map((h, i) => (
                <div key={i} className="py-3 flex items-center gap-3">
                  <span className="text-xl shrink-0">
                    {FORMAT_ICON[h.filename.split(".").pop() ?? ""] ?? "📄"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{h.filename}</p>
                    <p className="text-xs text-slate-400">
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

      <footer className="text-center text-xs text-slate-400 py-6 border-t bg-white">
        Anything Convertable · Image→PDF · Word→PDF · PDF→Word · PPT→PDF · PDF→PPT
      </footer>
    </div>
  );
}
