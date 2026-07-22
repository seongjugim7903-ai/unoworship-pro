'use client';

/**
 * ServerWorshipLoader — 서버에 저장된 워십 프로그램을 로컬에 다운로드
 *
 * SetlistPanel 상단 헤더에 배치.
 * 클릭 시 드롭다운으로 서버에 저장된 워십 목록 표시.
 * 선택 시 해당 워십의 모든 프로그램을 로컬 스토어에 로드.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import type { SavedProgram } from '@/lib/generators/programTypes';
import { shouldPreserveProgramElements } from '@/lib/generators/programTypes';
import type { Setlist, SetlistItem } from '@/lib/types';
import { formatDateISO, reapplyDesignToItem } from '@/lib/generators/worshipUploader';
import { loadDesignForProgram } from '@/lib/generators/designs/designLoader';
import type { ProgramDesign } from '@/lib/generators/designs/index';
import { firstVisibleItem, isHiddenScriptureItem } from '@/features/hidden-scripture/hiddenScripture'; // [FEATURE: HIDDEN_SCRIPTURE]

/** worshipId 기준으로 그룹핑된 워십 */
interface WorshipGroup {
  worshipId: string;
  worshipName: string;
  programs: SavedProgram[];
  /** 이미 로컬에 존재하는지 */
  existsLocally: boolean;
}

interface CloudChoirProgramCandidate {
  id: string;
  requestId: string;
  programId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  sectionCount: number;
  imageCount: number;
}

export default function ServerWorshipLoader() {
  const [open, setOpen] = useState(false);
  const [worships, setWorships] = useState<WorshipGroup[]>([]);
  const [cloudChoirPrograms, setCloudChoirPrograms] = useState<CloudChoirProgramCandidate[]>([]);
  const [cloudError, setCloudError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [autoLoadId, setAutoLoadId] = useState<string | null>(null);
  const autoLoadedRef = useRef(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    setlists,
    currentSetlistId,
    addSetlist,
    addItem,
    updateItem,
    reorderItems,
    setCurrentSetlist,
    setActiveItem,
    setActiveSection,
  } = useStore();

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // 서버에서 목록 로드
  const fetchWorships = useCallback(async () => {
    setLoading(true);
    setCloudError('');
    try {
      const res = await fetch('/api/programs');
      const { programs }: { programs: SavedProgram[] } = res.ok
        ? await res.json()
        : { programs: [] };

      // worshipId 기준 그룹핑
      const map = new Map<string, SavedProgram[]>();
      for (const p of programs) {
        const list = map.get(p.worshipId) || [];
        list.push(p);
        map.set(p.worshipId, list);
      }

      const groups: WorshipGroup[] = [];
      for (const [worshipId, progs] of map) {
        groups.push({
          worshipId,
          worshipName: progs[0].worshipName,
          programs: progs,
          existsLocally: setlists.some((sl) => sl.id === worshipId),
        });
      }

      // 최신순 정렬
      groups.sort((a, b) => b.programs[0].updatedAt - a.programs[0].updatedAt);
      setWorships(groups);

      try {
        const cloudRes = await fetch('/api/imports/choir-supabase?limit=20');
        const cloudJson = await cloudRes.json().catch(() => ({})) as {
          ok?: boolean;
          message?: string;
          programs?: CloudChoirProgramCandidate[];
        };

        if (cloudRes.ok && cloudJson.ok) {
          setCloudChoirPrograms(cloudJson.programs ?? []);
        } else {
          setCloudChoirPrograms([]);
          setCloudError(cloudJson.message ?? '클라우드 찬양대 목록을 불러오지 못했습니다.');
        }
      } catch {
        setCloudChoirPrograms([]);
        setCloudError('클라우드 찬양대 목록을 불러오지 못했습니다.');
      }
    } catch {
      // 무시
    } finally {
      setLoading(false);
    }
  }, [setlists]);

  const handleOpen = useCallback(() => {
    setOpen((prev) => {
      if (!prev) fetchWorships();
      return !prev;
    });
  }, [fetchWorships]);

  // 워십 다운로드 → 로컬 스토어에 추가 (최신 디자인 적용)
  const handleLoad = useCallback(async (group: WorshipGroup) => {
    setLoadingId(group.worshipId);

    // 프로그램 타입별 최신 디자인 로드
    const designCache = new Map<string, ProgramDesign | null>();
    async function getDesign(type: string): Promise<ProgramDesign | null> {
      if (designCache.has(type)) return designCache.get(type)!;
      try {
        const design = await loadDesignForProgram(type);
        designCache.set(type, design);
        return design;
      } catch {
        designCache.set(type, null);
        return null;
      }
    }

    // 각 프로그램에 최신 디자인 재적용
    const updatedItems: SetlistItem[] = [];
    for (const p of group.programs) {
      const design = shouldPreserveProgramElements(p) ? null : await getDesign(p.type);
      const item = design ? reapplyDesignToItem(p.item, design) : p.item;
      updatedItems.push(item);
    }

    // [FIX] 기존 리스트가 사라지지 않게: 다운로드는 '현재 보고 있는 세트리스트에 추가'한다.
    //   (워십별로 화면을 갈아끼우던 setCurrentSetlist 전환을 제거 — 데이터는 늘 안전했으나
    //    전환 때문에 이전 프로그램들이 숨겨져 "사라진 것처럼" 보였음.)
    const targetId =
      currentSetlistId && setlists.some((sl) => sl.id === currentSetlistId)
        ? currentSetlistId
        : null;

    if (targetId) {
      const target = setlists.find((sl) => sl.id === targetId)!;
      for (const item of updatedItems) {
        if (target.items.some((i) => i.id === item.id)) {
          // 같은 프로그램(id) 재다운로드 → 최신 내용으로 갱신 (중복 추가 방지)
          updateItem(targetId, item.id, {
            sections: item.sections,
            promptLayout: item.promptLayout,
            style: item.style,
          });
        } else {
          addItem(targetId, item);
        }
      }
      // [FEATURE: SCRIPTURE_FIRST] 말씀찾기(본문) 프로그램(hiddenScripture 플래그)은 항상
      //   프로그램 목록 맨 앞 = 전역 번호 1번부터 절 번호와 일치하도록 배치한다.
      //   (숨김 동작은 2026-07-10 제거 — 플래그는 이 맨앞 배치 식별용으로만 사용)
      const after = useStore.getState().setlists.find((sl) => sl.id === targetId);
      if (after) {
        const scriptureItems = after.items.filter(isHiddenScriptureItem);
        if (scriptureItems.length > 0 && after.items[0]?.id !== scriptureItems[0].id) {
          const rest = after.items.filter((i) => !isHiddenScriptureItem(i));
          reorderItems(targetId, [...scriptureItems, ...rest]);
        }
      }
      // 현재 세트리스트 유지 → 기존 리스트 그대로, 다운로드분만 아래에 추가됨
    } else {
      // 현재 세트리스트가 없을 때만 이 워십으로 새 세트리스트 생성/전환
      const dateStr = group.worshipId.split('-')[0] ?? '';
      const newSetlist: Setlist = {
        id: group.worshipId,
        name: group.worshipName,
        date: formatDateISO(dateStr),
        items: updatedItems,
        createdAt: group.programs[0].createdAt,
      };
      addSetlist(newSetlist);
      setCurrentSetlist(group.worshipId);
    }

    // [FEATURE: HIDDEN_SCRIPTURE] 숨김 말씀찾기(본문) 프로그램은 건너뛰고 첫 일반 프로그램을 활성화
    const firstItem = firstVisibleItem(updatedItems);
    if (firstItem) {
      setActiveItem(firstItem.id);
      if (firstItem.sections[0]) {
        setActiveSection(firstItem.sections[0].id);
      }
    }

    // 상태 업데이트
    setWorships((prev) =>
      prev.map((w) =>
        w.worshipId === group.worshipId ? { ...w, existsLocally: true } : w
      )
    );
    setLoadingId(null);
    setOpen(false);
  }, [setlists, currentSetlistId, addSetlist, addItem, updateItem, reorderItems, setCurrentSetlist, setActiveItem, setActiveSection]);

  const handleImportCloudChoir = useCallback(async (candidate: CloudChoirProgramCandidate) => {
    const cloudLoadingId = `cloud:${candidate.id}`;
    setLoadingId(cloudLoadingId);
    setCloudError('');

    try {
      const res = await fetch('/api/imports/choir-supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: candidate.requestId,
          programId: candidate.programId,
          latest: false,
        }),
      });
      const result = await res.json().catch(() => ({})) as {
        ok?: boolean;
        message?: string;
        program?: SavedProgram;
      };

      if (!res.ok || !result.ok || !result.program) {
        setCloudError(result.message ?? '클라우드 찬양대 프로그램을 가져오지 못했습니다.');
        return;
      }

      await handleLoad({
        worshipId: result.program.worshipId,
        worshipName: result.program.worshipName,
        programs: [result.program],
        existsLocally: true,
      });
    } catch {
      setCloudError('클라우드 찬양대 프로그램을 가져오지 못했습니다.');
    } finally {
      setLoadingId((current) => (current === cloudLoadingId ? null : current));
    }
  }, [handleLoad]);

  // 입력 페이지에서 ?loadWorship=<worshipId> 로 진입하면 목록을 받아 해당 워십을 1회 자동 로드
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('loadWorship');
    if (!id) return;
    setAutoLoadId(id);
    fetchWorships();
    // 마운트 시 1회만 실행 (fetchWorships 는 setlists 변화 때마다 재생성되므로 의도적으로 제외)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoLoadId || autoLoadedRef.current || worships.length === 0) return;
    const group = worships.find((w) => w.worshipId === autoLoadId);
    if (group) {
      autoLoadedRef.current = true;
      handleLoad(group);
    }
  }, [autoLoadId, worships, handleLoad]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 트리거 버튼 */}
      <button
        onClick={handleOpen}
        title="서버에서 워십 불러오기"
        className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center
                   transition-colors text-sm ${
                     open
                       ? 'bg-violet-600 text-white'
                       : 'bg-[#1a1a2e] hover:bg-violet-700 text-violet-400 hover:text-white'
                   }`}
      >
        ↓
      </button>

      {/* 드롭다운 */}
      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-[#2a2a2a]">
            <p className="text-[11px] font-bold text-violet-400 uppercase tracking-wider">
              서버 저장 워십
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : worships.length === 0 && cloudChoirPrograms.length === 0 && !cloudError ? (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-gray-500">저장된 워십이 없습니다</p>
              <p className="text-[10px] text-gray-600 mt-1">
                입력 페이지에서 프로그램을 등록하세요
              </p>
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto py-1">
              {worships.length > 0 && cloudChoirPrograms.length > 0 && (
                <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  로컬 저장 워십
                </p>
              )}
              {worships.map((group) => (
                <button
                  key={group.worshipId}
                  onClick={() => handleLoad(group)}
                  disabled={loadingId === group.worshipId}
                  className={`w-full text-left px-3 py-2.5 transition-colors hover:bg-[#222] ${
                    group.existsLocally ? 'opacity-70' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-white truncate">
                      {group.worshipName}
                    </p>
                    {group.existsLocally ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-900/50 text-green-400 flex-shrink-0">
                        로컬
                      </span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-900/50 text-violet-400 flex-shrink-0">
                        다운로드
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-400">
                      {group.programs.length}개 프로그램
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {group.programs
                        .filter((p) => !isHiddenScriptureItem(p.item))
                        .map((p) => p.item.title.replace('[찬양대] ', ''))
                        .join(', ')}
                    </span>
                  </div>
                  {loadingId === group.worshipId && (
                    <div className="mt-1 h-0.5 bg-violet-500/30 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full animate-pulse w-2/3" />
                    </div>
                  )}
                </button>
              ))}

              {cloudChoirPrograms.length > 0 && (
                <div className="mt-1 border-t border-[#2a2a2a] pt-1">
                  <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">
                    클라우드 찬양대
                  </p>
                  {cloudChoirPrograms.map((candidate) => {
                    const isImporting = loadingId === `cloud:${candidate.id}`;
                    return (
                      <button
                        key={candidate.id}
                        onClick={() => handleImportCloudChoir(candidate)}
                        disabled={isImporting}
                        className="w-full text-left px-3 py-2.5 transition-colors hover:bg-[#222]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-white truncate">
                            {candidate.title}
                          </p>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-900/50 text-cyan-300 flex-shrink-0">
                            가져오기
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-400">
                            {candidate.sectionCount}개 섹션
                          </span>
                          <span className="text-[10px] text-gray-500">
                            이미지 {candidate.imageCount}장
                          </span>
                        </div>
                        {isImporting && (
                          <div className="mt-1 h-0.5 bg-cyan-500/30 rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-400 rounded-full animate-pulse w-2/3" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {cloudError && (
                <div className="mx-3 my-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-2.5 py-2">
                  <p className="text-[10px] leading-relaxed text-amber-300">
                    {cloudError}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
