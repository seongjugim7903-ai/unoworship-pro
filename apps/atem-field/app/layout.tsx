import type { Metadata } from "next";
import { Geist, Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import WebFontLoader from "@/components/WebFontLoader";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "UnoWorship",
  description: "교회 방송실을 위한 자막, 송출, 녹화 운영 시스템",
  manifest: '/manifest.json',
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black',
  },
};

export const preferredRegion = 'icn1';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${notoSansKR.variable} antialiased bg-[#0a0a0a] text-white`}
      >
        <WebFontLoader />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
