'use client';

import PromptCanvas from '@/components/prompt/PromptCanvas';
import FullscreenOverlay from '@/components/output/FullscreenOverlay';

export default function SubOutputPage() {
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
      <FullscreenOverlay />
      <PromptCanvas />
    </main>
  );
}
