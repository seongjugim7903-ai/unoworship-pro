'use client';

/**
 * app/prompt/page.tsx
 * 프롬프트 모니터 페이지 (무대 찬양팀이 보는 최종 PGM 미러)
 *
 * [FEATURE: PROMPT_MONITOR]
 *
 * - /output 과 동일한 Socket.io 피드를 받아 동일한 PGM 을 1:1 로 렌더
 * - 차이점: WebRTC 퍼블리셔 없음 (Output 한 곳에서만 송출)
 * - 무대 쪽 찬양팀 모니터에 전체 화면으로 띄워 사용
 */

import PromptCanvas from '@/components/prompt/PromptCanvas';
import FullscreenOverlay from '@/components/output/FullscreenOverlay'; // [FEATURE: FULLSCREEN]

export default function PromptPage() {
  return (
    // 화면 전체를 꽉 채우는 컨테이너 — 스크롤/여백 완전 제거
    <main
      className="bg-black overflow-hidden cursor-none"
      style={{
        width: '100vw',
        height: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* [FEATURE: FULLSCREEN] 자동 전체화면 요청 — 브라우저 주소창 제거 */}
      <FullscreenOverlay />
      <PromptCanvas />
    </main>
  );
}
