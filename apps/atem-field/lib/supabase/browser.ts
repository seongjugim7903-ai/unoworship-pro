'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// 현장 자막 프로그램은 클라우드 설정이 없어도 부팅되어야 한다 (오프라인 우선).
// Supabase env 미설정 시 클라이언트 생성 대신 null 을 돌려주고,
// 호출부는 게스트(클라우드 비활성) 모드로 동작한다.
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

let warned = false;

export function createClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) {
    if (!warned) {
      warned = true;
      console.warn(
        '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 미설정 — 클라우드 기능 없이 게스트 모드로 동작합니다.'
      );
    }
    return null;
  }
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function onAuthStateChange(
  callback: (
    event: 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | 'TOKEN_REFRESHED' | 'USER_UPDATED',
    session: any | null
  ) => void
): () => void {
  const supabase = createClient();
  if (!supabase) {
    callback('INITIAL_SESSION', null);
    return () => {};
  }
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event as any, session);
  });
  return () => { subscription?.unsubscribe(); };
}
