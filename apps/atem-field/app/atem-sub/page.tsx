'use client';

import AtemKeyCanvas from '@/components/atem-key/AtemKeyCanvas';
import FullscreenOverlay from '@/components/output/FullscreenOverlay';
import OutputRuntimeGuards from '@/components/output/OutputRuntimeGuards';

export default function AtemSubPage() {
  return (
    <main className="h-dvh w-screen overflow-hidden bg-black">
      <OutputRuntimeGuards />
      <FullscreenOverlay />
      <AtemKeyCanvas target="prompt" label="SUB / 중상층" />
    </main>
  );
}
