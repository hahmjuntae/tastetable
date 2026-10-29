import type { Metadata, Viewport } from "next";
import "./ds/ds.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "TasteTable",
  description: "A group dinner agent that finds the place where everyone's taste overlaps, using the Qloo Taste AI graph.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
