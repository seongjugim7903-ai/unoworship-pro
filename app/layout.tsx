// 루트 레이아웃 — 전역 메타·기본 스타일 (Phase 0 최소, UI는 Phase 2에서 새 디자인)

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'UnoWorship Pro',
  description: '교회 예배 자막·화면 송출 시스템 — 제품화 버전',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          background: '#0b0d12',
          color: '#e8ebf2',
          fontFamily: "'Apple SD Gothic Neo','Noto Sans KR',system-ui,sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
