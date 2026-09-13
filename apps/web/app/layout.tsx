import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anything Convertable",
  description: "Image → PDF · Word → PDF · PDF → Word · PPT → PDF · PDF → PPT",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
