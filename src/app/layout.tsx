import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GitHub Avatar Art",
  description:
    "Turn any public GitHub avatar into deterministic, embeddable code art for your README.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0c10] text-[#e6edf3] antialiased">{children}</body>
    </html>
  );
}
