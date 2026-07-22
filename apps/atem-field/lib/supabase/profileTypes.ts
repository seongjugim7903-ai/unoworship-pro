/**
 * lib/supabase/profileTypes.ts
 * profiles / subscriptions 공통 테이블 타입 정의
 *
 * UnoLive 와 community-app 이 공유하는 스키마.
 * community-app 에도 복사하여 동일 타입 사용.
 */

export type UserRole = 'member' | 'crew' | 'admin' | 'superadmin';

export type UserSource = 'community' | 'unolive' | 'invite';

export interface Profile {
  id: string;                  // = auth.users.id
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  bio: string | null;
  role: UserRole;
  church_id: string | null;
  source: UserSource;
  created_at: string;
  updated_at: string;
}

export type SubscriptionPlan =
  | 'free'
  | 'personal_pro'
  | 'church_basic'
  | 'church_pro';

export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'canceled'
  | 'expired'
  | 'past_due';

export interface Subscription {
  id: string;
  user_id: string;
  church_id?: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  started_at: string | null;
  expires_at: string | null;
  trial_ends_at: string | null;
  payment_provider: string | null;
  payment_customer_id: string | null;
  latest_payment_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * 현재 활성 구독 판별 헬퍼
 */
export function isSubscriptionActive(sub: Subscription | null | undefined): boolean {
  if (!sub) return false;
  if (sub.status !== 'active' && sub.status !== 'trial') return false;
  if (sub.expires_at && new Date(sub.expires_at) < new Date()) return false;
  return true;
}
