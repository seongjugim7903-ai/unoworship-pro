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
      <head>
        {/* 설치 기회를 놓치지 않으려고 React 보다 먼저 잡아 둔다.
            Chrome 은 beforeinstallprompt 를 페이지가 뜨자마자 한 번 쏘고 만다.
            useEffect 로 리스너를 붙이면 하이드레이션 전에 이미 지나가 버려서
            설치 버튼이 영영 안 나타난다 — 여기서 받아 두고 컴포넌트가 꺼내 쓴다. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){window.__uljuInstall=null;`
              + `window.addEventListener('beforeinstallprompt',function(e){`
              + `e.preventDefault();window.__uljuInstall=e;`
              + `window.dispatchEvent(new Event('ulju:installable'));});`
              + `window.addEventListener('appinstalled',function(){`
              + `window.__uljuInstall=null;`
              + `window.dispatchEvent(new Event('ulju:installed'));});})();`,
          }}
        />
      </head>
      <body>
        <PwaInstallPrompt />
        {children}
      </body>
    </html>
  );
}
