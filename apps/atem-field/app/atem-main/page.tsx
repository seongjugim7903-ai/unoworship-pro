'use client';

import AtemKeyCanvas from '@/components/atem-key/AtemKeyCanvas';
import FullscreenOverlay from '@/components/output/FullscreenOverlay';
import OutputRuntimeGuards from '@/components/output/OutputRuntimeGuards';

export default function AtemMainPage() {
  return (
    <main className="h-dvh w-screen overflow-hidden bg-black">
      <OutputRuntimeGuards />
      <FullscreenOverlay />
      <AtemKeyCanvas target="output" label="MAIN / 강대상" />
    </main>
  );
}
