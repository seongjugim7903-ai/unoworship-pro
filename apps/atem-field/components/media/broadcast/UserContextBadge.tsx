'use client';

/**
 * UserContextBadge — 대시보드 상단 유틸 바에 들어가는
 * "누가 · 어느 교회 · 무슨 플랜" 요약 배지.
 *
 * 데이터 소스:
 *   - public.profiles  (full_name, role, church_id, source)
 *   - public.churches  (name)
 *   - public.subscriptions (plan, status, expires_at)
 *
 * 읽기 전용. 모두 optional — 데이터 없으면 해당 부분만 생략.
 */

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { Profile, Subscription } from '@/lib/supabase/profileTypes';
import { isSubscriptionActive } from '@/lib/supabase/profileTypes';
import {
  getSubscriptionPlanLabel,
  getSubscriptionStatusLabel,
} from '@/features/church-signup/trialPeriod';

interface Context {
  profile: Profile | null;
  churchName: string | null;
  subscription: Subscription | null;
}

const ROLE_LABEL: Record<string, string> = {
  member: '멤버',
  crew: '크루',
  admin: '관리자',
  superadmin: '슈퍼관리자',
};

export default function UserContextBadge() {
  const [ctx, setCtx] = useState<Context>({
    profile: null,
    churchName: null,
    subscription: null,
  });

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      // 2. church name (있을 때만)
      let churchName: string | null = null;
      if (profile?.church_id) {
        const { data: church } = await supabase
          .from('churches')
          .select('name')
          .eq('id', profile.church_id)
          .maybeSingle();
        churchName = church?.name ?? null;
      }

      // 3. 활성 구독
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['active', 'trial'])
        .order('expires_at', { ascending: false, nullsFirst: false })
        .limit(1);
      const sub = (subs?.[0] as Subscription | undefined) ?? null;

      setCtx({
        profile: profile as Profile | null,
        churchName,
        subscription: isSubscriptionActive(sub) ? sub : null,
      });
    })();
  }, []);

  if (!ctx.profile) return null;

  const { profile, churchName, subscription } = ctx;
  const name = profile.full_name?.trim() || '사용자';
  const planLabel = getSubscriptionPlanLabel(subscription?.plan);
  const isTrial = subscription?.status === 'trial';

  return (
    <div className="flex items-center gap-1.5">
      {/* 교회 */}
      {churchName && (
        <span className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-white/5 border border-white/10 text-[11px] text-gray-200">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 21h18" />
            <path d="M5 21V7l7-4 7 4v14" />
            <path d="M10 12h4" />
            <path d="M12 10v4" />
          </svg>
          <span className="font-semibold">{churchName}</span>
        </span>
      )}

      {/* 이름 + 역할 */}
      <span className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md bg-white/5 border border-white/10 text-[11px] text-gray-200">
        <span className="font-semibold text-white">{name}</span>
        <span className="text-gray-400">·</span>
        <span className={profile.role === 'superadmin' || profile.role === 'admin'
          ? 'text-violet-300 font-semibold'
          : 'text-gray-400'}>
          {ROLE_LABEL[profile.role] ?? profile.role}
        </span>
      </span>

      {/* 플랜 배지 */}
      <span
        className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-bold ${
          subscription
            ? 'bg-gradient-to-r from-violet-600/30 to-fuchsia-600/30 border border-violet-400/40 text-violet-200'
            : 'bg-white/5 border border-white/10 text-gray-400'
        }`}
        title={
          subscription
            ? getSubscriptionStatusLabel(subscription)
            : '무료 플랜 - 구독 시 전체 기능 이용 가능'
        }
      >
        {subscription && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2 9.2 8.6 2 9.3l5.5 4.7L5.8 21 12 17.3 18.2 21l-1.7-7 5.5-4.7-7.2-.7z" />
          </svg>
        )}
        {planLabel}
        {isTrial && <span className="text-[9px] text-amber-300 font-normal">(체험)</span>}
      </span>
    </div>
  );
}
