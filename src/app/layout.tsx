import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { IOS_POLYFILL_SCRIPT } from "@/lib/ios-polyfills";

export const metadata: Metadata = {
  title: "VoiceCity · 找歌听歌",
  description: "找歌 · 听歌识曲 · 播放列表 — 统一播放器，本地 indexedDB 记录。",
  icons: { icon: "/logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: IOS_POLYFILL_SCRIPT }}
        />
      </head>
      <body
        className={`antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        <SonnerToaster theme="dark" position="top-center" richColors />
      </body>
    </html>
  );
}
