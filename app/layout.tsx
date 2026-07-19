// 루트 레이아웃 — 전역 메타·기본 스타일 (Phase 0 최소, UI는 Phase 2에서 새 디자인)

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import PwaInstallPrompt from './pwa/PwaInstallPrompt';
import './globals.css';

export const metadata: Metadata = {
  title: 'UnoWorship Pro · 찬양대 자막 요청',
  description: '찬양대 가사를 예배용 자막 이미지로 만들어 공유합니다.',
  applicationName: 'Hephzibah Choir',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Hephzibah',
  },
  icons: {
    icon: [
      { url: '/icons/hephzibah-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/hephzibah-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/hephzibah-icon-192.png', sizes: '192x192', type: 'image/png' }],
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
