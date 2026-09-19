import { ConverterGrid } from "../components/converter-grid";
export const metadata = { title: "All Converters – Anything Convertable" };
export default function ConvertersPage() {
  return <main className="main directory-main"><section className="hero"><div className="eyebrow"><span /> FILE CONVERTERS</div><h1>The right format, right here.</h1><p>Choose a tool to convert your documents, images, or presentations.</p></section><ConverterGrid /></main>;
}
