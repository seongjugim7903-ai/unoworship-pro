'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ImageElement } from '@/lib/canvasTypes';
import type { SavedProgram } from '@/lib/generators/programTypes';

interface Props {
  onLoadProgram: (program: SavedProgram) => void | Promise<void>;
}

function formatUpdatedAt(value: number): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getProgramSearchText(program: SavedProgram): string {
  const sourceLabel = typeof program.formData?.sourceLabel === 'string'
    ? program.formData.sourceLabel
    : '';
  return [
    program.item.title,
    program.worshipName,
    sourceLabel,
  ].join(' ').toLowerCase();
}

function buildBrowserSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${query.trim()} PPT`)}`;
}

export default function QuickBiblePptSearch({ onLoadProgram }: Props) {
  const [savedPrograms, setSavedPrograms] = useState<SavedProgram[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [placingId, setPlacingId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    fetch('/api/programs?type=slide-images')
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? 'PPT 변환본 목록을 읽지 못했습니다.');
        if (!cancelled) {
          const programs = Array.isArray(data?.programs) ? data.programs as SavedProgram[] : [];
          setSavedPrograms([...programs].sort((a, b) => b.updatedAt - a.updatedAt));
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'PPT 변환본 목록을 읽지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredPrograms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return savedPrograms.slice(0, 8);
    return savedPrograms
      .filter((program) => getProgramSearchText(program).includes(q))
      .slice(0, 8);
  }, [savedPrograms, search]);

  const openBrowserSearch = () => {
    const q = search.trim();
    if (!q) return;
    const win = window.open(buildBrowserSearchUrl(q), '_blank', 'noopener,noreferrer');
    if (!win) setError('브라우저 팝업이 차단되었습니다. 검색어를 복사해 직접 검색해 주세요.');
  };

  const loadProgram = async (program: SavedProgram) => {
    if (placingId) return;
    setPlacingId(program.id);
    setError('');
    try {
      await onLoadProgram(program);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'PPT 변환본을 프로그램 목록에 배치하지 못했습니다.');
      setPlacingId('');
    }
  };

  return (
    <div className="rounded-xl border border-cyan-900/70 bg-cyan-950/20 p-3">
      <div className="mb-2">
        <p className="text-sm font-bold text-cyan-300">PPT 변환본 검색</p>
        <p className="mt-0.5 text-[11px] leading-4 text-gray-500">
          저장된 PPT 변환본을 찾아 말씀찾기(인용) 프로그램 바로 아래에 별도 프로그램으로 배치합니다.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (filteredPrograms[0]) void loadProgram(filteredPrograms[0]);
        }}
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="예: 나의 하나님, 설교대지, 특송 제목"
          className="h-10 min-w-0 flex-1 rounded-lg border border-[#34414a] bg-[#071016] px-3 text-sm text-white
                     placeholder-gray-600 outline-none focus:border-cyan-500"
        />
        <button
          type="button"
          onClick={openBrowserSearch}
          disabled={!search.trim()}
          className="h-10 rounded-lg border border-cyan-700 px-3 text-xs font-bold text-cyan-100
                     hover:bg-cyan-900/70 disabled:cursor-not-allowed disabled:opacity-40"
        >
          브라우저 검색
        </button>
      </form>

      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}

      <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-[#1f3038] bg-[#070b0e]">
        {loading ? (
          <div className="px-3 py-4 text-center text-xs text-gray-500">변환본 목록 불러오는 중...</div>
        ) : filteredPrograms.length === 0 ? (
          <div className="px-3 py-4 text-xs leading-5 text-gray-500">
            {savedPrograms.length === 0 ? '아직 저장된 PPT 변환본이 없습니다.' : '검색 결과가 없습니다.'}
            {search.trim() ? ' 필요하면 브라우저 검색으로 원본을 찾아 변환하세요.' : ''}
          </div>
        ) : (
          filteredPrograms.map((program) => {
            const firstImage = program.item.sections[0]?.elements?.find(
              (element): element is ImageElement => element.type === 'image',
            );
            const sourceLabel = typeof program.formData?.sourceLabel === 'string'
              ? program.formData.sourceLabel
              : '';
            return (
              <div
                key={program.id}
                className="flex items-center gap-3 border-b border-[#17232a] px-3 py-2.5 last:border-b-0"
              >
                {firstImage?.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={firstImage.src}
                    alt=""
                    loading="lazy"
                    className="h-10 w-16 flex-shrink-0 rounded bg-black object-cover"
                  />
                ) : (
                  <div className="h-10 w-16 flex-shrink-0 rounded bg-black/40" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-gray-100">
                    {program.item.title || program.worshipName}
                  </div>
                  <div className="truncate text-[11px] text-gray-500">
                    {program.item.sections.length}장 · {formatUpdatedAt(program.updatedAt)}
                    {sourceLabel ? ` · ${sourceLabel}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadProgram(program)}
                  disabled={!!placingId}
                  className="h-8 flex-shrink-0 rounded-md bg-cyan-500 px-3 text-xs font-bold text-black
                             hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {placingId === program.id ? '배치 중...' : '인용 아래 배치'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
