import type { Subscription, SubscriptionPlan } from '@/lib/supabase/profileTypes';

export const CHURCH_SIGNUP_TRIAL_MONTHS = 2;

export interface ChurchTrialPeriod {
  startsAt: string;
  endsAt: string;
  months: number;
}

export type SubscriptionAccessState =
  | { status: 'missing' }
  | { status: 'active' }
  | { status: 'trial_active'; trialEndsAt: string }
  | { status: 'trial_expired'; trialEndsAt: string }
  | { status: 'expired'; expiredAt: string };

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function addCalendarMonths(date: Date, months: number): Date {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  next.setDate(Math.min(day, lastDayOfMonth(next.getFullYear(), next.getMonth())));
  return next;
}

export function createChurchTrialPeriod(startDate = new Date()): ChurchTrialPeriod {
  const startsAt = new Date(startDate);
  const endsAt = addCalendarMonths(startsAt, CHURCH_SIGNUP_TRIAL_MONTHS);

  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    months: CHURCH_SIGNUP_TRIAL_MONTHS,
  };
}

export function formatTrialDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatTrialPeriod(period: ChurchTrialPeriod): string {
  return `${formatTrialDate(period.startsAt)} ~ ${formatTrialDate(period.endsAt)}`;
}

export function getSubscriptionPlanLabel(plan: SubscriptionPlan | null | undefined): string {
  if (plan === 'church_pro') return 'Pro';
  if (plan === 'church_basic') return 'Plus';
  if (plan === 'personal_pro') return 'Creator Pro';
  if (plan === 'free') return 'Free';
  return '확인 필요';
}

export function getSubscriptionStatusLabel(subscription: Subscription | null | undefined): string {
  if (!subscription) return '구독 확인 필요';
  if (subscription.status === 'trial') {
    return subscription.trial_ends_at
      ? `체험 활성 · ${formatTrialDate(subscription.trial_ends_at)}까지`
      : '체험 활성';
  }
  if (subscription.status === 'active') {
    return subscription.expires_at
      ? `결제 완료 · ${formatTrialDate(subscription.expires_at)}까지`
      : '결제 완료 · 영구 활성';
  }
  if (subscription.status === 'past_due') return '결제 확인 필요';
  if (subscription.status === 'canceled') return '구독 취소';
  return '구독 만료';
}

export function getSubscriptionAccessState(
  subscription: Subscription | null | undefined,
  now = new Date()
): SubscriptionAccessState {
  if (!subscription) return { status: 'missing' };

  const nowTime = now.getTime();

  if (subscription.status === 'trial') {
    const trialEndsAt = subscription.trial_ends_at ?? subscription.expires_at;
    if (!trialEndsAt) return { status: 'trial_expired', trialEndsAt: now.toISOString() };
    return new Date(trialEndsAt).getTime() > nowTime
      ? { status: 'trial_active', trialEndsAt }
      : { status: 'trial_expired', trialEndsAt };
  }

  if (subscription.status === 'active') {
    if (!subscription.expires_at) return { status: 'active' };
    return new Date(subscription.expires_at).getTime() > nowTime
      ? { status: 'active' }
      : { status: 'expired', expiredAt: subscription.expires_at };
  }

  const expiredAt = subscription.expires_at ?? subscription.trial_ends_at ?? now.toISOString();
  return { status: 'expired', expiredAt };
}

export function getPaymentRedirectUrl(slug: string, reason: 'trial-expired' | 'subscription-required' = 'trial-expired'): string {
  const church = slug.startsWith('@') ? slug : `@${slug}`;
  const params = new URLSearchParams({
    church,
    reason,
  });
  return `/billing/checkout?${params.toString()}`;
}
