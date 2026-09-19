import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfcf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1310" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "Anything Convertable – Convert PDF, Word, PPT & Images Online",
  description:
    "Convert PDF, Word, PowerPoint and images online with Anything Convertable. Fast, simple and secure document conversion.",
  keywords: [
    "file converter",
    "pdf to word",
    "word to pdf",
    "image to pdf",
    "powerpoint to pdf",
    "pdf to ppt",
    "document converter",
    "free online converter",
    "ocr document conversion",
  ],
  authors: [{ name: "Abhishek Tiwari", url: "https://www.linkedin.com/in/abhishek-tiwari-3a3594300/" }],
  creator: "Abhishek Tiwari",
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "Anything Convertable – Convert PDF, Word, PPT & Images Online",
    description:
      "Convert PDF, Word, PowerPoint and images online with Anything Convertable. Fast, simple and secure document conversion.",
    siteName: "Anything Convertable",
  },
  twitter: {
    card: "summary_large_image",
    title: "Anything Convertable – Convert PDF, Word, PPT & Images Online",
    description:
      "Convert PDF, Word, PowerPoint and images online with Anything Convertable. Fast, simple and secure document conversion.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const themeScript = `
  (function() {
    try {
      var saved = localStorage.getItem('theme');
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (saved === 'dark' || (!saved && prefersDark)) {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
