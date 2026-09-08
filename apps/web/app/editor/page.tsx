'use client';
/**
 * Editor page — full AEDOM-backed document editor.
 *
 * Features:
 *  - Loads AEDOM from sessionStorage (set by upload page) or localStorage (persistence)
 *  - Canvas renders all element types via KonvaCanvas
 *  - Toolbar: bold, italic, color picker, font-size, add shape, delete
 *  - Properties panel: live text edit, position/size fields, confidence badge
 *  - AI edit: sends command + selected element id to /v1/edit
 *  - Export: PDF / DOCX / HTML / SVG via /v1/export
 *  - Undo / redo (30-step history)
 *  - localStorage autosave so refresh doesn't blank the canvas
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle, ArrowLeft, Bold, Download, Italic,
  MousePointer2, Redo2, Square, Trash2, Type, Undo2,
  Sparkles, Image as ImageIcon, AlignLeft, AlignCenter, AlignRight,
  ZoomIn, ZoomOut,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { AedomElement, AedomPage } from './KonvaCanvas';

// ── Types ─────────────────────────────────────────────────────────────────────
type Doc = {
  schemaVersion: string;
  id: string;
  title: string;
  width: number;
  height: number;
  pages: AedomPage[];
  metadata: Record<string, unknown>;
};

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const LS_KEY = 'ae_current_doc';

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function cloneDoc(d: Doc): Doc {
  return structuredClone(d);
}

// ── Dynamic import (no SSR for Konva) ────────────────────────────────────────
const KonvaCanvas = dynamic(() => import('./KonvaCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full grid place-items-center text-slate-400 text-sm">
      Loading canvas…
    </div>
  ),
});

// ── Editor ────────────────────────────────────────────────────────────────────
export default function Editor() {
  const router = useRouter();
  const [doc, setDocState] = useState<Doc | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [cmd, setCmd] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [history, setHistory] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [scale, setScale] = useState(0.7);
  const [exportBusy, setExportBusy] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [statusMsg, setStatusMsg] = useState('');

  // ── Load AEDOM ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // Prefer sessionStorage (freshly uploaded), fall back to localStorage
    let raw = sessionStorage.getItem('aedom') ?? localStorage.getItem(LS_KEY);
    if (!raw) {
      setStatus('error');
      setStatusMsg('No document loaded. Please upload a file first.');
      return;
    }
    try {
      const parsed: Doc = JSON.parse(raw);
      const pg = parsed?.pages?.[0];
      console.log('[Editor] AEDOM loaded', {
        id: parsed.id,
        title: parsed.title,
        pages: parsed.pages?.length,
        page0Elements: pg?.elements?.length,
        dimensions: `${pg?.width}×${pg?.height}`,
        elementTypes: pg?.elements?.map((e) => e.type),
      });
      if (!pg) throw new Error('No pages in document');
      setDocState(parsed);
      setStatus('ready');
      // Persist to localStorage so refresh doesn't blank
      localStorage.setItem(LS_KEY, raw);
    } catch (err) {
      console.error('[Editor] failed to parse AEDOM', err);
      setStatus('error');
      setStatusMsg('Document could not be loaded. Please re-upload.');
    }
  }, []);

  // ── Commit a new doc version ────────────────────────────────────────────────
  const commit = useCallback((next: Doc) => {
    setHistory((h) => [...h, next].slice(-30)); // note: push PREVIOUS, not next
    setFuture([]);
    setDocState(next);
    const serialised = JSON.stringify(next);
    sessionStorage.setItem('aedom', serialised);
    localStorage.setItem(LS_KEY, serialised);
  }, []);

  // Actually we want to push the *current* doc into history
  const commitWithHistory = useCallback(
    (next: Doc) => {
      setDocState((current) => {
        if (current) {
          setHistory((h) => [...h, current].slice(-30));
        }
        setFuture([]);
        const serialised = JSON.stringify(next);
        sessionStorage.setItem('aedom', serialised);
        localStorage.setItem(LS_KEY, serialised);
        return next;
      });
    },
    [],
  );

  // ── Undo / redo ─────────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      const rest = h.slice(0, -1);
      setDocState((cur) => {
        if (cur) setFuture((f) => [cur, ...f]);
        const s = JSON.stringify(prev);
        sessionStorage.setItem('aedom', s);
        localStorage.setItem(LS_KEY, s);
        return prev;
      });
      return rest;
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      const rest = f.slice(1);
      setDocState((cur) => {
        if (cur) setHistory((h) => [...h, cur].slice(-30));
        const s = JSON.stringify(next);
        sessionStorage.setItem('aedom', s);
        localStorage.setItem(LS_KEY, s);
        return next;
      });
      return rest;
    });
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const page: AedomPage | undefined = doc?.pages?.[0];
  const selectedEl: AedomElement | undefined = useMemo(
    () => page?.elements.find((e) => e.id === selected),
    [page, selected],
  );

  // ── Commit a single element change ──────────────────────────────────────────
  const commitElement = useCallback(
    (element: AedomElement) => {
      if (!doc) return;
      const next = cloneDoc(doc);
      const idx = next.pages[0].elements.findIndex((x) => x.id === element.id);
      if (idx >= 0) {
        next.pages[0].elements[idx] = element;
        commitWithHistory(next);
      }
    },
    [doc, commitWithHistory],
  );

  // ── Toolbar actions ──────────────────────────────────────────────────────────
  const applyStyleToSelected = useCallback(
    (changes: Partial<AedomElement['style']>) => {
      if (!selectedEl || selectedEl.type !== 'text') return;
      commitElement({
        ...selectedEl,
        style: { ...selectedEl.style, ...changes },
      });
    },
    [selectedEl, commitElement],
  );

  const deleteSelected = useCallback(() => {
    if (!selected || !doc) return;
    const next = cloneDoc(doc);
    next.pages[0].elements = next.pages[0].elements.filter((e) => e.id !== selected);
    commitWithHistory(next);
    setSelected(null);
  }, [selected, doc, commitWithHistory]);

  const addShape = useCallback(() => {
    if (!doc) return;
    const next = cloneDoc(doc);
    const pg = next.pages[0];
    pg.elements.push({
      id: uid(),
      type: 'shape',
      shape: 'rect',
      bounds: { x: 50, y: 50, width: 200, height: 100 },
      zIndex: 20,
      fill: '#dbeafe',
      stroke: '#3b82f6',
      strokeWidth: 2,
      confidence: 1,
    });
    commitWithHistory(next);
  }, [doc, commitWithHistory]);

  const addTextBlock = useCallback(() => {
    if (!doc) return;
    const next = cloneDoc(doc);
    const pg = next.pages[0];
    pg.elements.push({
      id: uid(),
      type: 'text',
      text: 'New text',
      bounds: { x: 50, y: 50, width: 200, height: 40 },
      zIndex: 20,
      confidence: 1,
      style: {
        fontFamily: 'Arial',
        fontSize: 16,
        fontWeight: 400,
        fontStyle: 'normal',
        color: '#111827',
        align: 'left',
        lineHeight: 1.2,
      },
    });
    commitWithHistory(next);
  }, [doc, commitWithHistory]);

  // ── AI edit ──────────────────────────────────────────────────────────────────
  const aiEdit = useCallback(async () => {
    if (!cmd.trim() || !doc) return;
    setAiLoading(true);
    setAiError('');
    try {
      const r = await fetch(`${API}/v1/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: doc, command: cmd, selected_id: selected }),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      console.log('[Editor] AI edit result elements=', j.document?.pages?.[0]?.elements?.length);
      commitWithHistory(j.document);
      setCmd('');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI edit failed');
    } finally {
      setAiLoading(false);
    }
  }, [cmd, doc, selected, commitWithHistory]);

  // ── Export ───────────────────────────────────────────────────────────────────
  const exportFile = useCallback(
    async (format: string) => {
      if (!doc || exportBusy) return;
      setExportBusy(true);
      try {
        console.log(`[Editor] export format=${format} elements=`, doc.pages[0]?.elements?.length);
        const r = await fetch(`${API}/v1/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document: doc, format }),
        });
        if (!r.ok) throw new Error(await r.text());
        const blob = await r.blob();
        const ext = format === 'docx' ? 'docx' : format;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${doc.title || 'document'}.${ext}`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) {
        alert(`Export failed: ${err instanceof Error ? err.message : err}`);
      } finally {
        setExportBusy(false);
      }
    },
    [doc, exportBusy],
  );

  // ── Loading / error screens ──────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center text-slate-500">
        Loading document…
      </div>
    );
  }

  if (status === 'error' || !doc || !page) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-center space-y-4">
          <p className="text-red-600">{statusMsg || 'No document loaded.'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-black text-white rounded-xl text-sm"
          >
            Upload a file
          </button>
        </div>
      </div>
    );
  }

  const s = selectedEl?.style ?? {};
  const isBold = (s.fontWeight ?? 400) >= 700;
  const isItalic = s.fontStyle === 'italic';

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-100">
      {/* ── Header ── */}
      <header className="h-14 bg-white border-b flex items-center px-4 gap-2 shrink-0">
        <button
          onClick={() => router.push('/')}
          className="p-2 hover:bg-slate-100 rounded-lg"
          title="Back to upload"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="font-bold text-sm">Anything Editable</div>
        <span className="text-slate-400 text-sm">/</span>
        <input
          value={doc.title}
          onChange={(e) => {
            const next = cloneDoc(doc);
            next.title = e.target.value;
            setDocState(next);
          }}
          onBlur={() => commitWithHistory(doc)}
          className="bg-transparent font-medium outline-none w-48 text-sm"
        />

        {/* Undo/redo */}
        <div className="ml-2 flex gap-1">
          <button
            onClick={undo}
            disabled={!history.length}
            className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30"
            title="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={redo}
            disabled={!future.length}
            className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30"
            title="Redo"
          >
            <Redo2 size={16} />
          </button>
        </div>

        {/* Text formatting (only active when text element is selected) */}
        <div className="ml-2 flex gap-1 border-l pl-2">
          <button
            onClick={() => applyStyleToSelected({ fontWeight: isBold ? 400 : 700 })}
            disabled={selectedEl?.type !== 'text'}
            className={`p-2 rounded-lg disabled:opacity-30 ${isBold ? 'bg-slate-200' : 'hover:bg-slate-100'}`}
            title="Bold"
          >
            <Bold size={16} />
          </button>
          <button
            onClick={() => applyStyleToSelected({ fontStyle: isItalic ? 'normal' : 'italic' })}
            disabled={selectedEl?.type !== 'text'}
            className={`p-2 rounded-lg disabled:opacity-30 ${isItalic ? 'bg-slate-200' : 'hover:bg-slate-100'}`}
            title="Italic"
          >
            <Italic size={16} />
          </button>
          <button
            onClick={() => applyStyleToSelected({ align: 'left' })}
            disabled={selectedEl?.type !== 'text'}
            className={`p-2 rounded-lg disabled:opacity-30 ${s.align === 'left' || !s.align ? 'bg-slate-200' : 'hover:bg-slate-100'}`}
            title="Align left"
          >
            <AlignLeft size={16} />
          </button>
          <button
            onClick={() => applyStyleToSelected({ align: 'center' })}
            disabled={selectedEl?.type !== 'text'}
            className={`p-2 rounded-lg disabled:opacity-30 ${s.align === 'center' ? 'bg-slate-200' : 'hover:bg-slate-100'}`}
            title="Align center"
          >
            <AlignCenter size={16} />
          </button>
          <button
            onClick={() => applyStyleToSelected({ align: 'right' })}
            disabled={selectedEl?.type !== 'text'}
            className={`p-2 rounded-lg disabled:opacity-30 ${s.align === 'right' ? 'bg-slate-200' : 'hover:bg-slate-100'}`}
            title="Align right"
          >
            <AlignRight size={16} />
          </button>
          {/* Font size */}
          <select
            value={s.fontSize ?? 14}
            disabled={selectedEl?.type !== 'text'}
            onChange={(e) => applyStyleToSelected({ fontSize: Number(e.target.value) })}
            className="border rounded-lg px-2 py-1 text-xs disabled:opacity-30 ml-1"
            title="Font size"
          >
            {[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          {/* Color */}
          <input
            type="color"
            value={s.color ?? '#111827'}
            disabled={selectedEl?.type !== 'text'}
            onChange={(e) => applyStyleToSelected({ color: e.target.value })}
            className="w-8 h-8 rounded border cursor-pointer disabled:opacity-30"
            title="Text color"
          />
        </div>

        {/* Add elements */}
        <div className="ml-2 flex gap-1 border-l pl-2">
          <button onClick={addTextBlock} className="p-2 rounded-lg hover:bg-slate-100" title="Add text">
            <Type size={16} />
          </button>
          <button onClick={addShape} className="p-2 rounded-lg hover:bg-slate-100" title="Add rectangle">
            <Square size={16} />
          </button>
        </div>

        {/* Delete */}
        <button
          onClick={deleteSelected}
          disabled={!selected}
          className="p-2 rounded-lg hover:bg-red-50 text-red-600 disabled:opacity-30 ml-1"
          title="Delete selected"
        >
          <Trash2 size={16} />
        </button>

        {/* Zoom */}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setScale((s) => Math.max(0.2, s - 0.1))} className="p-1 rounded hover:bg-slate-100">
            <ZoomOut size={16} />
          </button>
          <span className="text-xs text-slate-500 w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(2, s + 0.1))} className="p-1 rounded hover:bg-slate-100">
            <ZoomIn size={16} />
          </button>
        </div>

        {/* Export */}
        <select
          onChange={(e) => { if (e.target.value) { exportFile(e.target.value); e.target.value = ''; } }}
          disabled={exportBusy}
          className="border rounded-lg px-3 py-1.5 text-sm ml-2 disabled:opacity-50"
          defaultValue=""
        >
          <option value="" disabled>{exportBusy ? 'Exporting…' : 'Export'}</option>
          <option value="pdf">PDF</option>
          <option value="docx">DOCX</option>
          <option value="html">HTML</option>
          <option value="svg">SVG</option>
        </select>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── Canvas area ── */}
        <main
          className="flex-1 overflow-auto flex justify-center items-start p-10"
          style={{ background: '#e2e8f0' }}
        >
          <div
            className="shadow-2xl"
            style={{
              width: page.width * scale,
              height: page.height * scale,
              background: page.background || '#ffffff',
            }}
          >
            <KonvaCanvas
              page={page}
              scale={scale}
              selected={selected}
              onClearSelection={() => setSelected(null)}
              onSelect={setSelected}
              onCommit={commitElement}
            />
          </div>
        </main>

        {/* ── Right panel ── */}
        <aside className="w-72 bg-white border-l p-4 overflow-auto shrink-0 flex flex-col gap-5">
          {/* AI edit */}
          <section>
            <h3 className="font-semibold text-sm">AI Edit</h3>
            <p className="text-xs text-slate-500 mt-1">
              e.g. "Change ₹10,000 to ₹15,000" · "Make headings blue" · "Bold"
            </p>
            <div className="mt-2 flex gap-2">
              <input
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && aiEdit()}
                placeholder="Type a command…"
                className="flex-1 min-w-0 border rounded-xl px-3 py-2 text-xs"
              />
              <button
                onClick={aiEdit}
                disabled={aiLoading || !cmd.trim()}
                className="p-2 rounded-xl bg-black text-white disabled:opacity-40"
                title="Apply command"
              >
                <Sparkles size={15} />
              </button>
            </div>
            {aiError && (
              <p className="text-red-600 text-xs mt-2">{aiError}</p>
            )}
          </section>

          {/* Selected element properties */}
          {selectedEl ? (
            <section>
              <h3 className="font-semibold text-sm">Properties</h3>
              <div className="mt-2 p-3 rounded-xl bg-slate-50 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Type</span>
                  <span className="font-medium">{selectedEl.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Confidence</span>
                  <span className="font-medium">
                    {Math.round((selectedEl.confidence ?? 1) * 100)}%
                  </span>
                </div>
                {/* Position & size */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {(['x', 'y', 'width', 'height'] as const).map((k) => (
                    <label key={k} className="flex flex-col gap-0.5">
                      <span className="text-slate-400 uppercase text-[10px]">{k}</span>
                      <input
                        type="number"
                        value={Math.round(selectedEl.bounds[k] as number)}
                        onChange={(ev) => {
                          commitElement({
                            ...selectedEl,
                            bounds: { ...selectedEl.bounds, [k]: Number(ev.target.value) },
                          });
                        }}
                        className="border rounded px-2 py-1 text-xs w-full"
                      />
                    </label>
                  ))}
                </div>
                {/* Text content */}
                {selectedEl.type === 'text' && (
                  <>
                    <label className="flex flex-col gap-0.5 pt-1">
                      <span className="text-slate-400 uppercase text-[10px]">Text</span>
                      <textarea
                        value={selectedEl.text ?? ''}
                        onChange={(ev) => {
                          commitElement({ ...selectedEl, text: ev.target.value });
                        }}
                        className="border rounded-lg p-2 text-xs min-h-20 resize-y w-full"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-0.5">
                        <span className="text-slate-400 uppercase text-[10px]">Font size</span>
                        <input
                          type="number"
                          value={selectedEl.style?.fontSize ?? 14}
                          min={6}
                          max={200}
                          onChange={(ev) => applyStyleToSelected({ fontSize: Number(ev.target.value) })}
                          className="border rounded px-2 py-1 text-xs w-full"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-slate-400 uppercase text-[10px]">Color</span>
                        <input
                          type="color"
                          value={selectedEl.style?.color ?? '#111827'}
                          onChange={(ev) => applyStyleToSelected({ color: ev.target.value })}
                          className="border rounded h-8 w-full cursor-pointer"
                        />
                      </label>
                    </div>
                  </>
                )}
                {/* Shape fill */}
                {selectedEl.type === 'shape' && (
                  <label className="flex flex-col gap-0.5 pt-1">
                    <span className="text-slate-400 uppercase text-[10px]">Fill color</span>
                    <input
                      type="color"
                      value={selectedEl.fill ?? '#cccccc'}
                      onChange={(ev) => commitElement({ ...selectedEl, fill: ev.target.value })}
                      className="border rounded h-8 w-full cursor-pointer"
                    />
                  </label>
                )}
                {/* Opacity */}
                <label className="flex flex-col gap-0.5 pt-1">
                  <span className="text-slate-400 uppercase text-[10px]">
                    Opacity ({Math.round((selectedEl.opacity ?? 1) * 100)}%)
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selectedEl.opacity ?? 1}
                    onChange={(ev) =>
                      commitElement({ ...selectedEl, opacity: Number(ev.target.value) })
                    }
                    className="w-full"
                  />
                </label>
                {/* Low-confidence warning */}
                {(selectedEl.confidence ?? 1) < 0.7 && (
                  <div className="flex gap-2 text-amber-700 bg-amber-50 p-2 rounded-xl mt-1">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>Low confidence — verify this element</span>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="text-xs text-slate-400">
              <p>Click an element on the canvas to select it.</p>
              <p className="mt-1">Double-click text to edit inline.</p>
              <p className="mt-3 font-medium text-slate-500">
                Document: {page.width}×{page.height}px ·{' '}
                {page.elements.length} elements
              </p>
            </section>
          )}

          {/* Zoom slider */}
          <section className="mt-auto">
            <label className="text-xs font-semibold text-slate-600">
              Zoom — {Math.round(scale * 100)}%
            </label>
            <input
              type="range"
              min={0.2}
              max={2}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-full mt-1"
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
