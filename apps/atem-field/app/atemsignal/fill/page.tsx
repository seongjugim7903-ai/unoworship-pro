'use client';

import AtemKeyCanvas from '@/components/atem-key/AtemKeyCanvas';
import FullscreenOverlay from '@/components/output/FullscreenOverlay';
import OutputRuntimeGuards from '@/components/output/OutputRuntimeGuards';

export default function AtemSignalFillPage() {
  return (
    <main className="h-dvh w-screen overflow-hidden bg-black">
      <OutputRuntimeGuards />
      <FullscreenOverlay />
      {/* [YT_AUDIO_SINGLE] 유튜브 오디오는 이 창에서만 나간다 (2026-07-28 현장 확인).
          이 창의 HDMI → ATEM Camera 4 입력 → PGM → 회중 스피커. 오디오가 영상과
          같은 신호를 타고 가므로 싱크가 어긋나지 않는다.
          다른 출력 페이지는 전부 음소거 — 옮길 땐 여기서 떼고 옮길 것. */}
      <AtemKeyCanvas target="output" label="ATEM FILL / Camera 4" signalMode="fill" audio />
    </main>
  );
}
