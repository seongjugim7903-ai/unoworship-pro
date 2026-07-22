'use client';

/**
 * NoticeBoardCard — 미디어부 공지/안내
 *
 * compact 모드: 2건만 + 링크만 노출 (operator 모드 사이드)
 */

import { useMediaStore } from '@/lib/media/mediaStore';
import type { NoticePriority } from '@/lib/media/mediaTypes';
import { Card, formatRelative, SectionLink } from './_shared';

const PRIORITY_STYLE: Record<NoticePriority, string> = {
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  normal: 'bg-gray-50 text-gray-700 border-gray-200',
  urgent: 'bg-rose-50 text-rose-700 border-rose-200',
};

const PRIORITY_LABEL: Record<NoticePriority, string> = {
  info: '안내',
  normal: '공지',
  urgent: '긴급',
};

export default function NoticeBoardCard({ compact = false }: { compact?: boolean }) {
  const notices = useMediaStore((s) => s.notices);
  const members = useMediaStore((s) => s.members);

  const sorted = [...notices].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  const list = compact ? sorted.slice(0, 2) : sorted;

  return (
    <Card
      title="부서 공지"
      hint={`${notices.length}건 · 핀 고정 포함`}
      action={<SectionLink href="/media/team/notices">전체 →</SectionLink>}
    >
      <ul className="space-y-3 overflow-y-auto max-h-[340px] pr-1">
        {list.map((n) => {
          const author = members.find((m) => m.id === n.authorId);
          return (
            <li
              key={n.id}
              className="rounded-lg border border-gray-100 p-3 hover:border-violet-200 hover:bg-violet-50/30 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${PRIORITY_STYLE[n.priority]}`}
                >
                  {PRIORITY_LABEL[n.priority]}
                </span>
                {n.pinned && (
                  <span className="text-[9px] text-violet-600 font-semibold">
                    📌 고정
                  </span>
                )}
                <span className="ml-auto text-[10px] text-gray-400">
                  {formatRelative(n.createdAt)}
                </span>
              </div>
              <p className="text-[12px] font-bold text-gray-900 line-clamp-1">
                {n.title}
              </p>
              {!compact && (
                <p className="mt-1 text-[11px] text-gray-600 line-clamp-2 leading-relaxed">
                  {n.body}
                </p>
              )}
              {author && (
                <p className="mt-1.5 text-[10px] text-gray-500">{author.name}</p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
