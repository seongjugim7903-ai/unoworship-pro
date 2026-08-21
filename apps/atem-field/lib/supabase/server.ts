import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database.types';

// 클라우드 키는 없을 수 있다 — 현장 단독 설치는 Supabase 를 쓰지 않는다.
// 예전에는 `!` 로 단언해 @supabase/ssr 이 그 자리에서 던졌고, 인증을 확인하려던
// 라우트가 401 대신 500 으로 죽었다(/api/atem, /api/health).
// 없으면 null 을 돌려주고 부르는 쪽이 '로그인 안 됨'과 같게 다루도록 한다.
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * 클라우드가 있을 때만 클라이언트를, 없으면 null.
 * 인증 확인처럼 "없으면 그냥 미인증"으로 넘어가야 하는 곳에서 쓴다.
 */
export async function createClientOrNull() {
  if (!isSupabaseConfigured()) return null;
  return createClient();
}

/** 클라우드 전용 기능(교회 가입·기기 토큰 등)에서 쓴다 — 없으면 그 기능 자체가 성립하지 않는다 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서 호출된 경우: middleware가 처리
          }
        },
      },
    }
  );
}

export function createAdminClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return []; },
        setAll() {},
      },
    }
  );
}

export async function getCurrentUser() {
  const supabase = await createClientOrNull();
  /* 클라우드가 없으면 계정도 없다 — 미로그인과 같다 */
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user;
}
