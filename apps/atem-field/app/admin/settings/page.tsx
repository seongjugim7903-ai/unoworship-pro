import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminStatePanel } from '@/components/admin/AdminStatePanel';
import { getAdminSettings } from '@/features/admin/queries';

export const metadata: Metadata = {
  title: '설정 | UnoWorship Admin',
  description: 'UnoWorship 관리자 콘솔 설정입니다.',
};

export default async function AdminSettingsPage() {
  const result = await getAdminSettings();

  if (result.status === 'unauthenticated') {
    redirect('/login?redirectTo=/admin/settings');
  }

  if (result.status === 'forbidden') {
    return (
      <AdminStatePanel
        tone="amber"
        title="권한이 필요합니다"
        body="UnoWorship 최고관리자 계정만 설정 페이지를 볼 수 있습니다."
      />
    );
  }

  if (result.status === 'setup_required') {
    return (
      <AdminStatePanel
        tone="red"
        title="설정 데이터 조회 실패"
        body={result.message}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">Settings</p>
        <h1 className="mt-2 text-3xl font-black tracking-normal text-slate-950">설정</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          관리자 권한, 가입/체험 신청 정책, 향후 결제 연동 정책을 이곳에서 확장합니다.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SettingCard label="최고관리자" value={result.ownerName} detail={result.ownerEmail} />
        <SettingCard label="권한 등급" value={result.ownerRole} detail="전체 프로젝트 관리자 권한" />
        <SettingCard
          label="교회 소속"
          value={result.churchScoped ? '교회 소속 있음' : '전체 서비스 오너'}
          detail={result.churchScoped ? '교회 단위 권한으로 전환 필요 여부 확인' : '특정 교회에 종속되지 않습니다.'}
        />
        <SettingCard label="체험 기간" value="2개월" detail="신청 승인 시 교회 워크스페이스 구독에 자동 반영" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-black text-slate-950">추후 추가할 설정 메뉴</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <FutureSetting title="결제 연동" body="PG/구독 상태 확인, 결제 실패 정책" />
          <FutureSetting title="관리자 초대" body="운영자, 지원팀, 회계 권한 분리" />
          <FutureSetting title="도메인/메일" body="인증 메일, 리다이렉트 URL, 브랜드 발신자" />
        </div>
      </div>
    </div>
  );
}

function SettingCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="text-xs font-black text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-black text-slate-950">{value}</div>
      <div className="mt-1 text-sm font-semibold leading-6 text-slate-600">{detail}</div>
    </div>
  );
}

function FutureSetting({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="font-black text-slate-950">{title}</div>
      <div className="mt-1 leading-6 text-slate-600">{body}</div>
    </div>
  );
}
