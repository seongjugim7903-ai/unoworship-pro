'use client';

import { useState, useEffect } from 'react';
import CanvasLayout from './components/CanvasLayout';

/**
 * Hydration 가드: canvasStore가 persist(localStorage)를 사용하므로
 * 서버 렌더링과 클라이언트 렌더링 결과가 다를 수 있음.
 * mounted 후에만 실제 레이아웃을 렌더하여 불일치 방지.
 */
export default function CanvasEditorPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-full bg-[#f0f0f0]">
        <p className="text-sm text-gray-400">로딩 중...</p>
      </div>
    );
  }

  return <CanvasLayout />;
}
