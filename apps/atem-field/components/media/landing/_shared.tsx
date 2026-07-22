'use client';

/**
 * components/media/landing/_shared.tsx
 * 랜딩 대시보드 카드 공통 프리미티브
 */

import React from 'react';

export function Card({
  title,
  hint,
  action,
  children,
  className = '',
  padded = true,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow h-full flex flex-col ${className}`}
    >
      <header className="px-5 pt-4 pb-3 flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold text-gray-900 truncate">
            {title}
          </h3>
          {hint && (
            <p className="mt-0.5 text-[10px] text-gray-500">{hint}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div
        className={`flex-1 min-h-0 ${padded ? 'px-5 pb-5' : ''} ${
          padded ? '' : 'overflow-hidden'
        }`}
      >
        {children}
      </div>
    </section>
  );
}

export function SectionLink({ children, href }: { children: React.ReactNode; href?: string }) {
  const Cmp = href ? 'a' : 'button';
  return (
    <Cmp
      href={href}
      className="text-[11px] font-semibold text-violet-600 hover:text-violet-800 transition-colors"
    >
      {children}
    </Cmp>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initial = name.slice(0, 1);
  return (
    <div
      className="rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4) }}
    >
      {initial}
    </div>
  );
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금 전';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

export function formatCountdown(startAt: number): string {
  const diff = startAt - Date.now();
  if (diff <= 0) return '진행 중';
  const day = Math.floor(diff / 86400_000);
  const hr = Math.floor((diff % 86400_000) / 3_600_000);
  const min = Math.floor((diff % 3_600_000) / 60_000);
  if (day > 0) return `${day}일 ${hr}시간`;
  if (hr > 0) return `${hr}시간 ${min}분`;
  return `${min}분`;
}
