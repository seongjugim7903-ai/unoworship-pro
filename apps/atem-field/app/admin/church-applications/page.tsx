import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminStatePanel } from '@/components/admin/AdminStatePanel';
import { ChurchApplicationAdminPanel } from '@/features/church-signup/components/ChurchApplicationAdminPanel';
import { getAdminChurchApplications } from '@/features/church-signup/queries';

export const metadata: Metadata = {
  title: '교회 신청 관리 | UnoWorship',
  description: 'UnoWorship 교회 가입 신청과 구독 승인을 관리합니다.',
};

export default async function ChurchApplicationsAdminPage() {
  const result = await getAdminChurchApplications();

  if (result.status === 'unauthenticated') {
    redirect('/login?redirectTo=/admin/church-applications');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">Trial</p>
          <h1 className="mt-2 text-3xl font-black tracking-normal text-slate-950">
            체험신청
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            교회 워크스페이스 신청 접수, 승인, 체험 기간 생성을 관리합니다.
          </p>
        </div>
        <Link
          href="/signup?redirectTo=%2Fsignup%2Fchurch"
          className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 hover:border-slate-500"
        >
          신청 페이지 보기
        </Link>
      </div>

      {result.status === 'forbidden' && (
        <AdminStatePanel
          tone="amber"
          title="권한이 필요합니다"
          body="superadmin 권한이 있는 계정만 교회 신청을 승인할 수 있습니다."
        />
      )}
      {result.status === 'setup_required' && (
        <AdminStatePanel
          tone="red"
          title="DB 스키마 확인 필요"
          body={result.message}
        />
      )}
      {result.status === 'ok' && <ChurchApplicationAdminPanel rows={result.rows} />}
    </div>
  );
}
