import Link from "next/link";
import { ArrowRight, FileText, Type, Check } from "lucide-react";
import { ConverterGrid } from "./components/converter-grid";

export default function Home() {
  return <main className="main landing-main">
    <section className="hero landing-hero">
      <div className="eyebrow"><span /> YOUR EVERYDAY DOCUMENT WORKSPACE</div>
      <h1>New format.<br /><span>Same attention to detail.</span></h1>
      <p>From a quick file conversion to your next great document.<br className="desktop-break" /> Simple tools for whatever comes next.</p>
      <div className="hero-actions">
        <Link href="/converters" className="button primary">Explore converters <ArrowRight size={17} /></Link>
        <Link href="/text-studio" className="button secondary"><Type size={17} /> Open Text Studio</Link>
      </div>
      <div className="hero-notes"><span><Check size={14} /> No sign-up</span><span><Check size={14} /> No watermarks</span><span><Check size={14} /> Made for everyday files</span></div>
    </section>
    <section className="landing-converters" aria-labelledby="converters-heading">
      <div className="landing-section-heading"><div><span className="section-label">FIND YOUR FORMAT</span><h2 id="converters-heading">One file. A fresh possibility.</h2><p>Pick a converter and get straight to work.</p></div><Link href="/converters" className="text-button">All converters <ArrowRight size={16} /></Link></div>
      <ConverterGrid />
    </section>
    <section className="studio-preview" aria-labelledby="studio-heading">
      <div className="studio-preview-copy"><span className="eyebrow"><Type size={14} /> TEXT STUDIO</span><h2 id="studio-heading">Start with words.<br />Finish with a document.</h2><p>Write or paste your content, choose a template, and export a polished Word document or PDF.</p><Link href="/text-studio" className="button primary">Write a document <ArrowRight size={17} /></Link></div>
      <div className="studio-paper" aria-hidden="true"><FileText size={26} /><span className="paper-label">YOUR NEXT GREAT IDEA</span><strong>A little structure.<br />A lot of possibility.</strong><div className="paper-lines"><i /><i /><i /></div><div className="paper-tags"><span>Resume</span><span>Report</span><span>Memo</span></div></div>
    </section>
  </main>;
}
