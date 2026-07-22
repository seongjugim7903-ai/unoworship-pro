'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import type { SavedProgram } from '@/lib/generators/programTypes';
import type { Setlist } from '@/lib/types';
import type { CanvasElement, ImageElement } from '@/lib/canvasTypes';
import { compressImageDataUrl } from '@/lib/imageProcessing/compressImageDataUrl';

interface PptSource {
  id: string;
  type: 'image-folder' | 'presentation';
  name: string;
  imageCount: number;
  updatedAt: number;
}

type LibraryType = 'hymns' | 'praise';
type KeyMode = 'none' | 'luma-invert';
type FitMode = 'contain' | 'fill' | 'cover';

export function usePptSlideImporter() {
  const [isOpen, setOpen] = useState(false);
  const [initialMode, setInitialMode] = useState<'convert' | 'load'>('convert');
  return {
    isOpen,
    initialMode,
    open: useCallback((mode: 'convert' | 'load' = 'convert') => {
      setInitialMode(mode);
      setOpen(true);
    }, []),
    close: useCallback(() => setOpen(false), []),
  };
}

function formatDateISO(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatUpdatedAt(value: number): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

/**
 * 서버가 원본 base64 로 구워 준 PPT/악보 이미지를 삽입 전에 다운스케일+압축한다.
 * 슬라이드가 많을 수 있어 메모리 스파이크 방지를 위해 순차 처리. onProgress 로 진행률 통지.
 */
async function compressProgramImages(
  program: SavedProgram,
  onProgress?: (done: number, total: number) => void,
): Promise<SavedProgram> {
  const total = program.item.sections.reduce(
    (n, s) => n + (s.elements ?? []).filter((el) => el.type === 'image' && typeof el.src === 'string' && el.src.startsWith('data:')).length,
    0,
  );
  if (total === 0) return program;

  let done = 0;
  const newSections = [];
  for (const section of program.item.sections) {
    const newEls: CanvasElement[] = [];
    for (const el of section.elements ?? []) {
      if (el.type === 'image' && typeof el.src === 'string' && el.src.startsWith('data:')) {
        // 악보/슬라이드 선화 보존을 위해 고품질(keepAlpha) 압축
        const r = await compressImageDataUrl(el.src, { keepAlpha: true });
        newEls.push(r.changed ? { ...el, src: r.dataUrl } : el);
        done += 1;
        onProgress?.(done, total);
      } else {
        newEls.push(el);
      }
    }
    newSections.push({ ...section, elements: newEls });
  }

  return { ...program, item: { ...program.item, sections: newSections } };
}

export function PptSlideModal({ isOpen, onClose, initialMode = 'convert' }: { isOpen: boolean; onClose: () => void; initialMode?: 'convert' | 'load' }) {
  const [sources, setSources] = useState<PptSource[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [programName, setProgramName] = useState('');
  const [libraryType, setLibraryType] = useState<LibraryType>('praise');
  const [keyMode, setKeyMode] = useState<KeyMode>('none');
  const [fitMode, setFitMode] = useState<FitMode>('fill');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  const [inboxDir, setInboxDir] = useState('');

  // ── 변환본 불러오기 탭 ──
  const [mode, setMode] = useState<'convert' | 'load'>(initialMode);
  const [savedPrograms, setSavedPrograms] = useState<SavedProgram[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedSearch, setSavedSearch] = useState('');

  const {
    currentSetlistId,
    setlists,
    addSetlist,
    addItem,
    updateItem,
    setCurrentSetlist,
    setActiveItem,
    setActiveSection,
  } = useStore();

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedId) ?? null,
    [sources, selectedId]
  );

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/imports/ppt-slides');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'PPT 이미지 폴더 목록을 읽지 못했습니다.');
      const nextSources = (data.sources ?? []) as PptSource[];
      setSources(nextSources);
      setInboxDir(data.inboxDir ?? '');
      const first = nextSources[0];
      if (first) {
        setSelectedId((prev) => prev || first.id);
        setProgramName((prev) => prev || first.name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PPT 이미지 폴더 목록을 읽지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSavedPrograms = useCallback(async () => {
    setSavedLoading(true);
    try {
      const res = await fetch('/api/programs?type=slide-images');
      if (!res.ok) return;
      const { programs } = (await res.json()) as { programs: SavedProgram[] };
      setSavedPrograms([...programs].sort((a, b) => b.updatedAt - a.updatedAt));
    } catch {
      /* 조용히 무시 — 변환 탭은 계속 사용 가능 */
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      loadSources();
      loadSavedPrograms();
    }
  }, [isOpen, initialMode, loadSources, loadSavedPrograms]);

  const filteredSaved = useMemo(() => {
    const q = savedSearch.trim().toLowerCase();
    if (!q) return savedPrograms;
    return savedPrograms.filter(
      (p) =>
        (p.item.title || '').toLowerCase().includes(q) ||
        (p.worshipName || '').toLowerCase().includes(q),
    );
  }, [savedPrograms, savedSearch]);

  useEffect(() => {
    if (selectedSource && !programName.trim()) {
      setProgramName(selectedSource.name);
    }
  }, [programName, selectedSource]);

  const insertProgram = useCallback((program: SavedProgram) => {
    const targetSetlistId = currentSetlistId || program.worshipId;
    const existingSetlist = setlists.find((setlist) => setlist.id === targetSetlistId);

    if (!existingSetlist) {
      const newSetlist: Setlist = {
        id: targetSetlistId,
        name: currentSetlistId ? '현장 예배' : program.worshipName,
        date: formatDateISO(),
        items: [program.item],
        createdAt: Date.now(),
      };
      addSetlist(newSetlist);
      setCurrentSetlist(newSetlist.id);
    } else {
      const found = existingSetlist.items.some((item) => item.id === program.item.id);
      if (found) {
        updateItem(existingSetlist.id, program.item.id, program.item);
      } else {
        addItem(existingSetlist.id, program.item);
      }
    }

    setActiveItem(program.item.id);
    setActiveSection(program.item.sections[0]?.id ?? null);
  }, [
    addItem,
    addSetlist,
    currentSetlistId,
    setActiveItem,
    setActiveSection,
    setCurrentSetlist,
    setlists,
    updateItem,
  ]);

  const handleLoadSaved = useCallback((program: SavedProgram) => {
    insertProgram(program);
    onClose();
  }, [insertProgram, onClose]);

  const handleImport = useCallback(async () => {
    if (!selectedSource) return;
    setImporting(true);
    setError('');
    try {
      const res = await fetch('/api/imports/ppt-slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: selectedSource.id,
          sourceType: selectedSource.type,
          name: programName.trim() || selectedSource.name,
          libraryType,
          keyMode,
          fit: fitMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = typeof data.detail === 'string'
          ? data.detail.replace(/^Error:\s*/i, '').trim()
          : '';
        throw new Error(detail || data.error || 'PPT 슬라이드를 변환하지 못했습니다.');
      }
      // 서버가 원본 base64 로 굽기 때문에 삽입 전에 다운스케일+압축(수동 업로드와 동일 처리).
      const compressedProgram = await compressProgramImages(
        data.program as SavedProgram,
        (done, total) => setProgressMsg(`이미지 최적화 중… ${done}/${total}`),
      );
      setProgressMsg('');
      insertProgram(compressedProgram);
      if (data.archiveError) {
        setError(`가져오기는 완료됐지만 원본 아카이브에 실패했습니다: ${data.archiveError}`);
        await loadSources();
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PPT 이미지 폴더를 가져오지 못했습니다.');
    } finally {
      setImporting(false);
      setProgressMsg('');
    }
  }, [fitMode, insertProgram, keyMode, libraryType, loadSources, onClose, programName, selectedSource]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 backdrop-blur-sm">
      <div className="w-[560px] max-w-[calc(100vw-32px)] rounded-xl border border-[#333] bg-[#151515] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#292929] px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-400">
              PPT Image Folder
            </p>
            <h2 className="mt-1 text-lg font-bold text-white">PPT 이미지 폴더 가져오기</h2>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md text-gray-400 hover:bg-white/10 hover:text-white"
            title="닫기"
          >
            ×
          </button>
        </div>

        {/* 탭: 새로 변환 / 변환본 불러오기 */}
        <div className="flex gap-1 border-b border-[#292929] px-4 pt-3">
          <button
            onClick={() => setMode('convert')}
            className={`rounded-t-md px-3 py-2 text-sm font-semibold ${
              mode === 'convert' ? 'bg-[#101010] text-cyan-300 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            새로 변환
          </button>
          <button
            onClick={() => setMode('load')}
            className={`rounded-t-md px-3 py-2 text-sm font-semibold ${
              mode === 'load' ? 'bg-[#101010] text-cyan-300 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            변환본 불러오기
          </button>
        </div>

        {mode === 'convert' ? (
        <>
        <div className="space-y-4 px-5 py-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-300">이미지 폴더</label>
              <button
                onClick={loadSources}
                disabled={loading}
                className="rounded-md border border-[#333] px-2 py-1 text-[11px] text-gray-300 hover:bg-[#222] disabled:opacity-50"
              >
                새로고침
              </button>
            </div>

            {loading ? (
              <div className="rounded-lg border border-[#333] bg-[#101010] px-3 py-5 text-center text-sm text-gray-400">
                폴더를 읽는 중입니다...
              </div>
            ) : sources.length === 0 ? (
              <div className="rounded-lg border border-[#333] bg-[#101010] px-3 py-4 text-sm text-gray-400">
                가져올 이미지 폴더가 없습니다.
                {inboxDir && (
                  <div className="mt-2 break-all rounded bg-black/30 px-2 py-1 text-[11px] text-gray-500">
                    {inboxDir}
                  </div>
                )}
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-[#333] bg-[#101010]">
                {sources.map((source) => (
                  <button
                    key={source.id}
                    onClick={() => {
                      setSelectedId(source.id);
                      setProgramName(source.name);
                    }}
                    className={`flex w-full items-center justify-between border-b border-[#222] px-3 py-2.5 text-left last:border-b-0 ${
                      selectedId === source.id
                        ? 'bg-cyan-500/15 text-white'
                        : 'text-gray-300 hover:bg-[#1c1c1c]'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{source.name}</span>
                      <span className="text-[11px] text-gray-500">
                        {source.type === 'presentation' ? 'PPT/PPTX' : '이미지 폴더'} · {formatUpdatedAt(source.updatedAt)}
                      </span>
                    </span>
                    <span className="ml-3 rounded-full bg-white/10 px-2 py-1 text-[11px] text-gray-300">
                      {source.type === 'presentation' ? '변환' : `${source.imageCount}장`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-300">프로그램 이름</label>
            <input
              value={programName}
              onChange={(event) => setProgramName(event.target.value)}
              placeholder="예: 나의 하나님"
              className="h-10 w-full rounded-lg border border-[#333] bg-[#0f0f0f] px-3 text-sm text-white outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-300">저장 분류</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLibraryType('hymns')}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  libraryType === 'hymns'
                    ? 'border-cyan-400 bg-cyan-500/15 text-white'
                    : 'border-[#333] bg-[#101010] text-gray-300 hover:bg-[#1c1c1c]'
                }`}
              >
                <span className="block font-semibold">01_HYMNS</span>
                <span className="text-[11px] text-gray-500">찬송가 / 정규 찬송 자료</span>
              </button>
              <button
                type="button"
                onClick={() => setLibraryType('praise')}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  libraryType === 'praise'
                    ? 'border-cyan-400 bg-cyan-500/15 text-white'
                    : 'border-[#333] bg-[#101010] text-gray-300 hover:bg-[#1c1c1c]'
                }`}
              >
                <span className="block font-semibold">02_PRAISE</span>
                <span className="text-[11px] text-gray-500">찬양곡 / 콘티용 악보</span>
              </button>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#333] bg-[#101010] px-3 py-3 text-sm text-gray-200 hover:bg-[#1c1c1c]">
            <input
              type="checkbox"
              checked={keyMode === 'luma-invert'}
              onChange={(event) => setKeyMode(event.target.checked ? 'luma-invert' : 'none')}
              className="mt-1 h-4 w-4 accent-cyan-400"
            />
            <span>
              <span className="block font-semibold">ATEM DSK/Luma Key용으로 변환</span>
              <span className="mt-1 block text-[11px] leading-4 text-gray-500">
                기본은 PPT 한 장 전체를 이미지로 보존합니다. 검은 가사/악보선만 카메라 위에 얹어야 할 때만 이 옵션을 켭니다.
              </span>
            </span>
          </label>

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-300">슬라이드 표시 방식</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  value: 'fill' as const,
                  title: '꽉 채움',
                  description: '기본 · 폭 맞춤',
                },
                {
                  value: 'contain' as const,
                  title: '원본 보존',
                  description: '여백 가능',
                },
                {
                  value: 'cover' as const,
                  title: '화면 채움',
                  description: '가장자리 잘림',
                },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFitMode(option.value)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    fitMode === option.value
                      ? 'border-cyan-400 bg-cyan-500/15 text-white'
                      : 'border-[#333] bg-[#101010] text-gray-300 hover:bg-[#1c1c1c]'
                  }`}
                >
                  <span className="block font-semibold">{option.title}</span>
                  <span className="text-[11px] text-gray-500">{option.description}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-gray-500">
              기본값은 4:3 슬라이드도 16:9 송출 화면 너비에 맞게 강제로 늘립니다. 원본 비율이 중요할 때만 원본 보존을 선택합니다.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          {progressMsg && (
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
              {progressMsg}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#292929] px-5 py-4">
          <button
            onClick={onClose}
            className="h-9 rounded-md border border-[#333] px-4 text-sm text-gray-300 hover:bg-[#222]"
          >
            취소
          </button>
          <button
            onClick={handleImport}
            disabled={!selectedSource || importing}
            className="h-9 rounded-md bg-cyan-500 px-4 text-sm font-semibold text-black hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? progressMsg || '가져오는 중...' : '프로그램으로 가져오기'}
          </button>
        </div>
        </>
        ) : (
        <>
          {/* ── 변환본 불러오기 ── */}
          <div className="space-y-3 px-5 py-4">
            <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs leading-5 text-cyan-100">
              이미 변환해 저장한 송출용 슬라이드(FILES)를 검색해 현재 예배에 프로그램으로 불러옵니다. 다시 변환할 필요 없이 바로 사용합니다.
            </div>
            <input
              value={savedSearch}
              onChange={(e) => setSavedSearch(e.target.value)}
              placeholder="이름으로 검색 (예: 나의 하나님)"
              className="h-10 w-full rounded-lg border border-[#333] bg-[#0f0f0f] px-3 text-sm text-white outline-none focus:border-cyan-500"
            />
            {savedLoading ? (
              <div className="rounded-lg border border-[#333] bg-[#101010] px-3 py-5 text-center text-sm text-gray-400">
                불러오는 중…
              </div>
            ) : filteredSaved.length === 0 ? (
              <div className="rounded-lg border border-[#333] bg-[#101010] px-3 py-4 text-sm text-gray-400">
                {savedPrograms.length === 0 ? '아직 변환해 저장한 PPT가 없습니다.' : '검색 결과가 없습니다.'}
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto rounded-lg border border-[#333] bg-[#101010]">
                {filteredSaved.map((p) => {
                  const firstImg = p.item.sections[0]?.elements?.find(
                    (el): el is ImageElement => el.type === 'image',
                  );
                  const thumb = firstImg?.src;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 border-b border-[#222] px-3 py-2.5 last:border-b-0"
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          loading="lazy"
                          className="h-10 w-16 flex-shrink-0 rounded bg-black object-cover"
                        />
                      ) : (
                        <div className="h-10 w-16 flex-shrink-0 rounded bg-black/40" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-gray-100">
                          {p.item.title || p.worshipName}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {p.item.sections.length}장 · {formatUpdatedAt(p.updatedAt)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleLoadSaved(p)}
                        className="h-8 flex-shrink-0 rounded-md bg-cyan-500 px-3 text-xs font-semibold text-black hover:bg-cyan-400"
                      >
                        불러오기
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#292929] px-5 py-4">
            <button
              onClick={onClose}
              className="h-9 rounded-md border border-[#333] px-4 text-sm text-gray-300 hover:bg-[#222]"
            >
              닫기
            </button>
          </div>
        </>
        )}
      </div>
    </div>
  );
}
