import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DesignWeave · 工作台",
  description: "给产品 / 设计 / 测试用的 Cursor。圈文档一块，说一句，AI 改 Markdown。",
};

const themeBoot = `(function(){
  try {
    var t = localStorage.getItem("molan-theme");
    if (t === "night" || t === "hack" || t === "rose" || t === "xuan") {
      document.documentElement.setAttribute("data-theme", t);
    } else {
      document.documentElement.setAttribute("data-theme", "xuan");
    }
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "xuan");
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="xuan" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
