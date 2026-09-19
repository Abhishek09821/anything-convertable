import Link from "next/link";
import { ArrowLeft, FileQuestion, Sparkles } from "lucide-react";

export default function NotFound() {
  return (
    <>
      <main className="main not-found-main">
        <div className="not-found-card">
          <div className="not-found-badge">
            <FileQuestion size={40} className="not-found-icon" />
            <span className="code-badge">Error 404</span>
          </div>

          <h1>Lost in Conversion?</h1>
          <p className="not-found-desc">
            The page you are looking for might have been moved, renamed, or never existed in the first place.
            Don&apos;t worry—your documents are safe with us.
          </p>

          <div className="not-found-actions">
            <Link href="/" className="button primary">
              <ArrowLeft size={16} /> Return to Home
            </Link>
            <Link href="/privacy" className="button secondary">
              View Privacy Policy
            </Link>
          </div>

          <div className="not-found-popular">
            <div className="popular-header">
              <Sparkles size={14} />
              <span>Looking for quick conversions?</span>
            </div>
            <div className="popular-links">
              <Link href="/converters/image-to-pdf" className="quick-pill">Image to PDF</Link>
              <Link href="/converters/word-to-pdf" className="quick-pill">Word to PDF</Link>
              <Link href="/converters/pdf-to-word" className="quick-pill">PDF to Word</Link>
              <Link href="/converters/ppt-to-pdf" className="quick-pill">PPT to PDF</Link>
            </div>
          </div>
        </div>
      </main>


    </>
  );
}
