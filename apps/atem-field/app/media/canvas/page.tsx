'use client';

import { useEffect, useState } from 'react';
import CanvasEntryPage from '@/components/media/canvas/CanvasEntryPage';

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-gray-400">캔버스 허브 로딩 중...</p>
      </div>
    );
  }
  return <CanvasEntryPage />;
}
