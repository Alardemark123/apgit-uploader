import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Article Uploader",
  description: "GCS article posts + media uploader (no database)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
