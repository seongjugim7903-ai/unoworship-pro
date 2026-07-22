/**
 * app/output/layout.tsx
 * PC1 아웃풋 전용 레이아웃
 *
 * - output-manifest.json 참조 (display: fullscreen)
 * - 스크롤바 완전 제거, 커서 숨김
 * - 자동 전체화면 시도 (PWA 설치 시 manifest가 자동 fullscreen)
 * - 부모 layout.tsx 의 manifest 를 output 전용으로 오버라이드
 */

import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'UnoLive Output',
  description: '교회 예배 실시간 자막 송출 화면',
  manifest: '/output-manifest.json',
  // 브라우저 주소창 / 상태바 색상 제거
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  // 노치/상태바 영역까지 화면 확장
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function OutputLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        /* 아웃풋 페이지 전용 전역 스타일 */
        body {
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background: #000 !important;
          cursor: none !important;
        }
        * {
          -webkit-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        ::-webkit-scrollbar { display: none; }
      `}</style>
      {children}
    </>
  );
}
