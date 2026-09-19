import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Lock, Trash2, EyeOff, Linkedin, CheckCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy – Anything Convertable",
  description:
    "Read our Privacy Policy. Anything Convertable operates with strict zero-retention policies, in-transit encryption, and no user tracking.",
};

export default function PrivacyPage() {
  return (
    <>
      <main className="main privacy-main">
        <div className="privacy-container">
          <div className="privacy-header">
            <Link href="/" className="back-link">
              <ArrowLeft size={16} /> Back to Home
            </Link>
            <div className="privacy-badge">
              <ShieldCheck size={16} /> Privacy First
            </div>
            <h1>Privacy Policy</h1>
            <p className="last-updated">Last Updated: September 2026</p>
          </div>

          <div className="privacy-highlight-grid">
            <div className="highlight-card">
              <div className="highlight-icon">
                <Trash2 size={20} />
              </div>
              <h3>Zero Permanent Storage</h3>
              <p>Uploaded files exist strictly in ephemeral memory for the seconds needed to convert, then are immediately purged.</p>
            </div>

            <div className="highlight-card">
              <div className="highlight-icon">
                <EyeOff size={20} />
              </div>
              <h3>Never Sold or Inspected</h3>
              <p>We do not analyze, read, sell, or use your document contents to train machine learning models.</p>
            </div>

            <div className="highlight-card">
              <div className="highlight-icon">
                <Lock size={20} />
              </div>
              <h3>Encrypted in Transit</h3>
              <p>All communication between your device and conversion servers is protected by modern HTTPS / TLS 1.3 encryption.</p>
            </div>
          </div>

          <article className="privacy-body">
            <section>
              <h2>1. Overview and Core Philosophy</h2>
              <p>
                At <strong>Anything Convertable</strong>, we believe that file conversion should be private, instantaneous, and friction-free. We do not require registration, login credentials, payment details, or personal tracking to convert your images, PDFs, Word documents, or PowerPoint presentations.
              </p>
            </section>

            <section>
              <h2>2. Information We Handle</h2>
              <div className="policy-box">
                <div className="policy-item">
                  <CheckCircle size={18} className="policy-check" />
                  <div>
                    <strong>Document & Image Files</strong>
                    <p>When you select a file to convert, it is transferred securely over encrypted connections solely to execute the requested conversion algorithm.</p>
                  </div>
                </div>

                <div className="policy-item">
                  <CheckCircle size={18} className="policy-check" />
                  <div>
                    <strong>Text Studio Input</strong>
                    <p>Text drafted in Text Studio is compiled on-demand into your chosen file format (.docx or .pdf) and returned directly to your browser for download.</p>
                  </div>
                </div>

                <div className="policy-item">
                  <CheckCircle size={18} className="policy-check" />
                  <div>
                    <strong>Local Preferences (Client-Side Only)</strong>
                    <p>Your recent conversion history stays exclusively in your local browser session.</p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2>3. Data Retention & Automatic Purging</h2>
              <p>
                We do not maintain user databases, accounts, or archival repositories. As soon as the conversion task finishes and the binary download is prepared, the source file and converted artifacts are scheduled for immediate disposal. No human ever inspects your files.
              </p>
            </section>

            <section>
              <h2>4. Security Standards</h2>
              <p>
                All data transmission between your browser and our processing nodes uses end-to-end TLS (Transport Layer Security) encryption. We continually update cryptographic suites to ensure protection against unauthorized eavesdropping or tampering.
              </p>
            </section>

            <section>
              <h2>5. Third-Party Analytics & Cookies</h2>
              <p>
                Anything Convertable does not employ invasive tracking cookies or commercial ad trackers. Any telemetry gathered is strictly anonymized, performance-oriented operational telemetry designed to prevent service abuse and monitor error rates.
              </p>
            </section>

            <section>
              <h2>6. Contact & Developer Information</h2>
              <p>
                If you have questions, feedback, or security inquiries regarding this policy or Anything Convertable, you can reach out directly to the lead developer:
              </p>
              <div className="developer-contact-card">
                <div className="contact-details">
                  <strong>Abhishek Tiwari</strong>
                  <span>Creator & Developer, Anything Convertable</span>
                </div>
                <a
                  href="https://www.linkedin.com/in/abhishek-tiwari-3a3594300/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button primary contact-btn"
                >
                  <Linkedin size={16} /> Connect on LinkedIn
                </a>
              </div>
            </section>
          </article>
        </div>
      </main>


    </>
  );
}
