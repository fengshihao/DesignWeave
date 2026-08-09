import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DesignWeave · 端到端交付工作台",
  description: "帮助软件设计师完成高质量 PRD，并衔接架构与测试交付",
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
