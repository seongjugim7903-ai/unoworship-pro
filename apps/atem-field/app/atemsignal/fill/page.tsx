'use client';

import AtemKeyCanvas from '@/components/atem-key/AtemKeyCanvas';
import FullscreenOverlay from '@/components/output/FullscreenOverlay';
import OutputRuntimeGuards from '@/components/output/OutputRuntimeGuards';

export default function AtemSignalFillPage() {
  return (
    <main className="h-dvh w-screen overflow-hidden bg-black">
      <OutputRuntimeGuards />
      <FullscreenOverlay />
      <AtemKeyCanvas target="output" label="ATEM FILL / Camera 4" signalMode="fill" />
    </main>
  );
}
