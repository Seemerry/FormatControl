import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Streamdown / Remend 演示",
  description: "演示 streamdown (remend) 对不完整 Markdown 的修复过程",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
