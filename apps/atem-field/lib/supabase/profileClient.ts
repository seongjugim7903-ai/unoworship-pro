/**
 * lib/supabase/profileClient.ts
 * profiles / subscriptions 조회·갱신 헬퍼
 *
 * 클라이언트 컴포넌트에서 사용. 서버 컴포넌트에서는
 * @supabase/ssr 의 createServerClient 를 직접 사용.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Profile, Subscription } from './profileTypes';
import { isSubscriptionActive } from './profileTypes';

/** 브라우저 Supabase 클라이언트 — 필요 시 재사용 */
function getClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * 현재 로그인된 사용자의 profile 조회.
 * 미로그인이면 null.
 */
export async function fetchMyProfile(): Promise<Profile | null> {
  const supabase = getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.warn('[fetchMyProfile] error:', error.message);
    return null;
  }
  return data as Profile | null;
}

/**
 * 본인 profile 갱신.
 * role / church_id 는 서버 API 에서 권한 체크 후 갱신하는 것이 안전.
 * 여기서는 full_name / avatar_url / phone / bio 정도만 권장.
 */
export async function updateMyProfile(
  patch: Partial<Pick<Profile, 'full_name' | 'avatar_url' | 'phone' | 'bio'>>,
): Promise<Profile | null> {
  const supabase = getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select()
    .single();

  if (error) {
    console.warn('[updateMyProfile] error:', error.message);
    return null;
  }
  return data as Profile;
}

/**
 * 현재 유저의 활성 구독 조회.
 * 만료 or canceled 면 null. 플랜 배지/게이트 판정용.
 */
export async function fetchMyActiveSubscription(): Promise<Subscription | null> {
  const supabase = getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .in('status', ['active', 'trial'])
    .order('expires_at', { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) {
    console.warn('[fetchMyActiveSubscription] error:', error.message);
    return null;
  }
  const sub = (data?.[0] as Subscription | undefined) ?? null;
  return isSubscriptionActive(sub) ? sub : null;
}
