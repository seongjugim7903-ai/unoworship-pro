'use client';

import type { ReactNode } from 'react';

export default function LocalRuntimeLoginOverlay({ children }: { children: ReactNode }) {
  // [ATEM FIELD MODE]
  // 현장 복사본에서는 Composer, 카메라 릴레이, Broadcast, Output/Prompt 페이지 위에
  // Local Runtime 로그인 오버레이가 뜨지 않도록 완전히 비활성화한다.
  // Supabase 세션 확인 폴링도 실행하지 않는다.
  return <>{children}</>;
}
