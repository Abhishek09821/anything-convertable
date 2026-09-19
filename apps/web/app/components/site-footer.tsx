import Link from "next/link";
import { Files, Linkedin, ShieldCheck, Heart } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="site-footer-modern">
      <div className="site-footer-inner">
        <div className="footer-top">
          <div className="footer-brand-col">
            <Link href="/" className="brand" aria-label="Anything Convertable home">
              <span className="brand-mark">
                <Files size={20} />
              </span>
              <span>
                Anything<span className="brand-light"> Convertable</span>
              </span>
            </Link>
            <p className="footer-tagline">
              Fast, simple, and secure document conversion in your browser.
              No friction, no watermarks, no registration required.
            </p>
            <div className="footer-developer-badge">
              <span className="developed-by">
                Crafted with <Heart size={14} className="heart-icon" /> by
              </span>
              <a
                href="https://www.linkedin.com/in/abhishek-tiwari-3a3594300/"
                target="_blank"
                rel="noopener noreferrer"
                className="developer-link"
                title="Connect with Abhishek Tiwari on LinkedIn"
              >
                <Linkedin size={16} />
                <span>Abhishek Tiwari</span>
              </a>
            </div>
          </div>

          <div className="footer-links-group">
            <div className="footer-col">
              <h4>Conversions</h4>
              <ul>
                <li><Link href="/#workspace">Image to PDF</Link></li>
                <li><Link href="/#workspace">Word to PDF</Link></li>
                <li><Link href="/#workspace">PDF to Word</Link></li>
                <li><Link href="/#workspace">PowerPoint to PDF</Link></li>
                <li><Link href="/#workspace">PDF to PowerPoint</Link></li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Studio & Info</h4>
              <ul>
                <li><Link href="/#workspace">Text Studio</Link></li>
                <li><Link href="/#faqs">Frequently Asked Questions</Link></li>
                <li>
                  <Link href="/privacy" className="privacy-link-highlight">
                    <ShieldCheck size={14} /> Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} Anything Convertable. All rights reserved.</p>
          <div className="footer-bottom-links">
            <Link href="/privacy">Privacy Policy</Link>
            <span className="dot-sep">•</span>
            <a
              href="https://www.linkedin.com/in/abhishek-tiwari-3a3594300/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Developer LinkedIn
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
