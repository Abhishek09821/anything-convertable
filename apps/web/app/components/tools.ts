import { Image as ImageIcon, FileText, Presentation } from "lucide-react";

export const TOOLS = [
  { id: "image_to_pdf", title: "Image to PDF", description: "Keep every detail in your images.", formats: "JPG, PNG, WEBP, TIFF + more", icon: ImageIcon, ext: "PDF" },
  { id: "word_to_pdf", title: "Word to PDF", description: "Make your document ready to share.", formats: "DOCX", icon: FileText, ext: "PDF" },
  { id: "pdf_to_word", title: "PDF to Word", description: "Turn your PDF into an editable document.", formats: "PDF", icon: FileText, ext: "DOCX" },
  { id: "ppt_to_pdf", title: "PowerPoint to PDF", description: "Bring your slides into one document.", formats: "PPTX", icon: Presentation, ext: "PDF" },
  { id: "pdf_to_ppt", title: "PDF to PowerPoint", description: "Give your document a place to present.", formats: "PDF", icon: Presentation, ext: "PPTX" },
];
