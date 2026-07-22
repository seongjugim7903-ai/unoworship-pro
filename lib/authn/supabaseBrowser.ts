'use client';

/**
 * lib/authn/supabaseBrowser.ts
 * 브라우저용 Supabase Auth 클라이언트.
 * 환경변수 미설정 시 null 을 반환해 페이지가 크래시하지 않게 한다.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createBrowserClient(url, anonKey);
}
