'use client';

import { useEffect, useState } from 'react';
import BroadcastLibraryPage from '@/components/media/broadcast/BroadcastLibraryPage';

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-gray-400">라이브러리 로딩 중...</p>
      </div>
    );
  }
  return (
    <div className="bg-[#0a0c10] min-h-[calc(100vh-56px-64px)]" style={{ colorScheme: 'dark' }}>
      <BroadcastLibraryPage />
    </div>
  );
}
