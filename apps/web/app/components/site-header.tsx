"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Files } from "lucide-react";

export function SiteHeader() {
  const pathname = usePathname();
  return <header className="site-header"><div className="header-inner">
    <Link className="brand" href="/" aria-label="Anything Convertable home">
      <span className="brand-mark"><Files size={21} /></span>
      <span>Anything<span className="brand-light"> Convertable</span></span>
    </Link>
    <nav className="header-nav-links" aria-label="Main navigation">
      {[["/", "Home"], ["/converters", "Converter"], ["/text-studio", "Text Studio"], ["/faqs", "FAQs"], ["/privacy", "Privacy"]].map(([href, label]) =>
        <Link key={href} href={href} className="header-nav-link" aria-current={(href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)) ? "page" : undefined}>{label}</Link>
      )}
    </nav>
  </div></header>;
}
