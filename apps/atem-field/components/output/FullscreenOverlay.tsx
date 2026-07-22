'use client';

/**
 * components/output/FullscreenOverlay.tsx
 * 아웃풋 페이지 자동 전체화면 요청
 *
 * [FEATURE: FULLSCREEN]
 * 동작:
 *   - Chrome --kiosk 모드 (mac-output-kiosk.sh) : 이미 전체화면이므로 아무것도 안 함
 *   - 일반 브라우저에서 수동 접속 시 : requestFullscreen() 자동 시도 (무음 실패 허용)
 *   - ESC로 전체화면 해제 시 → 조용히 재시도 (클릭 안내 없음)
 *
 * 클릭 요구 프롬프트를 제거한 이유:
 *   실 운영은 --kiosk 스크립트로 자동 실행되므로 사용자 개입 불필요.
 *   혹시 일반 브라우저로 접속하더라도 주소창이 보일 뿐 동작에는 지장 없음.
 */

import { useEffect, useCallback } from 'react';

export default function FullscreenOverlay() {
  const enterFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      // 일반 브라우저에서 제스처 없이 실패해도 무시 — kiosk 모드에서는 불필요
    }
  }, []);

  useEffect(() => {
    // 마운트 즉시 조용히 시도
    enterFullscreen();

    // ESC 해제 후 자동 재시도
    const handleChange = () => {
      if (!document.fullscreenElement) {
        setTimeout(enterFullscreen, 500);
      }
    };

    document.addEventListener('fullscreenchange', handleChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
    };
  }, [enterFullscreen]);

  // UI 없음 — 순수 사이드이펙트 컴포넌트
  return null;
}
