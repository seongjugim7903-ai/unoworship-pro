'use client';

import { useEffect, useState } from 'react';
import BroadcastDashboard from '@/components/media/broadcast/BroadcastDashboard';

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-gray-400">대시보드 로딩 중...</p>
      </div>
    );
  }
  // 다크 콘솔 배경 — 레이아웃은 라이트 모드이지만 관제 페이지만 다크로
  return (
    <div className="bg-[#0a0c10] min-h-[calc(100vh-56px-64px)]" style={{ colorScheme: 'dark' }}>
      <BroadcastDashboard />
    </div>
  );
}
