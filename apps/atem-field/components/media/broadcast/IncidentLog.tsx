'use client';

/**
 * IncidentLog — 세션 사고/이벤트 로그
 *
 * 자동 운영 타임라인. 수동 메모는 별도 팝업에서 관리합니다.
 */

import { useMemo, useState } from 'react';
import { useMediaStore } from '@/lib/media/mediaStore';
import type { IncidentLogEntry } from '@/lib/media/mediaTypes';
import { ConsolePanel } from './_common';
import SessionMemoPopup from './SessionMemoPopup';

const LEVEL_STYLE: Record<IncidentLogEntry['level'], { dot: string; text: string; label: string }> = {
  info:  { dot: 'bg-gray-500',  text: 'text-gray-400', label: 'INFO'  },
  warn:  { dot: 'bg-amber-500', text: 'text-amber-400', label: 'WARN' },
  error: { dot: 'bg-red-500',   text: 'text-red-400', label: 'ERR'   },
};

type LogFilter = 'all' | 'warning' | NonNullable<IncidentLogEntry['category']>;

const FILTERS: Array<{ id: LogFilter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'warning', label: '경고' },
  { id: 'broadcast', label: '송출' },
  { id: 'recording', label: '녹화' },
  { id: 'live', label: '라이브' },
  { id: 'system', label: '시스템' },
];

const CATEGORY_LABEL: Record<NonNullable<IncidentLogEntry['category']>, string> = {
  broadcast: '송출',
  recording: '녹화',
  live: '라이브',
  system: '시스템',
};

export default function IncidentLog() {
  const incidents = useMediaStore((s) => s.incidents);
  const session = useMediaStore((s) => s.session);
  const connectionSnapshot = useMediaStore((s) => s.connectionSnapshot);
  const members = useMediaStore((s) => s.members);
  const memoCount = useMediaStore(
    (s) => s.sessionMemos.filter((memo) => memo.sessionId === s.session.id).length
  );

  const [filter, setFilter] = useState<LogFilter>('all');
  const [memoOpen, setMemoOpen] = useState(false);

  const connectedCount =
    connectionSnapshot?.activeSockets
    ?? session.viewerIds.length + (session.activeOperatorId ? 1 : 0);
  const connectionHint = connectionSnapshot
    ? `접속 ${connectedCount} · C ${connectionSnapshot.composer} · O ${connectionSnapshot.output} · V ${connectionSnapshot.viewer}`
    : `접속 ${connectedCount}`;

  const filtered = useMemo(() => {
    return [...incidents]
      .sort((a, b) => a.at - b.at)
      .filter((entry) => {
        if (filter === 'all') return true;
        if (filter === 'warning') return entry.level === 'warn' || entry.level === 'error';
        return resolveIncidentCategory(entry) === filter;
      });
  }, [filter, incidents]);

  return (
    <>
      <ConsolePanel
        title="운영 로그"
        hint={`${connectionHint} · 로그 ${filtered.length}`}
        action={
          <button
            type="button"
            onClick={() => setMemoOpen(true)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-700 px-2 text-[10px] font-bold text-gray-300 transition-colors hover:border-violet-500/60 hover:bg-violet-500/10 hover:text-white"
          >
            메모
            <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[9px] text-gray-400">
              {memoCount}
            </span>
          </button>
        }
        padded={false}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="border-b border-gray-800 px-3 pb-2">
          <div className="flex flex-wrap items-center gap-1">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`h-6 rounded-md px-2 text-[9px] font-bold transition-colors ${
                  filter === item.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-[#15171e] text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-[11px] text-gray-600">표시할 로그가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-800/80 font-mono">
              {filtered.map((entry) => {
                const style = LEVEL_STYLE[entry.level];
                const category = resolveIncidentCategory(entry);
                const time = new Date(entry.at).toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                });
                const actor = entry.actorId
                  ? members.find((m) => m.id === entry.actorId)?.name
                  : undefined;
                return (
                  <li key={entry.id} className="flex items-center gap-2 py-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                    <span className="text-[10px] text-gray-600 tabular-nums shrink-0">{time}</span>
                    <span className={`text-[9px] font-bold shrink-0 w-8 ${style.text}`}>{style.label}</span>
                    <span className="shrink-0 rounded bg-gray-900 px-1.5 py-0.5 text-[8px] font-bold text-gray-500">
                      {CATEGORY_LABEL[category]}
                    </span>
                    <span className="text-[11px] text-gray-300 flex-1 truncate">{entry.message}</span>
                    {actor && <span className="text-[10px] text-gray-600 shrink-0">@ {actor}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ConsolePanel>

      <SessionMemoPopup open={memoOpen} onClose={() => setMemoOpen(false)} />
    </>
  );
}

function resolveIncidentCategory(
  entry: IncidentLogEntry
): NonNullable<IncidentLogEntry['category']> {
  if (entry.category) return entry.category;
  const message = entry.message;
  if (/녹화|클립|마커|REC|record/i.test(message)) return 'recording';
  if (/라이브|YouTube|RTMP|비트레이트|스트림/i.test(message)) return 'live';
  if (/송출|Program|Standby|Scene|Take|자막|카메라|PGM/i.test(message)) return 'broadcast';
  return 'system';
}
