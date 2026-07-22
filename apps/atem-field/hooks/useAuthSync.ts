'use client';

import { useEffect } from 'react';
import { createClient, onAuthStateChange } from '@/lib/supabase/browser';
import { useMediaStore } from '@/lib/media/mediaStore';

/**
 * Supabase 인증 상태 → Zustand authMode 동기화 훅
 *
 * Supabase에 로그인되어 있으면 authMode를 'member'로,
 * 로그아웃 상태면 'guest'로 설정합니다.
 */
export function useAuthSync() {
  const setAuthMode = useMediaStore((s) => s.setAuthMode);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    // Supabase 미설정 — 게스트로 두고 구독하지 않음
    if (!supabase) {
      setAuthMode('guest');
      return () => {
        mounted = false;
      };
    }

    // 초기 상태 동기화
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mounted) return;
      setAuthMode(user ? 'member' : 'guest');
    });

    // 인증 상태 변화 구독
    const unsubscribe = onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_IN' && session?.user) {
        setAuthMode('member');
      } else if (event === 'SIGNED_OUT') {
        setAuthMode('guest');
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [setAuthMode]);
}
