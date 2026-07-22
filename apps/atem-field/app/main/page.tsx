'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import OutputCanvas from '@/components/output/OutputCanvas';
import FullscreenOverlay from '@/components/output/FullscreenOverlay';

function MainOutputPageInner() {
  const params = useSearchParams();
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

export default function MainOutputPage() {
  return (
    <Suspense fallback={null}>
      <MainOutputPageInner />
    </Suspense>
  );
}
