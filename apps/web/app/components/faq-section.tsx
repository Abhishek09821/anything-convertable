"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle, Mail } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    question: "What file formats can I convert?",
    answer:
      "Anything Convertable supports images (JPG, PNG, WEBP, TIFF, BMP, GIF), PDF documents, Microsoft Word documents (.docx), and Microsoft PowerPoint presentations (.pptx). You can convert Image to PDF, Word to PDF, PDF to Word (with OCR support), PowerPoint to PDF, and PDF to PowerPoint.",
  },
  {
    question: "Is Anything Convertable completely free?",
    answer:
      "Yes, 100% free with no subscriptions, paywalls, or watermarks. You can convert documents and presentations as often as you need without even creating an account.",
  },
  {
    question: "Are my uploaded files safe and private?",
    answer:
      "Absolutely. Your files are processed securely in real-time and are never sold, indexed, or shared with any third parties. Files are held in temporary memory strictly for the duration of conversion and automatically deleted once the task completes.",
  },
  {
    question: "Can I convert scanned PDFs into editable Word documents?",
    answer:
      "Yes! When converting scanned documents or images inside a PDF, our OCR engine extracts readable text layers and embeds original page graphics for high-accuracy reference in the generated DOCX file.",
  },
  {
    question: "What is Text Studio and how do I use it?",
    answer:
      "Text Studio is our built-in authoring tool. Open the Text Studio page, type or paste your content, choose your preferred font, layout template (Resume, Report, Memo, etc.), and export directly to a polished Word (.docx) or PDF file in one click.",
  },
  {
    question: "What is the maximum file size supported?",
    answer:
      "We support files up to 50 MB per upload, which easily accommodates high-resolution photography collections, detailed slide decks, and hundred-page documents.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenIndex(prev => (prev === index ? null : index));
  };

  return (
    <section className="faq-section" id="faqs" aria-labelledby="faq-heading">
      <div className="faq-header">
        <div className="eyebrow">
          <span /> FREQUENTLY ASKED QUESTIONS
        </div>
        <h1 id="faq-heading">Got Questions? We Have Answers.</h1>
        <p>Everything you need to know about formats, privacy, fidelity, and limits.</p>
      </div>

      <div className="faq-list">
        {FAQS.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={faq.question}
              className={`faq-card ${isOpen ? "open" : ""}`}
            >
              <button
                type="button"
                className="faq-trigger"
                onClick={() => toggleFaq(index)}
                aria-expanded={isOpen}
                aria-controls={`faq-answer-${index}`}
                id={`faq-question-${index}`}
              >
                <div className="faq-question-content">
                  <HelpCircle size={18} className="faq-icon" />
                  <span>{faq.question}</span>
                </div>
                <ChevronDown
                  size={18}
                  className={`faq-chevron ${isOpen ? "rotated" : ""}`}
                />
              </button>

              <div
                id={`faq-answer-${index}`}
                role="region"
                aria-labelledby={`faq-question-${index}`}
                className={`faq-content ${isOpen ? "open" : "collapsed"}`}
              >
                <div className="faq-answer-inner">
                  <p>{faq.answer}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="faq-contact" aria-labelledby="faq-contact-heading">
        <h2 id="faq-contact-heading">Still have a question?</h2>
        <p>For questions, feedback, or help with a conversion, get in touch by email.</p>
        <a href="mailto:abhishek.tiwarii9821@gmail.com" className="faq-contact-link">
          <Mail size={18} aria-hidden="true" />
          <span>abhishek.tiwarii9821@gmail.com</span>
        </a>
      </div>
    </section>
  );
}
