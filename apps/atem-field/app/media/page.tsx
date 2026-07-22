'use client';

/**
 * app/media/page.tsx
 * UnoMedia 루트 — 인증 상태에 따라 분기
 *
 * 미들웨어에서 미인증 사용자는 /login으로 리다이렉트하므로
 * 여기 도착하면 항상 인증된 사용자입니다.
 * AuthProvider(전역)가 Zustand authMode를 자동 동기화합니다.
 */

import { useEffect, useState } from 'react';
import { useMediaStore } from '@/lib/media/mediaStore';
import { useAuthContext } from '@/lib/auth/AuthProvider';
import WorkspaceHome from '@/components/media/workspace/WorkspaceHome';
import GuestWelcome from '@/components/media/workspace/GuestWelcome';

export default function MediaRoot() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { isLoading } = useAuthContext();
  const authMode = useMediaStore((s) => s.authMode);

  if (!mounted || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-gray-400">UnoMedia 로딩 중...</p>
      </div>
    );
  }

  if (authMode === 'guest') {
    return <GuestWelcome />;
  }

  return <WorkspaceHome />;
}
