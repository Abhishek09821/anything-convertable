import { notFound } from "next/navigation";
import Workspace from "../../components/workspace";
import { TOOLS } from "../../components/tools";
export function generateStaticParams() { return TOOLS.map(tool => ({ tool: tool.id.replaceAll("_", "-") })); }
export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const selected = TOOLS.find(item => item.id.replaceAll("_", "-") === tool);
  return { title: `${selected?.title ?? "Converter"} – Anything Convertable` };
}
export default async function ConverterPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const selected = TOOLS.find(item => item.id.replaceAll("_", "-") === tool);
  if (!selected) notFound();
  return <Workspace key={selected.id} mode="files" initialTool={selected.id} />;
}
