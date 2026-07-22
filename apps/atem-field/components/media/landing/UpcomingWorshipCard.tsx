'use client';

/**
 * UpcomingWorshipCard — 다음 예배 카운트다운 + 입력 준비 현황
 *
 * 자막협조 지휘체계의 심장부.
 * "이번 주 주일예배까지 얼마 남았고, 어떤 자료가 아직 없는가?"
 * 한눈에 보이는 것이 목표.
 */

import Link from 'next/link';
import { useMediaStore } from '@/lib/media/mediaStore';
import { Card, formatCountdown, SectionLink } from './_shared';
import type { Worship, WorshipInputStatus } from '@/lib/media/mediaTypes';

const INPUT_ROWS: Array<{ key: keyof WorshipInputStatus; label: string; href: string }> = [
  { key: 'bulletin',      label: '주보',       href: '/media/dashboard/bulletin' },
  { key: 'worshipConti',  label: '찬양콘티',   href: '/media/dashboard/worship-conti' },
  { key: 'sermon',        label: '설교 자료',  href: '/media/dashboard/sermon' },
  { key: 'specialSong',   label: '특송',       href: '/media/dashboard/special-song' },
  { key: 'announcements', label: '광고/공지',  href: '/media/dashboard/announcements' },
];

export default function UpcomingWorshipCard() {
  const worship = useMediaStore((s) => s.getNextWorship());
  const members = useMediaStore((s) => s.members);

  if (!worship) {
    return (
      <Card title="다음 예배" hint="예정된 예배가 없습니다">
        <EmptyState />
      </Card>
    );
  }

  const operator = members.find((m) => m.id === worship.operatorId);
  const conti = members.find((m) => m.id === worship.contiLeaderId);
  const progress = calcProgress(worship);

  return (
    <Card
      title="다음 예배"
      hint={new Date(worship.startAt).toLocaleString('ko-KR', {
        month: 'long',
        day: 'numeric',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })}
      action={<SectionLink href={`/media/dashboard/worship/${worship.id}`}>자세히 →</SectionLink>}
    >
      {/* 카운트다운 */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-violet-600 uppercase">
            D - {formatCountdown(worship.startAt)}
          </p>
          <h4 className="mt-1 text-xl font-bold text-gray-900 truncate">
            {worship.title}
          </h4>
          {worship.sermonTitle && (
            <p className="mt-1 text-sm text-gray-700 truncate">
              {worship.sermonTitle}
            </p>
          )}
          {worship.scripture && (
            <p className="mt-0.5 text-[12px] text-gray-500">
              본문 · {worship.scripture}
            </p>
          )}
          {worship.preacher && (
            <p className="mt-0.5 text-[12px] text-gray-500">
              설교 · {worship.preacher}
            </p>
          )}
        </div>

        {/* 진행률 링 */}
        <ProgressRing value={progress} />
      </div>

      {/* 입력 체크리스트 */}
      <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {INPUT_ROWS.map((row) => {
            const done = worship.inputs[row.key];
            return (
              <li key={row.key}>
                <Link
                  href={row.href}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center ${
                        done ? 'bg-violet-600' : 'bg-white border border-gray-300'
                      }`}
                    >
                      {done && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="4"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span
                      className={`text-[12px] font-medium ${
                        done ? 'text-gray-500 line-through' : 'text-gray-800'
                      }`}
                    >
                      {row.label}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold ${
                      done ? 'text-green-600' : 'text-amber-600'
                    }`}
                  >
                    {done ? '완료' : '입력 필요'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 담당자 */}
      <div className="mt-4 flex items-center gap-4 text-[11px] text-gray-500">
        {operator && <span>방송 · {operator.name}</span>}
        {conti && <span>콘티 · {conti.name}</span>}
      </div>
    </Card>
  );
}

function calcProgress(worship: Worship): number {
  const rows = Object.values(worship.inputs);
  const done = rows.filter(Boolean).length;
  return Math.round((done / rows.length) * 100);
}

function ProgressRing({ value }: { value: number }) {
  const radius = 30;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="relative w-[72px] h-[72px] shrink-0">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={radius} stroke="#e5e7eb" strokeWidth="6" fill="none" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          stroke="url(#progress-grad)"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 36 36)"
        />
        <defs>
          <linearGradient id="progress-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-gray-900">{value}%</span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-8 flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>
      <p className="text-[12px] text-gray-500">다음 예배를 등록해보세요.</p>
    </div>
  );
}
