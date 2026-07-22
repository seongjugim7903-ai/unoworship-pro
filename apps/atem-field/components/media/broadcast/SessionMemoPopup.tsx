'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMediaStore } from '@/lib/media/mediaStore';
import type { BroadcastMemoEntry } from '@/lib/media/mediaTypes';

export default function SessionMemoPopup({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const memos = useMediaStore((s) => s.sessionMemos);
  const sessionId = useMediaStore((s) => s.session.id);
  const members = useMediaStore((s) => s.members);
  const canNote = useMediaStore((s) => s.canAccessBroadcast());
  const addSessionMemo = useMediaStore((s) => s.addSessionMemo);
  const deleteSessionMemo = useMediaStore((s) => s.deleteSessionMemo);
  const [draft, setDraft] = useState('');

  const sorted = useMemo(
    () =>
      memos
        .filter((memo) => memo.sessionId === sessionId)
        .sort((a, b) => b.at - a.at),
    [memos, sessionId]
  );

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleAdd = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    addSessionMemo(trimmed);
    setDraft('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-700 bg-[#0d0f14] shadow-2xl shadow-black/40">
        <header className="flex items-start justify-between gap-3 border-b border-gray-800 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white">운영 메모</h2>
            <p className="mt-0.5 text-[10px] text-gray-500">현재 세션 {sorted.length}건</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="메모 창 닫기"
            title="닫기"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="max-h-[48vh] overflow-y-auto px-4 py-3">
          {sorted.length === 0 ? (
            <p className="rounded-md border border-dashed border-gray-800 px-3 py-6 text-center text-[11px] text-gray-500">
              아직 남긴 메모가 없습니다.
            </p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((memo) => (
                <MemoItem
                  key={memo.id}
                  memo={memo}
                  actorName={
                    memo.actorId
                      ? members.find((member) => member.id === memo.actorId)?.name
                      : undefined
                  }
                  onDelete={() => deleteSessionMemo(memo.id)}
                />
              ))}
            </ul>
          )}
        </div>

        {canNote && (
          <div className="border-t border-gray-800 bg-[#090b10] px-4 py-3">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="예: 설교 도입부 쇼츠 후보, 카메라 1번 초점 흔들림"
              className="h-20 w-full resize-none rounded-md border border-gray-800 bg-[#15171e] px-3 py-2 text-[12px] leading-relaxed text-gray-200 placeholder:text-gray-600 focus:border-violet-500 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDraft('')}
                disabled={!draft}
                className="h-8 rounded-md px-3 text-[10px] font-bold text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300 disabled:pointer-events-none disabled:opacity-40"
              >
                지우기
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!draft.trim()}
                className="h-8 rounded-md bg-violet-600 px-3 text-[10px] font-bold text-white transition-colors hover:bg-violet-500 disabled:bg-gray-800 disabled:text-gray-600"
              >
                메모 저장
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MemoItem({
  memo,
  actorName,
  onDelete,
}: {
  memo: BroadcastMemoEntry;
  actorName?: string;
  onDelete: () => void;
}) {
  const time = new Date(memo.at).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <li className="rounded-md border border-gray-800 bg-[#12151c] px-3 py-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-mono text-[10px] tabular-nums text-gray-500">{time}</span>
        {actorName && <span className="min-w-0 flex-1 truncate text-[10px] text-gray-600">@ {actorName}</span>}
        <button
          type="button"
          onClick={onDelete}
          className="rounded px-1.5 py-0.5 text-[9px] font-bold text-gray-600 transition-colors hover:bg-red-500/10 hover:text-red-300"
        >
          삭제
        </button>
      </div>
      <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-gray-200">{memo.body}</p>
    </li>
  );
}
