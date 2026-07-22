'use client';

/**
 * WorkspaceHome — /media 로그인 직후 "집" 페이지
 *
 * 이 페이지 자체는 작업 공간이 아니라 "현재 상태 요약 + 네 개의 앱으로 진입"
 * 을 위한 허브입니다.
 *
 * 구성:
 *   - 환영 헤더 (현재 사용자 · 교회 · 다음 예배 카운트다운)
 *   - 4개 앱 진입 카드 (자막협조 · 캔버스 · 대시보드 · 설정)
 *   - 최근 활동 피드 (작게)
 */

import Link from 'next/link';
import { useMediaStore } from '@/lib/media/mediaStore';
import { useAuthContext } from '@/lib/auth/AuthProvider';
import UpcomingWorshipCard from '@/components/media/landing/UpcomingWorshipCard';
import ActivityFeedCard from '@/components/media/landing/ActivityFeedCard';
import NoticeBoardCard from '@/components/media/landing/NoticeBoardCard';

export default function WorkspaceHome() {
  const { user, profile } = useAuthContext();
  const church = useMediaStore((s) => s.getActiveChurch());
  const session = useMediaStore((s) => s.session);

  // 실제 유저 이름 사용
  const userName = profile.full_name ?? user?.email?.split('@')[0] ?? '';

  return (
    <main className="w-full max-w-[1400px] mx-auto px-6 py-8">
      {/* ── 환영 헤더 ── */}
      <section className="mb-6">
        <p className="text-[11px] font-semibold tracking-widest text-violet-600 uppercase">
          {church?.name ?? '교회'} 미디어부
        </p>
        <h1 className="mt-1 text-2xl md:text-3xl font-bold text-gray-900">
          {userName ? `${userName}님, 반갑습니다.` : '반갑습니다.'}
        </h1>
        {church?.slogan && (
          <p className="mt-1 text-sm text-gray-500">{church.slogan}</p>
        )}
      </section>

      {/* ── 데스크탑 연결 배너 ── */}
      <DesktopConnectionBanner />

      {/* ── 4개 앱 진입 카드 ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <AppEntryCard
          href="/media/fellowship"
          color="from-violet-500 to-purple-600"
          title="자막협조"
          subtitle="자막 요청 · 협조 · 팀 채팅"
          badge={session.viewerIds.length > 0 ? `${session.viewerIds.length}명 접속` : undefined}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <AppEntryCard
          href="/media/canvas"
          color="from-blue-500 to-cyan-600"
          title="캔버스"
          subtitle="디자인 에디터 · 데스크탑과 동기화"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          }
        />
        <AppEntryCard
          href="/media/broadcast"
          color="from-rose-500 to-red-600"
          title="대시보드"
          subtitle="녹화 · 라이브 관제 (OBS 대체)"
          badge={session.live.active ? 'ON AIR' : session.recording.active ? 'REC' : undefined}
          badgeColor={session.live.active ? 'bg-rose-600' : undefined}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2" />
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
            </svg>
          }
        />
        <AppEntryCard
          href="/media/settings"
          color="from-gray-600 to-gray-800"
          title="설정"
          subtitle="멤버 · 교회 · 대시보드"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          }
        />
      </section>

      {/* ── 바로가기 링크 (라이브러리 등) ── */}
      <section className="mb-8 flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase mr-2">
          바로가기
        </p>
        <Link
          href="/media/broadcast/library"
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:border-violet-300 hover:text-violet-700 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          방송 라이브러리
        </Link>
        <Link
          href="/media/canvas"
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:border-violet-300 hover:text-violet-700 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          썸네일 작업공간
        </Link>
      </section>

      {/* ── 본문 요약 ── */}
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7">
          <UpcomingWorshipCard />
        </div>
        <div className="col-span-12 lg:col-span-5">
          <NoticeBoardCard compact />
        </div>
        <div className="col-span-12">
          <ActivityFeedCard />
        </div>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────
// 데스크탑 연결 배너
// ─────────────────────────────────────────
function DesktopConnectionBanner() {
  const syncStatus = useMediaStore((s) => s.session.syncStatus);
  const connected = syncStatus === 'connected';

  return (
    <section
      className={`mb-8 rounded-xl border px-5 py-4 flex flex-wrap items-center gap-4 ${
        connected
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div
        className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${
          connected
            ? 'bg-white border-emerald-200 text-emerald-600'
            : 'bg-white border-amber-200 text-amber-600'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${connected ? 'text-emerald-900' : 'text-amber-900'}`}>
          {connected
            ? 'UnoLive 데스크탑 연결됨 · 방송실 컴퓨터와 실시간 동기화 중입니다.'
            : 'UnoLive 데스크탑이 연결되지 않았습니다.'}
        </p>
        <p className={`mt-0.5 text-[11px] ${connected ? 'text-emerald-700' : 'text-amber-800'}`}>
          {connected
            ? '웹에서 준비한 자료가 방송실로 자동 전송되고, 녹화 · 라이브 상태는 대시보드에서 모니터링할 수 있습니다.'
            : '송출 엔진은 UnoLive 데스크탑 앱에서만 동작합니다. 방송실 컴퓨터에 설치 후 로그인해 주세요.'}
        </p>
      </div>

      {!connected && (
        <Link
          href="/media/product#download"
          className="px-4 h-10 flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold shadow-sm hover:shadow-md transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          데스크탑 다운로드
        </Link>
      )}
    </section>
  );
}

// ─────────────────────────────────────────
// 앱 진입 카드
// ─────────────────────────────────────────
function AppEntryCard({
  href,
  color,
  title,
  subtitle,
  icon,
  badge,
  badgeColor = 'bg-gray-900',
}: {
  href: string;
  color: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all"
    >
      <div
        className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white shadow-sm mb-4 group-hover:scale-105 transition-transform`}
      >
        {icon}
      </div>
      <h3 className="text-base font-bold text-gray-900">{title}</h3>
      <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">{subtitle}</p>

      {badge && (
        <span
          className={`absolute top-4 right-4 px-2 py-0.5 rounded-full text-[9px] font-bold text-white ${badgeColor}`}
        >
          {badge}
        </span>
      )}

      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="absolute bottom-5 right-5 text-gray-300 group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all"
      >
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    </Link>
  );
}
