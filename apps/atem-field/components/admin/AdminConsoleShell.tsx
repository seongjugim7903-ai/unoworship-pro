'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, ShieldCheck, UserRoundCheck, UsersRound } from 'lucide-react';

const adminMenu = [
  {
    href: '/admin/users',
    label: '회원관리',
    description: '단순 가입자',
    icon: UsersRound,
  },
  {
    href: '/admin/church-applications',
    label: '체험신청',
    description: '교회 워크스페이스',
    icon: UserRoundCheck,
  },
  {
    href: '/admin/settings',
    label: '설정',
    description: '관리 정책',
    icon: Settings,
  },
];

export function AdminConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-[#f7f8fb]">
      <div className="mx-auto grid max-w-7xl gap-0 px-5 py-8 lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-slate-200 bg-white pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-slate-950 text-white">
              <ShieldCheck size={18} />
            </span>
            <span>
              <span className="block text-sm font-black text-slate-950">관리자 콘솔</span>
              <span className="block text-xs font-bold text-slate-500">UnoWorship Owner</span>
            </span>
          </div>

          <nav className="grid gap-1">
            {adminMenu.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'flex items-center gap-3 rounded-md border px-3 py-2.5 transition',
                    active
                      ? 'border-teal-200 bg-teal-50 text-teal-900'
                      : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950',
                  ].join(' ')}
                >
                  <Icon size={17} className={active ? 'text-teal-700' : 'text-slate-400'} />
                  <span className="min-w-0">
                    <span className="block text-sm font-black">{item.label}</span>
                    <span className="block text-xs font-semibold opacity-70">{item.description}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 pt-6 lg:pt-0 lg:pl-8">
          {children}
        </section>
      </div>
    </main>
  );
}
