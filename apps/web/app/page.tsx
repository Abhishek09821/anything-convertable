'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  UploadCloud,
  Zap,
} from 'lucide-react';
import {
  ConversionMeta,
  DetectResponse,
  DOC_TYPE_LABELS,
  OUTPUT_ICONS,
  convertFile,
  detectFile,
  fetchConversions,
} from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Stage =
  | 'idle'
  | 'uploading'
  | 'detecting'
  | 'detected'
  | 'converting'
  | 'done'
  | 'error';

interface ConversionResult {
  blob: Blob;
  filename: string;
  conversionId: string;
  convertedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [stage, setStage] = useState<Stage>('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [detect, setDetect] = useState<DetectResponse | null>(null);
  const [conversions, setConversions] = useState<ConversionMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [history, setHistory] = useState<ConversionResult[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Load conversion list once
  useEffect(() => {
    fetchConversions()
      .then(setConversions)
      .catch(() => {/* will surface on convert attempt */});
  }, []);

  // ── File selection ──────────────────────────────────────────────────────────
  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setResult(null);
    setDetect(null);
    setSelectedId(null);
    setErrorMsg('');
    setStage('detecting');
    setProgressMsg('Analysing document…');
    try {
      const d = await detectFile(f);
      setDetect(d);
      setSelectedId(d.suggested_conversions[0] ?? null);
      setStage('detected');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Detection failed');
      setStage('error');
    }
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  // ── Drag-and-drop ───────────────────────────────────────────────────────────
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  // ── Convert ─────────────────────────────────────────────────────────────────
  const runConversion = useCallback(async () => {
    if (!file || !selectedId) return;
    setStage('converting');
    setErrorMsg('');
    try {
      const { blob, filename } = await convertFile(file, selectedId, setProgressMsg);
      const res: ConversionResult = {
        blob,
        filename,
        conversionId: selectedId,
        convertedAt: new Date(),
      };
      setResult(res);
      setHistory((h) => [res, ...h].slice(0, 10));
      setStage('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Conversion failed');
      setStage('error');
    }
  }, [file, selectedId]);

  // ── Download ────────────────────────────────────────────────────────────────
  const download = (res: ConversionResult) => {
    const url = URL.createObjectURL(res.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const reset = () => {
    setStage('idle');
    setFile(null);
    setDetect(null);
    setSelectedId(null);
    setResult(null);
    setErrorMsg('');
    setProgressMsg('');
  };

  const convMap = Object.fromEntries(conversions.map((c) => [c.id, c]));
  const busy = stage === 'detecting' || stage === 'uploading' || stage === 'converting';

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Nav ── */}
      <nav className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-black text-white grid place-items-center text-sm font-bold">
          AE
        </div>
        <span className="font-bold text-base">Anything Editable</span>
        <span className="ml-auto text-xs text-slate-400">
          AI Document Converter
        </span>
      </nav>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10 space-y-6">

        {/* ── Hero ── */}
        {stage === 'idle' && (
          <div className="text-center space-y-2 mb-2">
            <div className="inline-flex items-center gap-1.5 text-xs bg-slate-100 px-3 py-1 rounded-full text-slate-600">
              <Zap size={12} /> Accuracy-first · OCR + layout + structure
            </div>
            <h1 className="text-4xl font-black tracking-tight">
              Convert documents others&nbsp;can't.
            </h1>
            <p className="text-slate-500 max-w-xl mx-auto text-sm leading-relaxed">
              PDF → DOCX/XLSX/PPTX · Scans → searchable PDF · Invoices → structured data ·
              Resumes → DOCX · Screenshots → HTML/CSS
            </p>
          </div>
        )}

        {/* ── Drop zone ── */}
        {(stage === 'idle' || stage === 'error') && (
          <div
            ref={dropRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-black
                       bg-white rounded-2xl p-12 flex flex-col items-center gap-4
                       cursor-pointer transition-colors"
          >
            <div className="w-14 h-14 rounded-2xl bg-slate-100 grid place-items-center">
              <UploadCloud size={28} className="text-slate-500" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-base">Drop a file or click to browse</p>
              <p className="text-sm text-slate-400 mt-1">
                PDF · JPG · PNG · WEBP — up to 50 MB
              </p>
            </div>
            {stage === 'error' && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-2 rounded-lg">
                <AlertTriangle size={15} />
                {errorMsg}
              </div>
            )}
            <input
              ref={inputRef}
              hidden
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={onInputChange}
            />
          </div>
        )}

        {/* ── Detecting spinner ── */}
        {stage === 'detecting' && (
          <StatusCard icon={<Loader2 size={22} className="animate-spin" />} label="Analysing document…" />
        )}

        {/* ── Detected + conversion picker ── */}
        {(stage === 'detected' || stage === 'converting' || stage === 'done') && detect && file && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            {/* File info bar */}
            <div className="flex items-center gap-3 px-5 py-4 border-b bg-slate-50">
              <FileText size={18} className="text-slate-500 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{file.name}</p>
                <p className="text-xs text-slate-400">
                  {DOC_TYPE_LABELS[detect.doc_type] ?? detect.doc_type}
                  {detect.page_count > 0 && ` · ${detect.page_count} page${detect.page_count > 1 ? 's' : ''}`}
                  {detect.has_tables && ' · tables detected'}
                  {detect.text_length > 0 && ` · ${detect.text_length.toLocaleString()} chars`}
                </p>
              </div>
              <button
                onClick={reset}
                className="ml-auto text-xs text-slate-400 hover:text-black flex items-center gap-1"
              >
                <RefreshCw size={13} /> New file
              </button>
            </div>

            {/* Warnings */}
            {detect.warnings.length > 0 && (
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex gap-2 text-xs text-amber-700">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{detect.warnings.join(' · ')}</span>
              </div>
            )}

            {/* Conversion grid */}
            <div className="p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Choose conversion
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {_orderedConversions(detect, conversions).map((c) => (
                  <ConversionCard
                    key={c.id}
                    meta={c}
                    selected={selectedId === c.id}
                    onClick={() => setSelectedId(c.id)}
                    suggested={detect.suggested_conversions.includes(c.id)}
                  />
                ))}
              </div>
            </div>

            {/* Convert button */}
            {stage !== 'done' && (
              <div className="px-5 pb-5">
                <button
                  onClick={runConversion}
                  disabled={!selectedId || busy}
                  className="w-full py-3 rounded-xl bg-black text-white font-semibold
                             disabled:opacity-40 flex items-center justify-center gap-2 text-sm"
                >
                  {stage === 'converting' ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {progressMsg || 'Converting…'}
                    </>
                  ) : (
                    <>
                      Convert
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Error after detect */}
            {errorMsg && stage !== 'done' && stage !== 'converting' && (
              <div className="px-5 pb-5">
                <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  {errorMsg}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Done / Download ── */}
        {stage === 'done' && result && (
          <div className="bg-white rounded-2xl border shadow-sm p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 grid place-items-center">
              <CheckCircle2 size={24} className="text-green-600" />
            </div>
            <div>
              <p className="font-bold text-lg">Conversion complete</p>
              <p className="text-sm text-slate-500 mt-1">{result.filename}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {(result.blob.size / 1024).toFixed(1)} KB ·{' '}
                {convMap[result.conversionId]?.label}
              </p>
            </div>
            <div className="flex gap-3 flex-wrap justify-center">
              <button
                onClick={() => download(result)}
                className="px-6 py-2.5 bg-black text-white rounded-xl font-semibold
                           flex items-center gap-2 text-sm"
              >
                <Download size={16} />
                Download
              </button>
              <button
                onClick={reset}
                className="px-6 py-2.5 border rounded-xl text-sm hover:bg-slate-50
                           flex items-center gap-2"
              >
                <RefreshCw size={14} />
                Convert another
              </button>
            </div>
          </div>
        )}

        {/* ── What this can do ── */}
        {stage === 'idle' && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {FEATURE_CARDS.map((f) => (
              <div key={f.title} className="bg-white rounded-2xl border p-4">
                <div className="text-2xl mb-2">{f.icon}</div>
                <p className="font-semibold text-sm">{f.title}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── History ── */}
        {history.length > 0 && stage === 'idle' && (
          <div className="bg-white rounded-2xl border p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Recent conversions
            </p>
            <div className="divide-y">
              {history.map((h, i) => (
                <div key={i} className="py-2.5 flex items-center gap-3">
                  <span className="text-xl">{OUTPUT_ICONS[h.filename.split('.').pop() ?? ''] ?? '📄'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{h.filename}</p>
                    <p className="text-xs text-slate-400">
                      {convMap[h.conversionId]?.label ?? h.conversionId} ·{' '}
                      {h.convertedAt.toLocaleTimeString()}
                    </p>
                  </div>
                  <button
                    onClick={() => download(h)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
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

      <footer className="text-center text-xs text-slate-400 py-6 border-t">
        Anything Editable · accuracy-first document conversion
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatusCard({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="bg-white rounded-2xl border p-8 flex items-center justify-center gap-3 text-slate-600">
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

function ConversionCard({
  meta,
  selected,
  suggested,
  onClick,
}: {
  meta: ConversionMeta;
  selected: boolean;
  suggested: boolean;
  onClick: () => void;
}) {
  const icon = OUTPUT_ICONS[meta.output_ext] ?? '📄';
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border px-4 py-3 transition-all flex items-start gap-3
        ${selected
          ? 'border-black bg-black text-white'
          : 'border-slate-200 hover:border-slate-400 bg-white'
        }`}
    >
      <span className="text-xl mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-semibold truncate ${selected ? 'text-white' : ''}`}>
            {meta.label}
          </span>
          {suggested && !selected && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">
              suggested
            </span>
          )}
        </div>
        <p className={`text-xs mt-0.5 leading-relaxed line-clamp-2
          ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
          {meta.description}
        </p>
      </div>
      <ChevronRight
        size={15}
        className={`shrink-0 mt-1 ${selected ? 'text-slate-300' : 'text-slate-300'}`}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Return conversions in order: suggested first, then the rest. */
function _orderedConversions(
  detect: DetectResponse,
  all: ConversionMeta[],
): ConversionMeta[] {
  const suggested = detect.suggested_conversions;
  const suggestedSet = new Set(suggested);
  const suggestedMeta = suggested
    .map((id) => all.find((c) => c.id === id))
    .filter(Boolean) as ConversionMeta[];
  const rest = all.filter((c) => !suggestedSet.has(c.id));
  return [...suggestedMeta, ...rest];
}

// ─────────────────────────────────────────────────────────────────────────────
// Static feature card data
// ─────────────────────────────────────────────────────────────────────────────

const FEATURE_CARDS = [
  {
    icon: '📕',
    title: 'PDF → DOCX / XLSX / PPTX',
    body: 'Native text extraction + table detection. Falls back to OCR for scanned pages.',
  },
  {
    icon: '🧾',
    title: 'Invoice → Structured Data',
    body: 'Extracts vendor, items, GST, dates and totals into XLSX, JSON or CSV.',
  },
  {
    icon: '📄',
    title: 'Resume → DOCX',
    body: 'Preserves sections, dates, skills and experience from any resume format.',
  },
  {
    icon: '🔍',
    title: 'Scan → Searchable PDF',
    body: 'Adds invisible OCR text layer while keeping the original visual exactly.',
  },
  {
    icon: '🌐',
    title: 'Screenshot → HTML/CSS',
    body: 'Reconstructs layout into real positioned HTML — not a single background image.',
  },
  {
    icon: '🌏',
    title: 'Multilingual OCR',
    body: 'Handles Hindi + English mixed text. Tesseract eng+hin language pack.',
  },
];
