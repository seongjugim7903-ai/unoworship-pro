'use client';

/**
 * 브로드캐스트 대시보드 공통 프리미티브
 *  - ConsolePanel: 다크 배경 어두운 콘솔 카드
 *  - formatDuration: 경과 시간 hh:mm:ss
 *  - formatBytes: 파일 크기 GB/MB
 *  - SyncDot: 서버 연결 상태 점
 */

import React from 'react';
import type { ServerSyncStatus } from '@/lib/media/mediaTypes';

export function ConsolePanel({
  title,
  hint,
  action,
  children,
  tone = 'neutral',
  className = '',
  padded = true,
}: {
  title?: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'neutral' | 'rec' | 'live' | 'warn';
  className?: string;
  padded?: boolean;
}) {
  const toneBorder: Record<string, string> = {
    neutral: 'border-gray-800',
    rec: 'border-red-900/60',
    live: 'border-rose-900/60',
    warn: 'border-amber-900/60',
  };
  return (
    <section
      className={`rounded-xl border bg-[#0d0f14] ${toneBorder[tone]} shadow-lg shadow-black/20 ${className}`}
    >
      {title && (
        <header className="px-4 pt-3 pb-2 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-[11px] font-bold tracking-wider text-gray-400 uppercase truncate">
              {title}
            </h3>
            {hint && <p className="mt-0.5 text-[10px] text-gray-500">{hint}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={padded ? 'px-4 pb-4' : ''}>{children}</div>
    </section>
  );
}

export function formatDuration(startedAt: number | null, now = Date.now()): string {
  if (!startedAt) return '--:--:--';
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function SyncDot({ status }: { status: ServerSyncStatus }) {
  const map: Record<ServerSyncStatus, { color: string; label: string; pulse: boolean }> = {
    connected:       { color: 'bg-green-500',  label: '서버 연결됨',          pulse: false },
    connecting:      { color: 'bg-yellow-500', label: '연결 중',              pulse: true  },
    disconnected:    { color: 'bg-red-500',    label: '연결 끊김',            pulse: true  },
    'fallback-local':{ color: 'bg-amber-500',  label: '로컬 폴백 (데스크탑)', pulse: true  },
  };
  const { color, label, pulse } = map[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex w-2 h-2">
        {pulse && (
          <span className={`absolute inline-flex w-full h-full rounded-full ${color} opacity-60 animate-ping`} />
        )}
        <span className={`relative inline-flex w-2 h-2 rounded-full ${color}`} />
      </span>
      <span className="text-[10px] font-semibold text-gray-400">{label}</span>
    </span>
  );
}
