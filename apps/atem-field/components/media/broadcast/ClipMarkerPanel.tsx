'use client';

/**
 * ClipMarkerPanel — 녹화 파일에 붙는 비파괴 타임스탬프 마커.
 *
 * 운영 흐름:
 *   새 마커 → 이름 입력 → 시작 → 종료 → 리스트업
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, Square, Trash2, X } from 'lucide-react';
import { useMediaStore } from '@/lib/media/mediaStore';
import type { SessionClipMarker } from '@/lib/media/mediaTypes';
import { ConsolePanel, formatBytes } from './_common';

const DEFAULT_KIND = 'other';

export default function ClipMarkerPanel() {
  const session = useMediaStore((s) => s.session);
  const canControl = useMediaStore((s) => s.canControlBroadcast());
  const startClip = useMediaStore((s) => s.startClipMarker);
  const endClip = useMediaStore((s) => s.endClipMarker);
  const updateClip = useMediaStore((s) => s.updateClipMarker);
  const deleteClip = useMediaStore((s) => s.deleteClipMarker);
  const activeClip = useMediaStore((s) => s.getActiveClipMarker());

  const [now, setNow] = useState(() => Date.now());
  const [creating, setCreating] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sortedClips = useMemo(
    () => [...session.clipMarkers].sort((a, b) => b.startedAt - a.startedAt),
    [session.clipMarkers]
  );

  const disabled = !canControl;
  const canStartMarker = canControl && !activeClip && draftLabel.trim().length > 0;

  const openCreate = () => {
    if (disabled || activeClip) return;
    setCreating(true);
    setDraftLabel('');
  };

  const cancelCreate = () => {
    setCreating(false);
    setDraftLabel('');
  };

  const handleStartMarker = () => {
    if (!canStartMarker) return;
    startClip(DEFAULT_KIND, draftLabel.trim());
    setCreating(false);
    setDraftLabel('');
  };

  const handleStopActive = () => {
    if (disabled) return;
    endClip();
  };

  const startEdit = (clip: SessionClipMarker) => {
    if (!canControl) return;
    setEditingId(clip.id);
    setEditDraft(clip.label);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const trimmed = editDraft.trim();
    if (trimmed) updateClip(editingId, { label: trimmed });
    setEditingId(null);
    setEditDraft('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };

  return (
    <ConsolePanel
      title="Clip Markers"
      hint="녹화 구간 마킹"
      tone={activeClip ? 'live' : 'neutral'}
      action={
        <span className={`text-[9px] tabular-nums ${activeClip ? 'text-rose-300' : 'text-gray-500'}`}>
          {activeClip ? '마킹 중' : `${session.clipMarkers.length}개`}
        </span>
      }
    >
      {activeClip ? (
        <ActiveMarkerCard
          clip={activeClip}
          now={now}
          disabled={disabled}
          onStop={handleStopActive}
        />
      ) : (
        <div className="rounded-lg border border-gray-800 bg-[#0a0c10] p-3">
          {!creating ? (
            <button
              type="button"
              onClick={openCreate}
              disabled={disabled}
              className="flex h-10 w-full items-center justify-center gap-2 rounded bg-gray-100 text-[11px] font-bold text-gray-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-600"
            >
              <Plus size={15} />
              새 마커
            </button>
          ) : (
            <div className="space-y-2">
              <label className="block text-[9px] font-semibold uppercase tracking-wider text-gray-500">
                마커 이름
              </label>
              <input
                autoFocus
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleStartMarker();
                  } else if (e.key === 'Escape') {
                    cancelCreate();
                  }
                }}
                placeholder="예: 찬양대, 설교, 광고, 특송"
                className="h-9 w-full rounded border border-gray-700 bg-[#15171e] px-2 text-[12px] text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-violet-500"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={handleStartMarker}
                  disabled={!canStartMarker}
                  className="flex h-9 items-center justify-center gap-1.5 rounded bg-rose-600 text-[11px] font-bold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-600"
                >
                  <Square size={13} fill="currentColor" />
                  시작
                </button>
                <button
                  type="button"
                  onClick={cancelCreate}
                  className="flex h-9 items-center justify-center gap-1.5 rounded border border-gray-700 bg-[#15171e] text-[11px] font-bold text-gray-300 transition-colors hover:bg-[#1d2029]"
                >
                  <X size={13} />
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {sortedClips.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
            마커 리스트 ({sortedClips.length})
          </p>
          <ul className="max-h-[168px] space-y-1.5 overflow-y-auto pr-1">
            {sortedClips.map((clip, index) => (
              <MarkerRow
                key={clip.id}
                clip={clip}
                index={sortedClips.length - index}
                now={now}
                isActive={activeClip?.id === clip.id}
                canControl={canControl}
                isEditing={editingId === clip.id}
                editDraft={editDraft}
                onEditDraftChange={setEditDraft}
                onStartEdit={() => startEdit(clip)}
                onCommitEdit={commitEdit}
                onCancelEdit={cancelEdit}
                onDelete={() => deleteClip(clip.id)}
              />
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 rounded border border-dashed border-gray-800 px-3 py-4 text-center text-[10px] leading-relaxed text-gray-600">
          {disabled
            ? '방송 제어 권한이 있으면 클립 마커를 사용할 수 있습니다.'
            : '새 마커를 눌러 녹화 구간 이름을 남겨 보세요.'}
        </p>
      )}
    </ConsolePanel>
  );
}

function ActiveMarkerCard({
  clip,
  now,
  disabled,
  onStop,
}: {
  clip: SessionClipMarker;
  now: number;
  disabled: boolean;
  onStop: () => void;
}) {
  return (
    <div className="rounded-lg border border-rose-500/40 bg-rose-950/25 p-3">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-rose-300">
          진행 중
        </span>
      </div>
      <p className="mt-2 truncate text-[13px] font-semibold text-white" title={clip.label}>
        {clip.label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-[8px] font-semibold uppercase tracking-wider text-gray-500">
            경과
          </p>
          <p className="text-lg font-bold tabular-nums text-rose-300">
            {formatClipDuration(clip.startedAt, now)}
          </p>
        </div>
        <button
          type="button"
          onClick={onStop}
          disabled={disabled}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded bg-rose-600 px-3 text-[11px] font-bold text-white transition-colors hover:bg-rose-500 disabled:bg-gray-800 disabled:text-gray-600"
        >
          <Square size={13} fill="currentColor" />
          종료
        </button>
      </div>
    </div>
  );
}

function MarkerRow({
  clip,
  index,
  now,
  isActive,
  canControl,
  isEditing,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDelete,
}: {
  clip: SessionClipMarker;
  index: number;
  now: number;
  isActive: boolean;
  canControl: boolean;
  isEditing: boolean;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  const duration = isActive
    ? formatClipDuration(clip.startedAt, now)
    : clip.endedAt
      ? formatClipDuration(clip.startedAt, clip.endedAt)
      : '--:--';

  return (
    <li
      className={`rounded border px-2.5 py-2 ${
        isActive
          ? 'border-rose-500/40 bg-rose-950/15'
          : 'border-gray-800 bg-[#0a0c10]'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-5 min-w-6 items-center justify-center rounded bg-gray-800 px-1 text-[8px] font-bold tabular-nums text-gray-400">
          {String(index).padStart(2, '0')}
        </span>
        {isEditing ? (
          <input
            autoFocus
            value={editDraft}
            onChange={(e) => onEditDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onCommitEdit();
              } else if (e.key === 'Escape') {
                onCancelEdit();
              }
            }}
            className="h-7 min-w-0 flex-1 rounded border border-gray-700 bg-[#15171e] px-2 text-[11px] text-gray-100 outline-none focus:border-violet-500"
          />
        ) : (
          <button
            type="button"
            onClick={onStartEdit}
            disabled={!canControl}
            className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold text-gray-200 transition-colors hover:text-white disabled:cursor-default disabled:hover:text-gray-200"
            title={canControl ? '마커 이름 수정' : clip.label}
          >
            {clip.label}
          </button>
        )}
        <span className={`shrink-0 text-[10px] tabular-nums ${isActive ? 'text-rose-300' : 'text-gray-500'}`}>
          {duration}
        </span>
        {isEditing ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onCommitEdit}
              className="rounded p-1 text-emerald-300 transition-colors hover:bg-emerald-900/30"
              title="저장"
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200"
              title="취소"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          canControl && !isActive && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onStartEdit}
                className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200"
                title="수정"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded p-1 text-gray-600 transition-colors hover:bg-red-900/30 hover:text-red-400"
                title="삭제"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )
        )}
      </div>
      <p className="mt-1 pl-8 text-[9px] tabular-nums text-gray-600">
        {formatClockTime(clip.startedAt)}
        {clip.endedAt ? ` -> ${formatClockTime(clip.endedAt)}` : ' -> 진행 중'}
      </p>
      <MarkerFileStatus clip={clip} />
    </li>
  );
}

function MarkerFileStatus({ clip }: { clip: SessionClipMarker }) {
  if (!clip.fileStatus) return null;

  if (clip.fileStatus === 'recording') {
    return (
      <p className="mt-1 pl-8 text-[9px] text-rose-300" title={clip.filePath}>
        마커 파일 녹화 중
        {clip.fileSize ? ` · ${formatBytes(clip.fileSize)}` : ''}
      </p>
    );
  }

  if (clip.fileStatus === 'ready') {
    return (
      <p className="mt-1 truncate pl-8 text-[9px] text-emerald-300" title={clip.filePath}>
        Markers 저장 완료
        {clip.fileSize ? ` · ${formatBytes(clip.fileSize)}` : ''}
      </p>
    );
  }

  return (
    <p className="mt-1 truncate pl-8 text-[9px] text-red-300" title={clip.fileError}>
      마커 파일 저장 실패{clip.fileError ? ` · ${clip.fileError}` : ''}
    </p>
  );
}

function formatClipDuration(start: number, end: number): string {
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatClockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
