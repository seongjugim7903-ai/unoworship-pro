'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';

type MarketingUserContext = {
  email: string;
  name: string;
  role: string;
  churchName: string | null;
  churchSlug: string | null;
  isGlobalOwner: boolean;
};

export function MarketingAuthNav() {
  const [user, setUser] = useState<MarketingUserContext | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    async function loadUser() {
      const supabase = createClient();
      if (!supabase) {
        setUser(null);
        setLoaded(true);
        return;
      }
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!alive) return;

      if (!authUser?.email) {
        setUser(null);
        setLoaded(true);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, church_id')
        .eq('id', authUser.id)
        .maybeSingle();

      let churchName: string | null = null;
      let churchSlug: string | null = null;
      if (profile?.church_id) {
        const { data: church } = await supabase
          .from('churches')
          .select('name, slug')
          .eq('id', profile.church_id)
          .maybeSingle();
        churchName = church?.name ?? null;
        churchSlug = church?.slug ?? null;
      }

      const role = profile?.role ?? String(authUser.user_metadata?.role ?? 'member');

      setUser({
        email: authUser.email,
        name: profile?.full_name || String(authUser.user_metadata?.full_name ?? authUser.email.split('@')[0]),
        role,
        churchName,
        churchSlug,
        isGlobalOwner: role === 'superadmin' || authUser.app_metadata?.global_owner === true,
      });
      setLoaded(true);
    }

    loadUser();

    return () => {
      alive = false;
    };
  }, []);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);

    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut({ scope: 'global' });
    }
    setUser(null);
    setLoaded(true);
    router.push('/');
    router.refresh();
  }

  if (!loaded || !user) {
    return (
      <>
        <Link
          href="/login"
          className="hidden rounded-md px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-950 sm:inline-flex"
        >
          로그인
        </Link>
        <Link
          href="/signup?redirectTo=%2Fsignup%2Fchurch"
          className="hidden h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-[13px] font-black text-slate-800 hover:border-slate-500 lg:inline-flex"
        >
          교회 가입
        </Link>
      </>
    );
  }

  const roleLabel = user.isGlobalOwner
    ? '전체 관리자'
    : user.role === 'admin'
      ? '관리자'
      : user.role === 'crew'
        ? '크루'
        : '사용자';
  const targetHref = user.isGlobalOwner
    ? '/admin'
    : user.churchSlug
      ? `/@${user.churchSlug}`
      : '/';
  const targetLabel = user.isGlobalOwner ? '관리자' : user.churchSlug ? '워크스페이스' : '홈';

  return (
    <div className="hidden items-center gap-2 sm:flex">
      <div className="flex max-w-[240px] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-teal-700">
          {user.isGlobalOwner ? <ShieldCheck size={14} /> : <UserRound size={14} />}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[12px] font-black text-slate-950">{user.name}</span>
          <span className="block truncate text-[10px] font-bold text-slate-500">
            {roleLabel}
            {user.churchName ? ` · ${user.churchName}` : ''}
          </span>
        </span>
      </div>
      <Link
        href={targetHref}
        className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-[13px] font-black text-slate-800 hover:border-slate-500"
      >
        {targetLabel}
      </Link>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-[13px] font-black text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:cursor-wait disabled:opacity-60"
        title="로그아웃"
      >
        {signingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
        로그아웃
      </button>
    </div>
  );
}
