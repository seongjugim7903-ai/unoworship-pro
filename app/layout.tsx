// 루트 레이아웃 — 전역 메타·기본 스타일 (Phase 0 최소, UI는 Phase 2에서 새 디자인)

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import PwaInstallPrompt from './pwa/PwaInstallPrompt';
import './globals.css';

export const metadata: Metadata = {
  title: 'ULJU · 예배 준비',
  description: '설교대지 · 준비찬양 · 찬양대 자막을 예배용 프로그램으로 준비합니다.',
  applicationName: 'ULJU',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ULJU',
  },
  icons: {
    icon: [
      { url: '/icons/ulju-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/ulju-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/ulju-icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#6754d9',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <PwaInstallPrompt />
        {children}
      </body>
    </html>
  );
}
