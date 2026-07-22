import type { Metadata } from 'next';
import Link from 'next/link';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { UnoWorshipMarketingLayout } from '@/components/marketing/UnoWorshipMarketingLayout';

export const metadata: Metadata = {
  title: '구독 결제 | UnoWorship',
  description: 'UnoWorship 교회 워크스페이스 구독 결제 안내 페이지입니다.',
};

type CheckoutPageProps = {
  searchParams: Promise<{
    church?: string | string[];
    reason?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  const church = firstParam(params.church);
  const reason = firstParam(params.reason);
  const isTrialExpired = reason === 'trial-expired';

  return (
    <UnoWorshipMarketingLayout>
      <main className="min-h-screen bg-[#f7f8fb]">
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto grid max-w-5xl gap-8 px-5 py-14 md:grid-cols-[0.85fr_1.15fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                <ShieldCheck size={14} />
                구독 확인 필요
              </div>
              <h1 className="mt-5 text-4xl font-black tracking-normal text-slate-950">
                결제 후 워크스페이스를 계속 사용합니다
              </h1>
              <p className="mt-4 text-[15px] leading-7 text-slate-600">
                {isTrialExpired
                  ? '2개월 체험 기간이 종료되어 구독 결제 단계로 이동했습니다.'
                  : '교회 워크스페이스 사용을 위해 구독 상태 확인이 필요합니다.'}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-[#f7f8fb] p-6">
              <CreditCard className="h-6 w-6 text-teal-700" />
              <h2 className="mt-4 text-xl font-black text-slate-950">
                결제 연동 준비 영역
              </h2>
              <div className="mt-4 grid gap-3 text-sm">
                <Info label="교회 워크스페이스" value={church || '확인 필요'} />
                <Info label="상태" value={isTrialExpired ? '체험 기간 만료' : '구독 확인 필요'} />
                <Info label="다음 구현" value="PG/카드 결제 연동 후 Checkout Session으로 연결" />
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/pricing"
                  className="inline-flex h-10 items-center rounded-md bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"
                >
                  구독등급 보기
                </Link>
                <Link
                  href="/resources"
                  className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 hover:border-slate-500"
                >
                  도입 문의
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </UnoWorshipMarketingLayout>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs font-black text-slate-500">{label}</div>
      <div className="mt-1 font-bold text-slate-900">{value}</div>
    </div>
  );
}
