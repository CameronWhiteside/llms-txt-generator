import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Text Generator",
  description: "Generate text with LLM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
