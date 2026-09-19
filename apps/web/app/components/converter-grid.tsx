import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TOOLS } from "./tools";

export function ConverterGrid() {
  return <div className="converter-grid">{TOOLS.map(tool => {
    const Icon = tool.icon;
    return <Link href={`/converters/${tool.id.replaceAll("_", "-")}`} key={tool.id} className="converter-card">
      <span className="tool-icon"><Icon size={23} /></span>
      <ArrowUpRight className="card-arrow" size={19} />
      <h3>{tool.title}</h3><p>{tool.description}</p><span className="card-formats">{tool.formats} → {tool.ext}</span>
    </Link>;
  })}</div>;
}
