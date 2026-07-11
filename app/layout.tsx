// 루트 레이아웃 — 전역 메타·기본 스타일 (Phase 0 최소, UI는 Phase 2에서 새 디자인)

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'UnoWorship Pro · 찬양대 자막 요청',
  description: '찬양대 가사를 예배용 자막 이미지로 만들어 공유합니다.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
