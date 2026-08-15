import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DesignWeave · 工作台",
  description: "对照代码做调研、补 PRD。人在墨览里改 Markdown。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
