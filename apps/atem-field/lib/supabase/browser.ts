'use client';

// 브라우저용 Supabase 클라이언트.
//
// 키(NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY)는 없을 수 있다 — 현장 전용 오프라인
// 설치에서는 클라우드를 아예 쓰지 않는다(.env.example 참조). 예전에는 `!` 로
// 있다고 단언해서, 키가 없으면 게스트 모드로 떨어지는 대신 앱 전체가 죽었다.
// 없으면 null 을 돌려주고 부르는 쪽이 클라우드 기능만 접도록 한다.

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';

/** 클라우드(로그인·교회 데이터)를 쓸 수 있는 설치인가 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** 클라우드가 구성되지 않은 설치에서는 null — 부르는 쪽이 게스트로 처리한다 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createBrowserClient<Database>(url, anonKey);
}

export function onAuthStateChange(
  callback: (
    event: 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | 'TOKEN_REFRESHED' | 'USER_UPDATED',
    session: any | null
  ) => void
): () => void {
  const supabase = createClient();
  /* 클라우드가 없으면 상태 변화도 없다 — 아무 것도 하지 않는 해지 함수를 준다 */
  if (!supabase) return () => {};
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event as any, session);
  });
  return () => { subscription?.unsubscribe(); };
}
