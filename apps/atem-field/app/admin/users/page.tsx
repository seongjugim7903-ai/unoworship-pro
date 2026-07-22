import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Mail, UserRound } from 'lucide-react';
import { AdminStatePanel } from '@/components/admin/AdminStatePanel';
import { getAdminSimpleUsers } from '@/features/admin/queries';

export const metadata: Metadata = {
  title: '회원관리 | UnoWorship Admin',
  description: 'UnoWorship 단순 가입자 계정을 관리합니다.',
};

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function AdminUsersPage() {
  const result = await getAdminSimpleUsers();

  if (result.status === 'unauthenticated') {
    redirect('/login?redirectTo=/admin/users');
  }

  if (result.status === 'forbidden') {
    return (
      <AdminStatePanel
        tone="amber"
        title="권한이 필요합니다"
        body="UnoWorship 최고관리자 계정만 회원관리 페이지를 볼 수 있습니다."
      />
    );
  }

  if (result.status === 'setup_required') {
    return (
      <AdminStatePanel
        tone="red"
        title="관리 데이터 조회 실패"
        body={result.message}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">Members</p>
          <h1 className="mt-2 text-3xl font-black tracking-normal text-slate-950">회원관리</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            교회 워크스페이스에 아직 연결되지 않은 단순 가입자를 확인합니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Metric label="전체 가입자" value={`${result.totalUsers.toLocaleString('ko-KR')}명`} />
          <Metric label="단순 가입자" value={`${result.simpleUsers.toLocaleString('ko-KR')}명`} />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr] border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black text-slate-500">
          <span>사용자</span>
          <span>가입일</span>
          <span>최근 로그인</span>
        </div>

        {result.rows.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold text-slate-500">
            단순 가입자가 없습니다.
          </div>
        ) : (
          result.rows.map((user) => (
            <div
              key={user.id}
              className="grid grid-cols-[1.4fr_0.8fr_0.8fr] items-center border-b border-slate-100 px-4 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600">
                  <UserRound size={17} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-slate-950">
                    {user.fullName || user.email}
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs font-semibold text-slate-500">
                    <Mail size={12} />
                    <span className="truncate">{user.email}</span>
                    <span className={user.emailConfirmed ? 'text-emerald-600' : 'text-amber-600'}>
                      {user.emailConfirmed ? '인증' : '미인증'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-xs font-semibold text-slate-600">{formatDate(user.createdAt)}</div>
              <div className="text-xs font-semibold text-slate-600">{formatDate(user.lastSignInAt)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-black text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-black text-slate-950">{value}</div>
    </div>
  );
}
