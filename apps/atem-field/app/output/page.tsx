'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import OutputCanvas from '@/components/output/OutputCanvas';
import FullscreenOverlay from '@/components/output/FullscreenOverlay'; // [FEATURE: FULLSCREEN]

function OutputPageInner() {
  const params = useSearchParams();
  // ?mirror=1 → 우측 패널 PGM 미러 등에서 embed 되는 모드
  //   - 풀스크린 요청 스킵 (iframe 안에서 requestFullscreen 불가)
  //   - 카메라 훅 스킵 (같은 Chrome 프로필 내 중복 getUserMedia 충돌 방지)
  const isMirror = params?.get('mirror') === '1';

  return (
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
      {!isMirror && <FullscreenOverlay />}
      <OutputCanvas isMirror={isMirror} />
    </main>
  );
}

export default function OutputPage() {
  return (
    <Suspense fallback={null}>
      <OutputPageInner />
    </Suspense>
  );
}
