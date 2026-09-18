"use client";

import { Check, FileText, SlidersHorizontal } from "lucide-react";
import type { CustomDocumentFormat, DocumentTemplate } from "../../lib/api";

export const DOCUMENT_FORMATS = [
  { id: "general", name: "General document", description: "A versatile layout for everyday office documents.", font: "Arial", size: 12,
    hint: "Use # for a main heading, ## for a subheading, and - for bullet points. Your paragraph order stays unchanged.",
    placeholder: "# Introduction\nWrite your introduction here.\n\n# Details\n- First point\n- Second point\n\n# Next steps\nAdd the next steps." },
  { id: "formal", name: "Formal letter", description: "A restrained, left-aligned format for correspondence.", font: "Times New Roman", size: 12,
    hint: "Include your address, date, recipient, subject, greeting, message and closing in the order you want them printed.",
    placeholder: "Your address\nDate\n\nRecipient name\nOrganization and address\n\n# Subject\n\nDear recipient,\n\nWrite your message here.\n\nYours sincerely,\nYour name" },
  { id: "report", name: "Business report", description: "Clear headings and generous spacing for longer work.", font: "Calibri", size: 11,
    hint: "Suggested sections: Executive summary, Objectives, Findings, Recommendations and Next steps. Only your supplied sections are included.",
    placeholder: "# Executive summary\nSummarize your report.\n\n# Objectives\n- State your objective\n\n# Findings\nAdd the evidence and findings.\n\n# Recommendations\nAdd your recommendations.\n\n# Next steps\nList the actions and owners." },
  { id: "resume", name: "ATS-friendly résumé", description: "One column. Standard headings. Readable text.", font: "Arial", size: 11,
    hint: "Put contact details in the body, then use Summary, Experience, Education and Skills. List recent roles first. Formatting alone cannot guarantee an ATS score.",
    placeholder: "Email | Phone | City | LinkedIn URL\n\n# Summary\nDescribe your actual background and relevant strengths.\n\n# Experience\nJob title | Company | Dates\n- Describe a real achievement, using accurate figures.\n\n# Education\nDegree | Institution | Year\n\n# Skills\nList skills you actually have.\n\n# Projects\nDescribe a relevant project." },
] as const;

export const DEFAULT_CUSTOM_FORMAT: CustomDocumentFormat = {
  page_size: "A4", margin_inches: 1, line_spacing: 1.15,
  heading_size: 15, heading_alignment: "left", section_order: [],
};

type Props = {
  template: DocumentTemplate;
  title: string;
  custom: CustomDocumentFormat;
  sectionOrder: string;
  disabled: boolean;
  onTemplate: (value: DocumentTemplate) => void;
  onTitle: (value: string) => void;
  onCustom: (value: CustomDocumentFormat) => void;
  onSectionOrder: (value: string) => void;
};

export function DocumentFormatControls(props: Props) {
  const { template, title, custom, sectionOrder, disabled } = props;
  const preset = DOCUMENT_FORMATS.find(item => item.id === template);
  function update<K extends keyof CustomDocumentFormat>(key: K, value: CustomDocumentFormat[K]) {
    props.onCustom({ ...custom, [key]: value });
  }
  return <div className="document-formats">
    <div className="format-section-heading"><h3>Choose a document format</h3><span>For Word and PDF</span></div>
    <div className="document-format-grid" role="group" aria-label="Document formats">
      {DOCUMENT_FORMATS.map(item => <button key={item.id} type="button" disabled={disabled}
        aria-pressed={template === item.id} className={`document-format-card ${template === item.id ? "selected" : ""}`}
        onClick={() => props.onTemplate(item.id)}>
        <span className="document-format-top"><FileText size={18} />{template === item.id && <Check size={16} />}</span>
        <strong>{item.name}</strong><span>{item.description}</span>
      </button>)}
    </div>
    <button type="button" disabled={disabled} aria-pressed={template === "custom"}
      className={`custom-format-button ${template === "custom" ? "selected" : ""}`}
      onClick={() => props.onTemplate("custom")}>
      <SlidersHorizontal size={17} /><span>Use my own format</span>{template === "custom" && <Check size={16} />}
    </button>
    <p className="format-guidance">{preset?.hint ?? "Set your layout below. Add your own headings to the text and optionally arrange their section order. These controls define the format; they do not rewrite your content."}</p>
    <label className="field document-title-field">{template === "resume" ? "Your name (document heading)" : "Document title (optional)"}
      <input type="text" maxLength={200} disabled={disabled} value={title} placeholder={template === "resume" ? "Your full name" : "Enter a title, or leave blank"} onChange={e => props.onTitle(e.target.value)} />
    </label>
    {template === "custom" && <div className="custom-format-fields">
      <div className="custom-format-grid">
        <label className="field">Page size<select disabled={disabled} value={custom.page_size} onChange={e => update("page_size", e.target.value as "A4" | "Letter")}><option>A4</option><option>Letter</option></select></label>
        <label className="field">Page margins<select disabled={disabled} value={custom.margin_inches} onChange={e => update("margin_inches", Number(e.target.value))}>{[0.5, 0.65, 0.75, 1, 1.25, 1.5].map(n => <option key={n} value={n}>{n} inch</option>)}</select></label>
        <label className="field">Line spacing<select disabled={disabled} value={custom.line_spacing} onChange={e => update("line_spacing", Number(e.target.value))}>{[1, 1.15, 1.2, 1.5, 2].map(n => <option key={n} value={n}>{n}×</option>)}</select></label>
        <label className="field">Heading alignment<select disabled={disabled} value={custom.heading_alignment} onChange={e => update("heading_alignment", e.target.value as "left" | "center")}><option value="left">Left</option><option value="center">Center</option></select></label>
        <label className="field">Heading size<select disabled={disabled} value={custom.heading_size} onChange={e => update("heading_size", Number(e.target.value))}>{[12, 14, 15, 16, 18, 20, 24, 28, 32].map(n => <option key={n} value={n}>{n} pt</option>)}</select></label>
      </div>
      <label className="field">Your section order (optional)
        <textarea rows={4} disabled={disabled} maxLength={5000} value={sectionOrder} placeholder={"Summary\nFindings\nRecommendations"} onChange={e => props.onSectionOrder(e.target.value)} />
        <small>One heading per line, matching a main heading in your content. Use “# Heading” in the content for custom main headings and “## Subheading” for subsections. Unlisted sections are kept at the end. Leave blank to keep the original order.</small>
      </label>
    </div>}
  </div>;
}
