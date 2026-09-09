import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anything Convertable — AI Document Converter',
  description:
    'Convert PDFs, scans, invoices, resumes and screenshots into DOCX, XLSX, PPTX, HTML and more.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
