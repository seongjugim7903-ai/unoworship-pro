/**
 * app/prompt/layout.tsx
 * 프롬프트 모니터 전용 레이아웃 (무대 찬양팀용)
 *
 * - 서버 PC 의 확장 모니터(LG FULL HD #1: 프롬프트) 에 표시할 전체 화면 창
 * - 최종 PGM (교인이 강대상 모니터에서 보는 것과 동일한 영상) 을 1:1 미러
 * - prompt-manifest.json 참조 (display: fullscreen)
 * - 스크롤바/커서/선택 전부 제거 — output 레이아웃과 동일 톤
 *
 * [FEATURE: PROMPT_MONITOR]
 */

import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'UnoLive Prompt',
  description: '교회 예배 프롬프트 모니터 — 무대 찬양팀 최종 PGM 미러',
  manifest: '/prompt-manifest.json',
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
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function PromptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        /* 프롬프트 페이지 전용 전역 스타일 — output 과 동일 */
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
