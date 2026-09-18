"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, Check, CheckCircle2, ChevronRight, File, FileImage, FileText, Files, Image as ImageIcon, Info, Loader2, Presentation, RefreshCw, SlidersHorizontal, Type, Upload, X } from "lucide-react";
import { CustomDocumentFormat, DocumentTemplate, ConversionInfo, DownloadResult, convertFile, convertText, detectFile, listConversions } from "../lib/api";

import { DocumentFormatControls, DOCUMENT_FORMATS, DEFAULT_CUSTOM_FORMAT } from "./components/document-format-controls";

const TOOLS = [
  { id: "image_to_pdf", title: "Image to PDF", description: "Keep every detail in your images.", formats: "JPG, PNG, WEBP, TIFF + more", icon: ImageIcon, ext: "PDF" },
  { id: "word_to_pdf", title: "Word to PDF", description: "Make your document ready to share.", formats: "DOCX", icon: FileText, ext: "PDF" },
  { id: "pdf_to_word", title: "PDF to Word", description: "Turn your PDF into an editable document.", formats: "PDF", icon: FileText, ext: "DOCX" },
  { id: "ppt_to_pdf", title: "PowerPoint to PDF", description: "Bring your slides into one document.", formats: "PPTX", icon: Presentation, ext: "PDF" },
  { id: "pdf_to_ppt", title: "PDF to PowerPoint", description: "Give your document a place to present.", formats: "PDF", icon: Presentation, ext: "PPTX" },
];
const FONTS = ["Arial", "Calibri", "Times New Roman", "Georgia"];
const ACCEPT = ".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.gif";
type Stage = "idle" | "detecting" | "ready" | "converting" | "done" | "error";
type Result = DownloadResult & { label: string };
function save(result: DownloadResult) {
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement("a"); link.href = url; link.download = result.filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function size(bytes: number) { return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`; }

export default function Home() {
  const [tab, setTab] = useState<"files" | "text">("files");
  const [stage, setStage] = useState<Stage>("idle");
  const [catalog, setCatalog] = useState<ConversionInfo[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState("image_to_pdf");
  const [available, setAvailable] = useState<string[]>([]);
  const [font, setFont] = useState("original");
  const [searchable, setSearchable] = useState(true);
  const [fidelity, setFidelity] = useState("appearance");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [textFont, setTextFont] = useState("Arial");
  const [fontSize, setFontSize] = useState(12);
  const [documentTemplate, setDocumentTemplate] = useState<DocumentTemplate>("general");
  const [documentTitle, setDocumentTitle] = useState("");
  const [customFormat, setCustomFormat] = useState<CustomDocumentFormat>(DEFAULT_CUSTOM_FORMAT);
  const [sectionOrder, setSectionOrder] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const [textError, setTextError] = useState("");
  const [textResult, setTextResult] = useState<Result | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const busy = stage === "detecting" || stage === "converting";
  const tool = TOOLS.find(t => t.id === selected)!;
  const metadata = catalog.find(c => c.id === selected);
  const documentPreset = DOCUMENT_FORMATS.find(item => item.id === documentTemplate);
  useEffect(() => { setTextResult(null); setTextError(""); },
    [text, format, textFont, fontSize, searchable, documentTemplate, documentTitle, customFormat, sectionOrder]);
  function chooseDocumentTemplate(value: DocumentTemplate) {
    setDocumentTemplate(value);
    const preset = DOCUMENT_FORMATS.find(item => item.id === value);
    if (preset) { setTextFont(preset.font); setFontSize(preset.size); }
    if (value === "resume") setSearchable(true);
  }
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const loadCatalog = () => { setCatalogError(""); listConversions().then(setCatalog).catch(() => setCatalogError("The conversion service is unavailable. Please try again.")); };
  useEffect(() => { loadCatalog(); }, []);

  function reset() {
    request.current++; setFile(null); setResult(null); setStage("idle"); setAvailable([]); setError("");
    if (input.current) input.current.value = "";
  }
  async function chooseFile(next: File) {
    const id = ++request.current;
    setFile(next); setResult(null); setError(""); setStage("detecting");
    try {
      const detection = await detectFile(next);
      if (id !== request.current) return;
      if (!detection.suggested.length) throw new Error("This file format is not supported. Choose an image, PDF, DOCX or PPTX file.");
      setCatalogError("");
      setAvailable(detection.suggested);
      if (!detection.suggested.includes(selected)) setSelected(detection.suggested[0]);
      setCatalog(current => [...current.filter(c => !detection.suggested.includes(c.id)), ...detection.all_conversions]);
      setFont("original"); setStage("ready");
    } catch (e) { if (id === request.current) { setError(e instanceof Error ? e.message : "Unable to read this file."); setStage("error"); } }
  }
  async function run() {
    if (!file || busy) return;
    setStage("converting"); setError("");
    try {
      const output = await convertFile(file, selected, selected === "pdf_to_ppt" && fidelity === "appearance" ? "original" : font, searchable, fidelity);
      const completed = { ...output, label: tool.title };
      setResult(completed); setHistory(h => [completed, ...h].slice(0, 5)); setStage("done");
    } catch (e) { setError(e instanceof Error ? e.message : "Conversion failed."); setStage("error"); }
  }
  async function runText() {
    if (!text.trim() || textBusy) return;
    setTextBusy(true); setTextError(""); setTextResult(null);
    try {
      const output = await convertText({
        text, to_format: format, font: textFont, font_size: fontSize,
        searchable: documentTemplate === "resume" ? true : searchable,
        template: documentTemplate, title: documentTitle,
        ...(documentTemplate === "custom" ? { custom_format: {
          ...customFormat, section_order: sectionOrder.split("\n").map(s => s.trim()).filter(Boolean),
        } } : {}),
      });
      const completed = { ...output, label: `${documentPreset?.name ?? "Custom document"} · ${format === "docx" ? "Word" : "PDF"}` };
      setTextResult(completed); setHistory(h => [completed, ...h].slice(0, 5));
    } catch (e) { setTextError(e instanceof Error ? e.message : "Unable to create document."); }
    finally { setTextBusy(false); }
  }
  function resultPanel(output: Result) {
    return <div className="result" role="status">
      <div className="result-heading"><span className="success-icon"><CheckCircle2 size={24} /></span><div><h3>Your file is ready</h3><p className="filename">{output.filename}</p><p>{size(output.blob.size)}{output.elapsed && ` · Converted in ${output.elapsed}s`}</p></div></div>
      {!!output.warnings.length && <div className="quality-notes"><h4><Info size={15} /> Conversion notes</h4><ul>{output.warnings.map(w => <li key={w}>{w}</li>)}</ul></div>}
      <button className="button primary full" onClick={() => save(output)}><ArrowDownToLine size={17} /> Download {output.filename.split(".").pop()?.toUpperCase()}</button>
    </div>;
  }
  return <div className="app-shell">
    <a href="#workspace" className="skip-link">Skip to converter</a>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="/" aria-label="Anything Convertable home"><span className="brand-mark"><Files size={21} /></span><span>Anything<span className="brand-light"> Convertable</span></span></a>
      <span className="header-note">A little less file friction.</span>
    </div></header>
    <main className="main">
      <section className="hero"><div className="eyebrow"><span /> YOUR EVERYDAY DOCUMENT WORKSPACE</div><h1>New format.<br className="mobile-break" /> Same attention to detail.</h1><p>Convert documents, images and presentations.<br className="desktop-break" /> Thoughtful controls. Clear results. All in one place.</p></section>
      <div className="workspace-tabs" role="tablist" aria-label="Workspace"><button role="tab" aria-selected={tab === "files"} aria-controls="workspace" id="files-tab" disabled={textBusy} className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}><Files size={16} /> Convert files</button><button role="tab" aria-selected={tab === "text"} aria-controls="workspace" id="text-tab" disabled={busy} className={tab === "text" ? "active" : ""} onClick={() => setTab("text")}><Type size={17} /> Write a document</button></div>
      <div id="workspace" role="tabpanel" aria-labelledby={`${tab}-tab`}>
      {tab === "files" ? <div className="workspace-grid">
        <aside className="tool-panel"><div className="section-label"><span className="step-number">1</span> Choose your tool</div><div className="tool-list">
          {TOOLS.map(t => { const Icon = t.icon; const disabled = busy || (!!file && stage !== "done" && available.length > 0 && !available.includes(t.id)); return <button key={t.id} className={`tool-card ${selected === t.id ? "selected" : ""}`} aria-pressed={selected === t.id} disabled={disabled} onClick={() => { if (stage === "done") reset(); setSelected(t.id); setFont("original"); }}><span className="tool-icon"><Icon size={20} /></span><span className="tool-copy"><strong>{t.title}</strong><small>{t.formats}</small></span><ChevronRight size={16} className="tool-chevron" /></button>; })}
        </div><div className="sidebar-note"><SlidersHorizontal size={17} /><p>Original fonts by default.<br />Extra control when you need it.</p></div></aside>
        <section className="converter-panel" aria-busy={busy}>
          <div className="panel-heading"><div><span className="section-label"><span className="step-number">2</span> Upload & convert</span><h2>{tool.title}</h2><p>{tool.description}</p></div><span className="format-badge">{tool.ext}</span></div>
          {catalogError && <div className="notice" role="alert">{catalogError}<button className="text-button" onClick={loadCatalog}>Retry connection</button></div>}
          {stage === "done" && result ? <>{resultPanel(result)}<button className="button secondary full" onClick={reset}><RefreshCw size={16} /> Convert another file</button></> : <>
          <input ref={input} type="file" accept={ACCEPT} className="visually-hidden" tabIndex={-1} aria-label="Upload file" onChange={e => { const f = e.target.files?.[0]; if (f) void chooseFile(f); }} />
          {!file ? <button className={`drop-zone ${dragging ? "dragging" : ""}`} onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void chooseFile(f); }}><span className="upload-icon"><Upload size={25} strokeWidth={1.6} /></span><strong>Choose a file to get started</strong><span>or drag and drop it here</span><span className="browse-label">Browse files <ArrowRight size={15} /></span><small>Images, PDF, DOCX or PPTX</small></button> : <div className="uploaded-file"><span className="file-icon"><File size={23} /></span><div><strong className="filename">{file.name}</strong><span>{size(file.size)} · {stage === "detecting" ? "Checking file contents…" : "File selected"}</span></div><button aria-label="Remove file" className="icon-button" disabled={busy} onClick={reset}><X size={18} /></button></div>}
          {(stage === "ready" || stage === "converting") && <div className="settings">
            <div className="settings-heading"><SlidersHorizontal size={15} /><h3>Conversion settings</h3></div>
            {selected === "pdf_to_ppt" && <label className="field">Slide content<select value={fidelity} disabled={busy} onChange={e => setFidelity(e.target.value)}><option value="appearance">Preserve appearance (recommended)</option><option value="editable">Editable text</option></select><small>{fidelity === "appearance" ? "Keeps each complete page as a high-resolution slide image. Text is not editable." : "Editable text with a preserved graphics layer. Font spacing may change."}</small></label>}
            {metadata?.supports_font_choice && !(selected === "pdf_to_ppt" && fidelity === "appearance") && <label className="field">Font family<select value={font} disabled={busy} onChange={e => setFont(e.target.value)}><option value="original">Keep original fonts (recommended)</option>{FONTS.map(f => <option key={f}>{f}</option>)}</select><small>{font === "original" ? "Preserves detected font names where possible. Scanned fonts are estimated." : "Changing fonts may change spacing and page breaks."}</small></label>}
            {metadata?.supports_searchable_option && <label className="field">PDF content<select value={String(searchable)} disabled={busy} onChange={e => setSearchable(e.target.value === "true")}><option value="true">Selectable text</option><option value="false">Flattened page images (300 DPI)</option></select><small>Flattening removes text selection; it does not prevent editing or OCR.</small></label>}
            {selected === "image_to_pdf" && <p className="setting-note"><Check size={16} /> Original resolution, automatic orientation and all image pages.</p>}
            {selected === "pdf_to_word" && <p className="setting-note"><Info size={16} /> Scanned pages include OCR text and a source image for reference.</p>}
          </div>}
          {error && <div className="notice error" role="alert">{error}<button className="text-button" onClick={reset}>Choose another file</button></div>}
          <button className="button primary full convert-button" disabled={stage !== "ready"} onClick={run}>{busy ? <><Loader2 size={18} className="spin" />{stage === "detecting" ? "Analyzing file…" : "Converting your document…"}</> : <>Convert to {tool.ext} <ArrowRight size={17} /></>}</button>
          {stage === "converting" && <p className="processing-note" role="status">Checking pages, images and typography. Large files and scans can take longer.</p>}
          <div className="panel-footnote"><Info size={14} /><span>Quality depends on your source. We flag conversion limitations with your result.</span></div>
          </>}
        </section>
      </div> : <section className="text-panel"><div className="panel-heading"><div><span className="section-label">TEXT STUDIO</span><h2>Your content. The right structure.</h2><p>Choose a format, add your content, and create a Word document or PDF.</p></div><Type size={28} strokeWidth={1.4} /></div>
        <DocumentFormatControls template={documentTemplate} title={documentTitle} custom={customFormat}
          sectionOrder={sectionOrder} disabled={textBusy} onTemplate={chooseDocumentTemplate}
          onTitle={setDocumentTitle} onCustom={setCustomFormat} onSectionOrder={setSectionOrder} />
        <div className="text-controls"><label className="field">Save as<select disabled={textBusy} value={format} onChange={e => setFormat(e.target.value as "docx" | "pdf")}><option value="docx">Word document (.docx)</option><option value="pdf">PDF document (.pdf)</option></select></label><label className="field">Font family<select disabled={textBusy} value={textFont} onChange={e => setTextFont(e.target.value)}>{FONTS.map(f => <option key={f}>{f}</option>)}</select></label><label className="field">Font size<select disabled={textBusy} value={fontSize} onChange={e => setFontSize(Number(e.target.value))}>{[10, 11, 12, 14, 16, 18, 24].map(n => <option key={n} value={n}>{n} pt</option>)}</select></label></div>
        <label className="visually-hidden" htmlFor="document-text">Document text</label><textarea id="document-text" disabled={textBusy} value={text} onChange={e => setText(e.target.value)} maxLength={500000} placeholder={documentPreset?.placeholder ?? "# Your first section\nWrite your content here.\n\n# Your next section\nAdd the next section."} rows={12} /><div className="editor-footer"><span>{wordCount} words · {text.length} characters</span><button className="text-button" disabled={textBusy || !text} onClick={() => { setText(""); setTextResult(null); }}>Clear text</button></div>
        {format === "pdf" && <label className="check-field"><input type="checkbox" checked={documentTemplate === "resume" || searchable} disabled={textBusy || documentTemplate === "resume"} onChange={e => setSearchable(e.target.checked)} /> {documentTemplate === "resume" ? "Selectable text is required for résumé PDFs" : "Keep text selectable"}</label>}
        <p className="content-preservation-note">Your wording, dates and figures are kept. Headings and list markers control structure; no facts or missing sections are invented.</p>
        {textError && <div className="notice error" role="alert">{textError}</div>}
        <button className="button primary full" disabled={!text.trim() || textBusy} onClick={runText}>{textBusy ? <><Loader2 size={17} className="spin" /> Creating document…</> : <>Create {format === "docx" ? "Word document" : "PDF"} <ArrowRight size={17} /></>}</button>
        {textResult && resultPanel(textResult)}
      </section>}
      </div>
      <section className="details-row" aria-label="Conversion approach"><div><FileImage size={20} /><h3>Details stay in focus</h3><p>Preserve image resolution and page proportions.</p></div><div><Type size={20} /><h3>Typography, considered</h3><p>Keep source fonts or choose your own typeface.</p></div><div><CheckCircle2 size={20} /><h3>Know your result</h3><p>Clear notes for OCR, fonts and editable output.</p></div></section>
      {!!history.length && <section className="history"><div className="history-heading"><h2>Recent conversions</h2><span>This session only</span></div>{history.map((h, i) => <div className="history-item" key={`${h.filename}-${i}`}><FileText size={20} /><div><strong className="filename">{h.filename}</strong><span>{h.label} · {size(h.blob.size)}</span></div><button className="icon-button" aria-label={`Download ${h.filename}`} onClick={() => save(h)}><ArrowDownToLine size={18} /></button></div>)}</section>}
    </main>
    <footer className="site-footer"><span>Anything Convertable</span><span>Made for your everyday documents.</span></footer>
  </div>;
}
