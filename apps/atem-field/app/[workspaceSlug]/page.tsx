import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import MediaTopBar from '@/components/media/layout/MediaTopBar';
import WorkspaceHome from '@/components/media/workspace/WorkspaceHome';
import { getChurchWorkspaceAccess } from '@/features/church-signup/queries';

export const metadata: Metadata = {
  title: '교회 워크스페이스 | UnoWorship',
  description: '승인된 교회 전용 UnoWorship 운영 워크스페이스입니다.',
};

export default async function ChurchWorkspacePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const access = await getChurchWorkspaceAccess(decodeURIComponent(workspaceSlug));

  if (access.status === 'invalid_slug') {
    notFound();
  }

  if (access.status === 'unauthenticated') {
    redirect(`/login?redirectTo=/${encodeURIComponent(workspaceSlug)}`);
  }

  if (access.status === 'payment_required') {
    redirect(access.paymentUrl);
  }

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] text-gray-900 flex flex-col" style={{ colorScheme: 'light' }}>
      {access.status === 'ok' ? (
        <>
          <MediaTopBar />
          <div className="flex-1 min-h-0">
            <WorkspaceHome />
          </div>
        </>
      ) : (
        <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-5">
          <WorkspaceBlocked access={access} />
        </main>
      )}
    </div>
  );
}

function WorkspaceBlocked({ access }: { access: Exclude<Awaited<ReturnType<typeof getChurchWorkspaceAccess>>, { status: 'ok' | 'invalid_slug' | 'unauthenticated' | 'payment_required' }> }) {
  const title =
    access.status === 'not_found'
      ? '아직 생성되지 않은 교회 주소입니다'
      : access.status === 'not_member'
        ? '이 교회 워크스페이스 멤버가 아닙니다'
        : access.status === 'subscription_required'
          ? '구독 승인이 필요합니다'
          : 'DB 스키마 확인이 필요합니다';

  const body =
    access.status === 'setup_required'
      ? access.message
      : '교회 신청과 구독 승인 상태를 확인한 뒤 다시 접속해 주세요.';

  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-[#f7f8fb] p-8 text-center">
      <LockKeyhole className="mx-auto h-9 w-9 text-slate-500" />
      <h1 className="mt-4 text-2xl font-black text-slate-950">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
      <Link
        href="/signup?redirectTo=%2Fsignup%2Fchurch"
        className="mt-6 inline-flex h-10 items-center rounded-md bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"
      >
        교회 가입 신청
      </Link>
    </div>
  );
}
