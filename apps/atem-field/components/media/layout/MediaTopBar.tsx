'use client';

/**
 * MediaTopBar — 교회 워크스페이스 상단 내비게이션
 *
 * 구조:
 *   좌측: 자막협조 · 캔버스 · 대시보드 · 설정
 *   우측: 교회 배지 · 사용자 정보 · 로그아웃
 *
 * 공개 랜딩/제품/프라이싱/리소스 메뉴는 unoworship.kr 마케팅 레이아웃에서만
 * 다루고, app/media 영역은 구독 교회 운영 워크스페이스로 고정한다.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMediaStore } from '@/lib/media/mediaStore';
import { useAuthContext } from '@/lib/auth/AuthProvider';
import { ROLE_LABEL } from '@/lib/auth/types';

const WORKSPACE_NAV = [
  { label: '자막협조',   href: '/media/fellowship', icon: 'fellowship' as const },
  { label: '캔버스',     href: '/media/canvas',     icon: 'canvas' as const },
  { label: '대시보드',   href: '/media/broadcast',  icon: 'broadcast' as const },
  { label: '설정',       href: '/media/settings',   icon: 'settings' as const },
];

// ─────────────────────────────────────────
// 아이콘
// ─────────────────────────────────────────
function NavIcon({ name }: { name: typeof WORKSPACE_NAV[number]['icon'] }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'fellowship':
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'broadcast':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="2" />
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
        </svg>
      );
    case 'canvas':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
  }
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────
export default function MediaTopBar() {
  const pathname = usePathname();
  const authMode = useMediaStore((s) => s.authMode);
  const logout = useMediaStore((s) => s.logout);
  const church = useMediaStore((s) => s.getActiveChurch());
  const { user, profile, role } = useAuthContext();

  // 실제 유저 이름 (Supabase user_metadata)
  const userName = profile.full_name ?? user?.email?.split('@')[0] ?? '';
  const roleLabel = ROLE_LABEL[role];
  const churchName = church?.name?.trim() || '울주교회';
  const churchMark = churchName.slice(0, 2);

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="max-w-[1600px] mx-auto px-5 h-14 flex items-center gap-4">
        {/* ── 좌측 워크스페이스 내비 ── */}
        {authMode !== 'guest' && (
          <>
            <Link href="/media" className="flex items-center gap-2 shrink-0 group">
              <div className="w-8 h-8 rounded-md border border-sky-200 bg-gradient-to-br from-sky-600 to-emerald-500 text-white flex items-center justify-center text-[11px] font-black shadow-sm">
                {churchMark}
              </div>
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="text-[12px] font-black text-gray-900 group-hover:text-sky-700 transition-colors">
                  {churchName}
                </span>
                <span className="text-[9px] font-semibold text-gray-400 tracking-wide">
                  UnoWorship
                </span>
              </div>
            </Link>

            <div className="hidden md:block w-px h-6 bg-gray-200" />

            <nav className="flex items-center gap-0.5">
              {WORKSPACE_NAV.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={pathname === item.href || pathname.startsWith(item.href + '/')}
                  icon={<NavIcon name={item.icon} />}
                />
              ))}
            </nav>

            {/* spacer */}
            <div className="flex-1" />

            {/* 사용자 아바타 + 로그아웃 */}
            {userName && (
              <div className="flex items-center gap-1">
                <button
                  className="flex items-center gap-2 pl-1 pr-2 h-9 rounded-md hover:bg-gray-100 transition-colors"
                  title={`${userName} · ${roleLabel}`}
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-[11px] font-bold">
                    {userName.slice(0, 1)}
                  </div>
                  <span className="hidden md:inline text-[11px] font-medium text-gray-700">
                    {userName}
                  </span>
                  <span className="hidden md:inline text-[9px] text-gray-400">
                    {roleLabel}
                  </span>
                </button>
                <button
                  onClick={logout}
                  className="px-2 h-7 rounded-md text-[10px] font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="로그아웃"
                >
                  로그아웃
                </button>
              </div>
            )}
          </>
        )}

        {/* ── 게스트: 로그인 CTA ── */}
        {authMode === 'guest' && (
          <>
            <div className="flex-1" />
            <Link
              href="/login"
              className="px-4 h-9 flex items-center rounded-md bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-semibold transition-colors"
            >
              로그인
            </Link>
          </>
        )}

        {/* 데모 모드 스위처 제거됨 — 실제 인증 사용 */}
      </div>
    </header>
  );
}

// ─────────────────────────────────────────
// 내부 빌딩블록
// ─────────────────────────────────────────
function NavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon?: React.ReactNode;
  active: boolean;
}) {
  const base =
    'flex items-center gap-1.5 px-3 h-9 rounded-md text-[12px] font-medium transition-colors';
  const style = active
    ? 'bg-violet-50 text-violet-700'
    : 'text-gray-600 hover:text-violet-700 hover:bg-violet-50';
  return (
    <Link href={href} className={`${base} ${style}`}>
      {icon && <span className={active ? 'text-violet-600' : 'text-gray-400'}>{icon}</span>}
      <span>{label}</span>
    </Link>
  );
}
