"use client";

import { useEffect, useState } from "react";
import { Upload, ArrowUp } from "lucide-react";

interface StickyMobileCtaProps {
  onUploadClick?: () => void;
  isBusy?: boolean;
}

export function StickyMobileCta({ onUploadClick, isBusy }: StickyMobileCtaProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show only when scrolled down a bit and on mobile/tablet viewports
      const scrollY = window.scrollY;
      const isMobile = window.innerWidth <= 768;
      if (isMobile && scrollY > 220) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  const handleClick = () => {
    if (onUploadClick) {
      onUploadClick();
    } else {
      const workspace = document.getElementById("workspace");
      if (workspace) {
        workspace.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  if (!visible) return null;

  return (
    <aside className="sticky-mobile-cta" aria-label="Quick converter action">
      <div className="sticky-mobile-cta-inner">
        <button
          type="button"
          className="sticky-mobile-btn"
          onClick={handleClick}
          disabled={isBusy}
          aria-label="Upload file or jump to converter"
        >
          <span className="sticky-btn-icon">
            <Upload size={18} />
          </span>
          <div className="sticky-btn-text">
            <strong>Convert a File</strong>
            <span>PDF, DOCX, PPTX & Images</span>
          </div>
          <span className="sticky-btn-arrow">
            <ArrowUp size={16} />
          </span>
        </button>
      </div>
    </aside>
  );
}
