import Link from "next/link";
import { Files, ArrowLeft, FileQuestion, Sparkles } from "lucide-react";
import { ThemeToggle } from "./components/theme-toggle";
import { SiteFooter } from "./components/site-footer";

export default function NotFound() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="Anything Convertable home">
            <span className="brand-mark">
              <Files size={21} />
            </span>
            <span>
              Anything<span className="brand-light"> Convertable</span>
            </span>
          </Link>
          <div className="header-actions">
            <ThemeToggle />
          </div>
        </div>
      </header>

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
              <ArrowLeft size={16} /> Return to Converter
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
              <Link href="/#workspace" className="quick-pill">Image to PDF</Link>
              <Link href="/#workspace" className="quick-pill">Word to PDF</Link>
              <Link href="/#workspace" className="quick-pill">PDF to Word</Link>
              <Link href="/#workspace" className="quick-pill">PPT to PDF</Link>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
