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
  /** [FEATURE: FIXED_PROGRAM_BATCH] 체크한 프로그램을 한 번에 배치 (송출은 안 함) */
  onSelectMany: (programs: SavedProgram[]) => void | Promise<void>;
  onClose: () => void;
}

// 좌측 "고정 찬양·예식문" 열에 이 순서대로 표시한다.
//   여기 제목과 data/fixed-programs/*.json 의 title 이 **정확히 일치**해야 뜬다
//   (아래 fixedPrograms 가 제목으로 매칭). 목록에 넣어도 해당 자료 파일이 없으면
//   조용히 빠지므로, 새로 추가할 때는 파일 존재 여부를 함께 확인할 것.
const LEFT_TITLES = [
  '사도신경',
  '주기도문',
  '송축해 내영혼',
  '오직 예수',
  '왕이신 나의 하나님',
  '나의 하나님',
  '파송의 노래',
  '교회소식',
  '헵시바 선교단',
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
        className="h-8 rounded-md bg-red-600 px-2 text-[11px] font-bold text-white transition-colors hover:bg-red-500 disabled:opacity-40"
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
  checked,
  onToggle,
}: {
  program: SavedProgram;
  onSelect: (program: SavedProgram, action: FixedProgramAction) => Promise<void>;
  /** [FEATURE: FIXED_PROGRAM_BATCH] 일괄 배치 선택 여부 */
  checked: boolean;
  onToggle: () => void;
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
    <div
      className={`rounded-lg border bg-[#111111] p-2.5 transition-colors ${
        checked ? 'border-amber-500 bg-amber-950/20' : 'border-[#343434] hover:border-[#666]'
      }`}
    >
      <label className="flex min-w-0 cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-amber-500"
        />
        <span className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white" title={program.item.title}>{program.item.title}</p>
        <p className="mt-0.5 text-[10px] text-gray-500">
          {program.item.sections.length > 0 ? `${program.item.sections.length}개 섹션` : '섹션 없음'}
        </p>
        </span>
      </label>
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
  onSelectMany,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState('');
  // [FEATURE: FIXED_PROGRAM_BATCH] 일괄 배치용 체크 상태 (프로그램 id)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
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

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /** 체크된 프로그램을 화면에 보이는 순서대로 배치한다 (좌측 목록 → 교독문 순) */
  const checkedPrograms = [...fixedPrograms, ...responsiveReadings].filter((p) => checkedIds.has(p.id));

  const handleBatch = async () => {
    if (checkedPrograms.length === 0 || batchBusy) return;
    setActionError('');
    setBatchBusy(true);
    try {
      await onSelectMany(checkedPrograms);
      onClose();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : '선택한 프로그램을 배치하지 못했습니다.');
    } finally {
      setBatchBusy(false);
    }
  };

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
            <p className="mt-0.5 text-[11px] text-gray-500">카드를 체크하면 여러 개를 한꺼번에 배치할 수 있습니다. 개별 버튼으로 배치·송출도 그대로 됩니다.</p>
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
                <ProgramCard
                  key={program.id}
                  program={program}
                  onSelect={handleSelect}
                  checked={checkedIds.has(program.id)}
                  onToggle={() => toggleChecked(program.id)}
                />
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
                <ProgramCard
                  key={program.id}
                  program={program}
                  onSelect={handleSelect}
                  checked={checkedIds.has(program.id)}
                  onToggle={() => toggleChecked(program.id)}
                />
              ))}
            </div>
            {!loading && responsiveReadings.length === 0 && (
              <p className="rounded-lg border border-dashed border-[#3b3b3b] p-4 text-center text-xs leading-relaxed text-gray-600">
                검색 결과가 없습니다.<br />data/fixed-programs 폴더에 교독문 JSON을 추가하면 자동으로 표시됩니다.
              </p>
            )}
          </section>
        </div>

        {/* [FEATURE: FIXED_PROGRAM_BATCH] 일괄 배치 바 — 항상 표시(미선택 시 버튼 비활성)해
            "여러 개 골라 한꺼번에 배치" 동작을 눈에 띄게 한다. 송출 버튼은 두지 않는다
            (여러 섹션을 동시에 송출할 수는 없음 — 배치만). */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-amber-900/60 bg-amber-950/25 px-5 py-2.5">
          <p className="min-w-0 truncate text-[11px] text-amber-200">
            {checkedPrograms.length > 0 ? (
              <>
                <b>{checkedPrograms.length}개</b> 선택 —{' '}
                <span className="text-amber-300/80">
                  {checkedPrograms.map((p) => p.item.title).join(' · ')}
                </span>
              </>
            ) : (
              <span className="text-gray-500">카드를 체크하면 여러 개를 한꺼번에 배치할 수 있어요</span>
            )}
          </p>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setCheckedIds(new Set())}
              disabled={batchBusy || checkedPrograms.length === 0}
              className="h-8 rounded-md border border-[#444] px-2.5 text-[11px] text-gray-300 hover:bg-[#252525] disabled:opacity-30"
            >
              선택 해제
            </button>
            <button
              type="button"
              onClick={() => void handleBatch()}
              disabled={batchBusy || checkedPrograms.length === 0}
              className="h-8 rounded-md bg-amber-500 px-3 text-[11px] font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {batchBusy
                ? '배치 중…'
                : checkedPrograms.length > 0
                  ? `선택한 ${checkedPrograms.length}개 한꺼번에 배치`
                  : '선택한 항목 한꺼번에 배치'}
            </button>
          </div>
        </div>

        {loading && <p className="border-t border-[#2d2d2d] px-5 py-2 text-[11px] text-gray-500">고정 프로그램을 불러오는 중…</p>}
      </div>
    </div>,
    document.body,
  );
}
