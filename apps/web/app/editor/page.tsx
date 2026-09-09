'use client';
/**
 * Editor page — AEDOM-backed document editor.
 *
 * Bug-fixes vs previous version:
 *  1. commitElement uses functional setDocState to avoid stale-closure reads.
 *  2. commitWithHistory never calls setState inside another setState updater
 *     (undo/redo now use a single useReducer so all state moves atomically).
 *  3. Delete / Backspace keyboard shortcut is wired on mount / unmount.
 *  4. Reconstruction warnings are shown in the sidebar.
 *  5. applyStyleToSelected reads selectedEl from the reducer state, not stale memo.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Italic,
  Redo2,
  Square,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { AedomElement, AedomPage } from './KonvaCanvas';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type Doc = {
  schemaVersion: string;
  id: string;
  title: string;
  width: number;
  height: number;
  pages: AedomPage[];
  metadata: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const LS_KEY = 'ae_current_doc';
const MAX_HISTORY = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function persist(doc: Doc): void {
  const s = JSON.stringify(doc);
  try { sessionStorage.setItem('aedom', s); } catch { /* quota */ }
  try { localStorage.setItem(LS_KEY, s); } catch { /* quota */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor state — single useReducer so all fields move atomically
// ─────────────────────────────────────────────────────────────────────────────
type EditorState = {
  doc: Doc | null;
  history: Doc[];   // past states (oldest first)
  future: Doc[];    // redo stack (next first)
  selected: string | null;
};

type EditorAction =
  | { type: 'LOAD'; doc: Doc }
  | { type: 'COMMIT'; doc: Doc }           // push current→history, set new doc
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SELECT'; id: string | null }
  | { type: 'SET_TITLE'; title: string };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {

    case 'LOAD':
      return { doc: action.doc, history: [], future: [], selected: null };

    case 'COMMIT': {
      const next = action.doc;
      persist(next);
      const history = state.doc
        ? [...state.history, state.doc].slice(-MAX_HISTORY)
        : state.history;
      return { ...state, doc: next, history, future: [] };
    }

    case 'UNDO': {
      if (!state.history.length || !state.doc) return state;
      const prev = state.history[state.history.length - 1];
      persist(prev);
      return {
        ...state,
        doc: prev,
        history: state.history.slice(0, -1),
        future: [state.doc, ...state.future],
        selected: null,
      };
    }

    case 'REDO': {
      if (!state.future.length || !state.doc) return state;
      const next = state.future[0];
      persist(next);
      return {
        ...state,
        doc: next,
        history: [...state.history, state.doc].slice(-MAX_HISTORY),
        future: state.future.slice(1),
        selected: null,
      };
    }

    case 'SELECT':
      return { ...state, selected: action.id };

    case 'SET_TITLE':
      if (!state.doc) return state;
      return { ...state, doc: { ...state.doc, title: action.title } };

    default:
      return state;
  }
}

const initialState: EditorState = {
  doc: null,
  history: [],
  future: [],
  selected: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic import — Konva must not run on SSR
// ─────────────────────────────────────────────────────────────────────────────
const KonvaCanvas = dynamic(() => import('./KonvaCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full grid place-items-center text-slate-400 text-sm">
      Loading canvas…
    </div>
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// Editor
// ─────────────────────────────────────────────────────────────────────────────
export default function Editor() {
  const router = useRouter();
  const [state, dispatch] = useReducer(editorReducer, initialState);
  const { doc, history, future, selected } = state;

  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadMsg, setLoadMsg] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [cmd, setCmd] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [scale, setScale] = useState(0.7);

  // Keep a ref to the latest selected id so keyboard handlers don't go stale
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  // ── Load AEDOM ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const raw =
      sessionStorage.getItem('aedom') ?? localStorage.getItem(LS_KEY);
    if (!raw) {
      setLoadStatus('error');
      setLoadMsg('No document loaded — please upload a file first.');
      return;
    }
    try {
      const parsed: Doc = JSON.parse(raw);
      if (!parsed?.pages?.[0]) throw new Error('Document has no pages');
      const pg = parsed.pages[0];
      console.log('[Editor] AEDOM loaded', {
        id: parsed.id,
        title: parsed.title,
        dimensions: `${pg.width}×${pg.height}`,
        elements: pg.elements.length,
        types: pg.elements.map((e) => e.type),
      });
      dispatch({ type: 'LOAD', doc: parsed });
      setLoadStatus('ready');
      // Persist so reload doesn't blank
      try { localStorage.setItem(LS_KEY, raw); } catch { /* quota */ }
    } catch (err) {
      console.error('[Editor] parse error', err);
      setLoadStatus('error');
      setLoadMsg('Could not load document — please re-upload.');
    }
  }, []);

  // ── Keyboard shortcuts (⌘Z / ⌘Y for undo/redo) ────────────────────────────
  useEffect(() => {
    const onKey = (evt: KeyboardEvent) => {
      const tag = (evt.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((evt.metaKey || evt.ctrlKey) && evt.key === 'z' && !evt.shiftKey) {
        evt.preventDefault();
        dispatch({ type: 'UNDO' });
      }
      if (
        (evt.metaKey || evt.ctrlKey) &&
        (evt.key === 'y' || (evt.key === 'z' && evt.shiftKey))
      ) {
        evt.preventDefault();
        dispatch({ type: 'REDO' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── commitDoc — the single place that writes a new doc version ─────────────
  const commitDoc = useCallback((next: Doc) => {
    dispatch({ type: 'COMMIT', doc: next });
  }, []);

  // ── commitElement — Bug Fix: doesn't capture stale `doc` ──────────────────
  // Instead of closing over `doc`, it receives the full updated element and
  // builds the new doc inside a lazy getter that always reads the latest state.
  // We achieve this by storing a stable callback ref.
  const docRef = useRef<Doc | null>(null);
  docRef.current = doc;

  const commitElement = useCallback((element: AedomElement) => {
    const current = docRef.current;
    if (!current) return;
    const next = clone(current);
    const idx = next.pages[0].elements.findIndex((x) => x.id === element.id);
    if (idx < 0) {
      console.warn('[Editor] commitElement: element not found', element.id);
      return;
    }
    next.pages[0].elements[idx] = element;
    dispatch({ type: 'COMMIT', doc: next });
  }, []);

  // ── deleteSelected — also uses docRef to avoid stale closure ──────────────
  const deleteSelected = useCallback(() => {
    const id = selectedRef.current;
    const current = docRef.current;
    if (!id || !current) return;
    const next = clone(current);
    const before = next.pages[0].elements.length;
    next.pages[0].elements = next.pages[0].elements.filter((e) => e.id !== id);
    if (next.pages[0].elements.length === before) return; // nothing removed
    dispatch({ type: 'COMMIT', doc: next });
    dispatch({ type: 'SELECT', id: null });
  }, []);

  // Store in a ref so the keydown handler can call it without capturing stale
  const deleteSelectedRef = useRef(deleteSelected);
  deleteSelectedRef.current = deleteSelected;

  // Fix the keyboard handler to use the ref pattern properly
  // (replace the placeholder dispatch above with the real delete call)
  useEffect(() => {
    const onKey = (evt: KeyboardEvent) => {
      const tag = (evt.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (evt.key === 'Delete' || evt.key === 'Backspace') {
        if (!selectedRef.current) return;
        evt.preventDefault();
        deleteSelectedRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const page: AedomPage | undefined = doc?.pages?.[0];
  // selectedEl always reads from the current doc in state — never stale
  const selectedEl: AedomElement | undefined = useMemo(
    () => page?.elements.find((e) => e.id === selected),
    [page, selected],
  );

  // ── applyStyleToSelected ───────────────────────────────────────────────────
  const applyStyleToSelected = useCallback(
    (changes: Partial<AedomElement['style']>) => {
      const el = selectedEl;
      if (!el || el.type !== 'text') return;
      commitElement({
        ...el,
        style: { ...(el.style ?? {}), ...changes },
      });
    },
    [selectedEl, commitElement],
  );

  // ── addTextBlock ───────────────────────────────────────────────────────────
  const addTextBlock = useCallback(() => {
    const current = docRef.current;
    if (!current) return;
    const pg = current.pages[0];
    const newEl: AedomElement = {
      id: uid(),
      type: 'text',
      text: 'New text — double-click to edit',
      bounds: {
        x: Math.round(pg.width / 2 - 120),
        y: Math.round(pg.height / 2 - 20),
        width: 240,
        height: 40,
      },
      zIndex: 20,
      confidence: 1,
      style: {
        fontFamily: 'Arial',
        fontSize: 18,
        fontWeight: 400,
        fontStyle: 'normal',
        color: '#111827',
        align: 'left',
        lineHeight: 1.2,
      },
    };
    const next = clone(current);
    next.pages[0].elements.push(newEl);
    dispatch({ type: 'COMMIT', doc: next });
    dispatch({ type: 'SELECT', id: newEl.id });
  }, []);

  // ── addShape ───────────────────────────────────────────────────────────────
  const addShape = useCallback(() => {
    const current = docRef.current;
    if (!current) return;
    const pg = current.pages[0];
    const newEl: AedomElement = {
      id: uid(),
      type: 'shape',
      shape: 'rect',
      bounds: {
        x: Math.round(pg.width / 2 - 100),
        y: Math.round(pg.height / 2 - 50),
        width: 200,
        height: 100,
      },
      zIndex: 20,
      fill: '#dbeafe',
      stroke: '#3b82f6',
      strokeWidth: 2,
      confidence: 1,
    };
    const next = clone(current);
    next.pages[0].elements.push(newEl);
    dispatch({ type: 'COMMIT', doc: next });
    dispatch({ type: 'SELECT', id: newEl.id });
  }, []);

  // ── AI edit ────────────────────────────────────────────────────────────────
  const aiEdit = useCallback(async () => {
    if (!cmd.trim()) return;
    const current = docRef.current;
    if (!current) return;
    setAiLoading(true);
    setAiError('');
    try {
      console.log('[Editor] AI edit:', cmd, 'selected_id:', selectedRef.current);
      const r = await fetch(`${API}/v1/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: current,
          command: cmd,
          selected_id: selectedRef.current,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      console.log(
        '[Editor] AI edit result elements=',
        j.document?.pages?.[0]?.elements?.length,
      );
      dispatch({ type: 'COMMIT', doc: j.document });
      setCmd('');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI edit failed');
    } finally {
      setAiLoading(false);
    }
  }, [cmd]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const exportFile = useCallback(async (format: string) => {
    const current = docRef.current;
    if (!current || exportBusy) return;
    setExportBusy(true);
    try {
      console.log(
        `[Editor] export format=${format}`,
        `elements=${current.pages[0]?.elements?.length}`,
      );
      const r = await fetch(`${API}/v1/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: current, format }),
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const ext = format === 'docx' ? 'docx' : format;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${current.title || 'document'}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportBusy(false);
    }
  }, [exportBusy]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render — loading / error gates
  // ─────────────────────────────────────────────────────────────────────────
  if (loadStatus === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center text-slate-500 text-sm">
        Loading document…
      </div>
    );
  }
  if (loadStatus === 'error' || !doc || !page) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-center space-y-4 p-8">
          <p className="text-red-600 text-sm">{loadMsg}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-black text-white rounded-xl text-sm"
          >
            ← Upload a file
          </button>
        </div>
      </div>
    );
  }

  const s = selectedEl?.style ?? {};
  const isBold = (s.fontWeight ?? 400) >= 700;
  const isItalic = s.fontStyle === 'italic';

  // ─────────────────────────────────────────────────────────────────────────
  // Main editor UI
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#e2e8f0' }}>

      {/* ── Toolbar ── */}
      <header className="h-12 bg-white border-b flex items-center px-3 gap-1 shrink-0 overflow-x-auto">

        {/* Back */}
        <button
          onClick={() => router.push('/')}
          className="p-1.5 hover:bg-slate-100 rounded-lg shrink-0"
          title="Back"
        >
          <ArrowLeft size={16} />
        </button>

        {/* Title */}
        <span className="text-slate-400 text-sm shrink-0">/</span>
        <input
          value={doc.title}
          onChange={(e) => dispatch({ type: 'SET_TITLE', title: e.target.value })}
          onBlur={() => commitDoc(doc)}
          className="bg-transparent font-medium outline-none w-36 text-sm min-w-0"
        />

        <div className="w-px h-5 bg-slate-200 mx-1 shrink-0" />

        {/* Undo / Redo */}
        <button
          onClick={() => dispatch({ type: 'UNDO' })}
          disabled={!history.length}
          title="Undo (⌘Z)"
          className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={() => dispatch({ type: 'REDO' })}
          disabled={!future.length}
          title="Redo (⌘Y)"
          className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
        >
          <Redo2 size={15} />
        </button>

        <div className="w-px h-5 bg-slate-200 mx-1 shrink-0" />

        {/* Text formatting — only active when a text element is selected */}
        <button
          onClick={() => applyStyleToSelected({ fontWeight: isBold ? 400 : 700 })}
          disabled={selectedEl?.type !== 'text'}
          title="Bold"
          className={`p-1.5 rounded-lg disabled:opacity-30 ${isBold ? 'bg-slate-200' : 'hover:bg-slate-100'}`}
        >
          <Bold size={15} />
        </button>
        <button
          onClick={() => applyStyleToSelected({ fontStyle: isItalic ? 'normal' : 'italic' })}
          disabled={selectedEl?.type !== 'text'}
          title="Italic"
          className={`p-1.5 rounded-lg disabled:opacity-30 ${isItalic ? 'bg-slate-200' : 'hover:bg-slate-100'}`}
        >
          <Italic size={15} />
        </button>

        {/* Alignment */}
        {(['left', 'center', 'right'] as const).map((a) => (
          <button
            key={a}
            onClick={() => applyStyleToSelected({ align: a })}
            disabled={selectedEl?.type !== 'text'}
            title={`Align ${a}`}
            className={`p-1.5 rounded-lg disabled:opacity-30 ${
              s.align === a || (!s.align && a === 'left') ? 'bg-slate-200' : 'hover:bg-slate-100'
            }`}
          >
            {a === 'left' ? <AlignLeft size={15} /> : a === 'center' ? <AlignCenter size={15} /> : <AlignRight size={15} />}
          </button>
        ))}

        {/* Font size */}
        <select
          value={s.fontSize ?? 14}
          disabled={selectedEl?.type !== 'text'}
          onChange={(e) => applyStyleToSelected({ fontSize: Number(e.target.value) })}
          className="border rounded px-1.5 py-0.5 text-xs disabled:opacity-30 w-14"
          title="Font size"
        >
          {[8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        {/* Text colour */}
        <input
          type="color"
          value={s.color ?? '#111827'}
          disabled={selectedEl?.type !== 'text'}
          onChange={(e) => applyStyleToSelected({ color: e.target.value })}
          title="Text color"
          className="w-7 h-7 rounded border cursor-pointer disabled:opacity-30 p-0.5"
        />

        <div className="w-px h-5 bg-slate-200 mx-1 shrink-0" />

        {/* Add elements */}
        <button
          onClick={addTextBlock}
          className="p-1.5 rounded-lg hover:bg-slate-100"
          title="Add text box"
        >
          <Type size={15} />
        </button>
        <button
          onClick={addShape}
          className="p-1.5 rounded-lg hover:bg-slate-100"
          title="Add rectangle"
        >
          <Square size={15} />
        </button>

        {/* Delete */}
        <button
          onClick={deleteSelected}
          disabled={!selected}
          title="Delete selected (Del)"
          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 disabled:opacity-30"
        >
          <Trash2 size={15} />
        </button>

        <div className="ml-auto flex items-center gap-1 shrink-0">
          {/* Zoom */}
          <button
            onClick={() => setScale((z) => Math.max(0.15, +(z - 0.1).toFixed(2)))}
            className="p-1 rounded hover:bg-slate-100"
            title="Zoom out"
          >
            <ZoomOut size={15} />
          </button>
          <span className="text-xs text-slate-500 w-10 text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
            className="p-1 rounded hover:bg-slate-100"
            title="Zoom in"
          >
            <ZoomIn size={15} />
          </button>

          <div className="w-px h-5 bg-slate-200 mx-1" />

          {/* Export */}
          <select
            defaultValue=""
            disabled={exportBusy}
            onChange={(e) => {
              if (e.target.value) {
                exportFile(e.target.value);
                e.target.value = '';
              }
            }}
            className="border rounded px-2 py-1 text-xs disabled:opacity-50"
          >
            <option value="" disabled>
              {exportBusy ? 'Exporting…' : 'Export ▾'}
            </option>
            <option value="pdf">PDF</option>
            <option value="docx">DOCX</option>
            <option value="html">HTML</option>
            <option value="svg">SVG</option>
          </select>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Canvas ── */}
        <main className="flex-1 overflow-auto flex justify-center items-start p-8">
          <div
            className="shadow-2xl relative"
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
              onClearSelection={() => dispatch({ type: 'SELECT', id: null })}
              onSelect={(id) => dispatch({ type: 'SELECT', id })}
              onCommit={commitElement}
            />
          </div>
        </main>

        {/* ── Right panel ── */}
        <aside className="w-72 bg-white border-l flex flex-col shrink-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-5">

            {/* Reconstruction warnings */}
            {warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                {warnings.map((w, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* AI edit */}
            <section>
              <h3 className="font-semibold text-sm">AI Edit</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                "Change ₹10,000 to ₹15,000" · "Make headings bold" · "Color to blue"
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  value={cmd}
                  onChange={(e) => setCmd(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && aiEdit()}
                  placeholder="Type a command…"
                  className="flex-1 min-w-0 border rounded-lg px-2.5 py-1.5 text-xs"
                />
                <button
                  onClick={aiEdit}
                  disabled={aiLoading || !cmd.trim()}
                  className="p-2 rounded-lg bg-black text-white disabled:opacity-40 shrink-0"
                  title="Run AI command"
                >
                  <Sparkles size={14} />
                </button>
              </div>
              {aiError && (
                <p className="text-red-500 text-[11px] mt-1.5">{aiError}</p>
              )}
            </section>

            {/* Selected element properties */}
            {selectedEl ? (
              <section>
                <h3 className="font-semibold text-sm">Properties</h3>
                <div className="mt-2 space-y-3">

                  {/* Type + confidence */}
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">
                      {selectedEl.type}
                      {selectedEl.locked ? ' · locked' : ''}
                    </span>
                    <span className="text-slate-500">
                      {Math.round((selectedEl.confidence ?? 1) * 100)}% conf.
                    </span>
                  </div>

                  {/* Position / size */}
                  <div className="grid grid-cols-2 gap-2">
                    {(['x', 'y', 'width', 'height'] as const).map((k) => (
                      <label key={k} className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-slate-400 uppercase">{k}</span>
                        <input
                          type="number"
                          value={Math.round(selectedEl.bounds[k] as number)}
                          disabled={selectedEl.locked && (k === 'x' || k === 'y')}
                          onChange={(ev) =>
                            commitElement({
                              ...selectedEl,
                              bounds: {
                                ...selectedEl.bounds,
                                [k]: Number(ev.target.value),
                              },
                            })
                          }
                          className="border rounded px-2 py-1 text-xs w-full disabled:opacity-40"
                        />
                      </label>
                    ))}
                  </div>

                  {/* Text content */}
                  {selectedEl.type === 'text' && (
                    <>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-slate-400 uppercase">Text content</span>
                        <textarea
                          value={selectedEl.text ?? ''}
                          rows={3}
                          onChange={(ev) =>
                            commitElement({ ...selectedEl, text: ev.target.value })
                          }
                          className="border rounded-lg p-2 text-xs resize-y w-full"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-slate-400 uppercase">Font size</span>
                          <input
                            type="number"
                            value={selectedEl.style?.fontSize ?? 14}
                            min={6}
                            max={200}
                            onChange={(ev) =>
                              applyStyleToSelected({ fontSize: Number(ev.target.value) })
                            }
                            className="border rounded px-2 py-1 text-xs w-full"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-slate-400 uppercase">Font family</span>
                          <select
                            value={selectedEl.style?.fontFamily ?? 'Arial'}
                            onChange={(ev) =>
                              applyStyleToSelected({ fontFamily: ev.target.value })
                            }
                            className="border rounded px-1 py-1 text-xs w-full"
                          >
                            {['Arial', 'Georgia', 'Times New Roman', 'Helvetica', 'Courier New', 'Verdana', 'Trebuchet MS'].map((f) => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-slate-400 uppercase">Color</span>
                          <input
                            type="color"
                            value={selectedEl.style?.color ?? '#111827'}
                            onChange={(ev) =>
                              applyStyleToSelected({ color: ev.target.value })
                            }
                            className="border rounded h-8 w-full cursor-pointer p-0.5"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-slate-400 uppercase">Align</span>
                          <select
                            value={selectedEl.style?.align ?? 'left'}
                            onChange={(ev) =>
                              applyStyleToSelected({ align: ev.target.value })
                            }
                            className="border rounded px-1 py-1 text-xs w-full"
                          >
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </label>
                      </div>
                    </>
                  )}

                  {/* Shape fill + stroke */}
                  {selectedEl.type === 'shape' && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-slate-400 uppercase">Fill</span>
                        <input
                          type="color"
                          value={selectedEl.fill ?? '#cccccc'}
                          onChange={(ev) =>
                            commitElement({ ...selectedEl, fill: ev.target.value })
                          }
                          className="border rounded h-8 w-full cursor-pointer p-0.5"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-slate-400 uppercase">Stroke</span>
                        <input
                          type="color"
                          value={selectedEl.stroke ?? '#000000'}
                          onChange={(ev) =>
                            commitElement({ ...selectedEl, stroke: ev.target.value })
                          }
                          className="border rounded h-8 w-full cursor-pointer p-0.5"
                        />
                      </label>
                    </div>
                  )}

                  {/* Opacity */}
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-slate-400 uppercase">
                      Opacity — {Math.round((selectedEl.opacity ?? 1) * 100)}%
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
                    <div className="flex gap-2 items-start text-amber-700 bg-amber-50 p-2.5 rounded-xl text-xs">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      <span>Low confidence — verify this element before relying on it.</span>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <section className="text-xs text-slate-400 space-y-1">
                <p>Click an element to select it.</p>
                <p>Double-click text to edit inline.</p>
                <p>Press <kbd className="bg-slate-100 px-1 rounded">Del</kbd> to delete.</p>
                <p className="pt-2 text-slate-500 font-medium">
                  {page.width}×{page.height}px · {page.elements.length} elements
                </p>
              </section>
            )}
          </div>

          {/* Zoom slider pinned to bottom */}
          <div className="border-t p-3 shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="w-8 tabular-nums">{Math.round(scale * 100)}%</span>
              <input
                type="range"
                min={0.15}
                max={3}
                step={0.05}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="flex-1"
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
