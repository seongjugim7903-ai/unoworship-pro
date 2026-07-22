'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SavedProgram } from '@/lib/generators/programTypes';

export type FixedProgramAction = 'broadcast' | 'insert';

interface Props {
  programs: SavedProgram[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onSelect: (program: SavedProgram, action: FixedProgramAction) => void | Promise<void>;
  onClose: () => void;
}

const LEFT_TITLES = [
  '사도신경',
  '주기도문',
  '송축해 내영혼',
  '오직 예수',
  '왕이신 나의 하나님',
  '나의 하나님',
  '파송의 노래',
] as const;

function isResponsiveReading(program: SavedProgram): boolean {
  return program.formData?.category === 'responsive-reading' || program.item.title.includes('교독문');
}

function ProgramActions({
  busy,
  onSelect,
}: {
  busy: FixedProgramAction | null;
  onSelect: (action: FixedProgramAction) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => onSelect('broadcast')}
        className="h-8 rounded-md bg-red-700 px-2 text-[11px] font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-40"
      >
        {busy === 'broadcast' ? '처리 중…' : '배치 + 송출'}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => onSelect('insert')}
        className="h-8 rounded-md border border-sky-700 bg-sky-950/70 px-2 text-[11px] font-bold text-sky-100 transition-colors hover:bg-sky-900 disabled:opacity-40"
      >
        {busy === 'insert' ? '처리 중…' : '배치만'}
      </button>
    </div>
  );
}

function ProgramCard({
  program,
  onSelect,
}: {
  program: SavedProgram;
  onSelect: (program: SavedProgram, action: FixedProgramAction) => Promise<void>;
}) {
  const [busy, setBusy] = useState<FixedProgramAction | null>(null);

  const select = async (action: FixedProgramAction) => {
    if (busy) return;
    setBusy(action);
    try {
      await onSelect(program, action);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-[#343434] bg-[#111111] p-2.5 transition-colors hover:border-[#666]">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-white" title={program.item.title}>{program.item.title}</p>
        <p className="mt-0.5 text-[10px] text-gray-500">
          {program.item.sections.length > 0 ? `${program.item.sections.length}개 섹션` : '섹션 없음'}
        </p>
      </div>
      <ProgramActions busy={busy} onSelect={(action) => void select(action)} />
    </div>
  );
}

export default function FixedProgramModal({
  programs,
  loading,
  error,
  onRefresh,
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose]);

  const fixedPrograms = useMemo(() => {
    const byTitle = new Map(programs.map((program) => [program.item.title, program]));
    return LEFT_TITLES
      .map((title) => byTitle.get(title))
      .filter((program): program is SavedProgram => Boolean(program));
  }, [programs]);

  const responsiveReadings = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return programs
      .filter(isResponsiveReading)
      .filter((program) => {
        if (!normalized) return true;
        const aliases = Array.isArray(program.formData?.aliases)
          ? program.formData.aliases.join(' ')
          : '';
        return `${program.item.title} ${aliases} ${program.item.id}`.toLowerCase().includes(normalized);
      });
  }, [programs, query]);

  const handleSelect = async (program: SavedProgram, action: FixedProgramAction) => {
    setActionError('');
    try {
      await onSelect(program, action);
      onClose();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : '프로그램을 배치하지 못했습니다.');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="flex max-h-[calc(100dvh-32px)] w-[940px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-[#3b3b3b] bg-[#171717] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[#2d2d2d] px-5 py-3">
          <div>
            <p className="text-sm font-bold text-amber-300">고정 프로그램 · O</p>
            <p className="mt-0.5 text-[11px] text-gray-500">프로그램을 배치하고 바로 송출하거나, 프로그램에만 미리 넣을 수 있습니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="h-8 rounded-md border border-[#444] px-2.5 text-[11px] text-gray-300 hover:bg-[#252525]"
              title="고정 프로그램 폴더 다시 읽기"
            >
              새로고침
            </button>
            <button type="button" onClick={onClose} className="px-1 text-lg text-gray-500 hover:text-white" title="닫기 (ESC)">
              ×
            </button>
          </div>
        </div>

        {(error || actionError) && (
          <p className="mx-5 mt-3 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-300">
            {actionError || error}
          </p>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-[#2d2d2d] overflow-y-auto md:grid-cols-2 md:divide-x md:divide-y-0">
          <section className="min-h-0 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-wide text-gray-300">고정 찬양·예식문</h2>
              <span className="text-[10px] text-gray-600">{fixedPrograms.length}/{LEFT_TITLES.length}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              {fixedPrograms.map((program) => (
                <ProgramCard key={program.id} program={program} onSelect={handleSelect} />
              ))}
            </div>
            {!loading && fixedPrograms.length === 0 && (
              <p className="rounded-lg border border-dashed border-[#3b3b3b] p-4 text-center text-xs text-gray-600">고정 프로그램이 없습니다.</p>
            )}
          </section>

          <section className="min-h-0 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex-shrink-0 text-xs font-bold tracking-wide text-gray-300">교독문 검색</h2>
              <span className="text-[10px] text-gray-600">{responsiveReadings.length}개</span>
            </div>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="교독문 번호·제목 검색"
              className="mb-3 h-10 w-full rounded-md border border-[#3b3b3b] bg-[#0b0b0b] px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-amber-500"
            />
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              {responsiveReadings.map((program) => (
                <ProgramCard key={program.id} program={program} onSelect={handleSelect} />
              ))}
            </div>
            {!loading && responsiveReadings.length === 0 && (
              <p className="rounded-lg border border-dashed border-[#3b3b3b] p-4 text-center text-xs leading-relaxed text-gray-600">
                검색 결과가 없습니다.<br />data/fixed-programs 폴더에 교독문 JSON을 추가하면 자동으로 표시됩니다.
              </p>
            )}
          </section>
        </div>

        {loading && <p className="border-t border-[#2d2d2d] px-5 py-2 text-[11px] text-gray-500">고정 프로그램을 불러오는 중…</p>}
      </div>
    </div>,
    document.body,
  );
}
