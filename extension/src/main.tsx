import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './popup.css';

const API = 'http://localhost:8000';

function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [conversionId, setConversionId] = useState('pdf_to_docx');

  const open = () => inputRef.current?.click();

  const run = async (file: File) => {
    setBusy(true);
    setMsg('Detecting…');
    try {
      // 1. Detect document type
      const fd1 = new FormData();
      fd1.append('file', file);
      const detectRes = await fetch(`${API}/v1/detect`, { method: 'POST', body: fd1 });
      if (detectRes.ok) {
        const detected = await detectRes.json();
        const suggested = detected.suggested_conversions?.[0];
        if (suggested) setConversionId(suggested);
      }

      // 2. Convert with selected/detected conversion
      setMsg('Converting…');
      const fd2 = new FormData();
      fd2.append('file', file);
      const convertRes = await fetch(`${API}/v1/convert/${conversionId}`, {
        method: 'POST',
        body: fd2,
      });

      if (!convertRes.ok) throw new Error(await convertRes.text());

      // 3. Trigger download
      const blob = await convertRes.blob();
      const cd = convertRes.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `converted.${conversionId.split('_').pop()}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Done — ${filename}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not connect to API');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="popup">
      <div className="brand">
        <b>AC</b>
        <span>Anything Convertable</span>
      </div>

      <select
        value={conversionId}
        onChange={(e) => setConversionId(e.target.value)}
        className="select"
        disabled={busy}
      >
        <option value="pdf_to_docx">PDF → DOCX</option>
        <option value="pdf_to_xlsx">PDF → XLSX</option>
        <option value="pdf_to_pptx">PDF → PPTX</option>
        <option value="image_to_docx">Image → DOCX</option>
        <option value="image_to_xlsx">Image → XLSX</option>
        <option value="image_to_searchable_pdf">Image → Searchable PDF</option>
        <option value="invoice_to_xlsx">Invoice → XLSX</option>
        <option value="invoice_to_json">Invoice → JSON</option>
        <option value="invoice_to_csv">Invoice → CSV</option>
        <option value="resume_to_docx">Resume → DOCX</option>
        <option value="screenshot_to_html">Screenshot → HTML</option>
      </select>

      <button onClick={open} className="primary" disabled={busy}>
        {busy ? 'Working…' : 'Convert file'}
      </button>

      <button
        onClick={() => chrome.tabs.create({ url: 'http://localhost:3000' })}
        className="secondary"
      >
        Open web app
      </button>

      <input
        ref={inputRef}
        hidden
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        onChange={(e) => e.target.files?.[0] && run(e.target.files[0])}
      />

      <small>{msg || 'PDF · Images · Invoices · Resumes · Screenshots'}</small>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
