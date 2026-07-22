import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { UnoWorshipMarketingLayout } from '@/components/marketing/UnoWorshipMarketingLayout';
import { ChurchSignupForm } from '@/features/church-signup/components/ChurchSignupForm';
import type { ChurchSignupPlan } from '@/features/church-signup/types';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: '교회 가입 신청 | UnoWorship',
  description: 'UnoWorship 교회 워크스페이스와 구독 승인을 신청합니다.',
};

type ChurchSignupPageProps = {
  searchParams: Promise<{ plan?: string | string[]; verified?: string | string[] }>;
};

const signupPlans = new Set<ChurchSignupPlan>(['plus', 'pro', 'premium']);

function getRequestedPlan(value: string | string[] | undefined): { initialPlan: ChurchSignupPlan; lockPlan: boolean } {
  const plan = Array.isArray(value) ? value[0] : value;
  if (signupPlans.has(plan as ChurchSignupPlan)) {
    return { initialPlan: plan as ChurchSignupPlan, lockPlan: true };
  }
  return { initialPlan: 'plus', lockPlan: false };
}

export default async function ChurchSignupPage({ searchParams }: ChurchSignupPageProps) {
  const params = await searchParams;
  const { initialPlan, lockPlan } = getRequestedPlan(params.plan);
  const verified = (Array.isArray(params.verified) ? params.verified[0] : params.verified) === '1';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) {
    const planQuery = Array.isArray(params.plan) ? params.plan[0] : params.plan;
    const next = `/signup/church${planQuery ? `?plan=${encodeURIComponent(planQuery)}` : ''}`;
    redirect(`/signup?redirectTo=${encodeURIComponent(next)}`);
  }

  return (
    <UnoWorshipMarketingLayout>
      <main className="bg-[#f7f8fb]">
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-5 py-10">
            <Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-black text-slate-600 hover:text-slate-950">
              <ArrowLeft size={16} />
              프라이싱으로 돌아가기
            </Link>
            <div className="mt-8 grid gap-8 lg:grid-cols-[0.86fr_1.14fr]">
              <div>
                {verified && (
                  <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                    이메일 인증이 완료되었습니다. 이제 교회 정보를 입력해 2개월 체험 신청을 이어갈 수 있습니다.
                  </div>
                )}
                <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-black text-teal-700">
                  <ShieldCheck size={14} />
                  교회 워크스페이스 신청
                </div>
                <h1 className="mt-5 text-4xl font-black tracking-normal text-slate-950 md:text-5xl">
                  교회 전용 워크스페이스 주소를 예약합니다
                </h1>
                <p className="mt-4 max-w-xl text-[15px] leading-7 text-slate-600">
                  현재 로그인된 계정으로 app.unoworship.kr/@ulju 같은 희망 주소를 신청합니다. 관리자가 구독 상태를 확인하고 승인하면 교회 전용 워크스페이스와 2개월 체험 기간이 열립니다.
                </p>
                <div className="mt-6 grid gap-3 text-sm text-slate-700">
                  <Step title="1. 계정 인증" body="회원가입 후 이메일 인증으로 담당자 계정을 먼저 확정합니다." />
                  <Step title="2. 신청" body="로그인 상태에서 교회 기본 정보, 희망 주소, 저작권 사용 책임 동의를 등록합니다." />
                  <Step title="3. 워크스페이스 활성화" body="승인 후 app.unoworship.kr/@slug 주소와 체험 기간이 사용 가능해집니다." />
                </div>
              </div>
              <ChurchSignupForm initialPlan={initialPlan} lockPlan={lockPlan} currentUserEmail={user.email} />
            </div>
          </div>
        </section>
      </main>
    </UnoWorshipMarketingLayout>
  );
}

function Step({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-[#f7f8fb] p-4">
      <div className="font-black text-slate-950">{title}</div>
      <div className="mt-1 leading-6 text-slate-600">{body}</div>
    </div>
  );
}
