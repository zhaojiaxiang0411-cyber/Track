import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ACI Leaf Refresh Pipeline",
  description: "成对交换机替换协作跟踪工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
