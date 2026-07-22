'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';

export function createClient() {
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
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event as any, session);
  });
  return () => { subscription?.unsubscribe(); };
}
