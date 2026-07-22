/**
 * lib/authn/supabaseAuth.ts
 * Supabase Auth 서버 클라이언트 (세션 쿠키 기반 + 관리자)
 *
 * 디바이스 인증(로그인/토큰 발급/검증)을 위한 모듈.
 * 기존 lib/supabase/server.ts(REST/Storage 래퍼)와는 별개다.
 *
 * 필요 환경변수 (Vercel):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY  — 로그인 세션
 *   SUPABASE_SERVICE_ROLE_KEY                                — 관리자 (기존 등록됨)
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function isAuthConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function supabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
}

/** 로그인 사용자 세션 클라이언트 (쿠키 기반) */
export async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component 호출 시 무시
        }
      },
    },
  });
}

/** service role 관리자 클라이언트 — 서버 route handler 전용 */
export function createAdminClient() {
  return createServerClient(supabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {},
    },
  });
}

export function authNotConfiguredResponse() {
  return {
    error: 'auth_not_configured',
    message:
      '인증 환경변수가 없습니다. Vercel에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 등록해 주세요.',
  };
}
