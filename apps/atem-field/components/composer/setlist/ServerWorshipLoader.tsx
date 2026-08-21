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
import { resolveProgramCategory, shouldPreserveProgramElements } from '@/lib/generators/programTypes';
import type { Setlist, SetlistItem } from '@/lib/types';
import { formatDateISO, reapplyDesignToItem } from '@/lib/generators/worshipUploader';
import { loadDesignForProgram } from '@/lib/generators/designs/designLoader';
import type { ProgramDesign } from '@/lib/generators/designs/index';
import {
  firstVisibleItem,
  isHiddenScriptureItem,
  orderScriptureMainBeforeQuote,
} from '@/features/hidden-scripture/hiddenScripture'; // [FEATURE: HIDDEN_SCRIPTURE]
// [FEATURE: SERMON_COMPOSE_IMPORT] 입력웹 설교대지 → 프로그램 5종 (조립은 브라우저에서)
import { buildSermonPrograms, SERMON_IMPORT_GENERATOR } from '@/features/sermon-compose-import/buildSermonPrograms';
import type { SermonComposeCandidate } from '@/features/sermon-compose-import/types';
// [FEATURE: WORSHIP_PREP_IMPORT] 입력웹 준비찬양 → 곡마다 PPT 변환본 프로그램
import { buildWorshipPrepPrograms, WORSHIP_PREP_GENERATOR } from '@/features/worship-prep-import/buildWorshipPrepPrograms';
import type { CloudPrepSong, WorshipPrepSet } from '@/features/worship-prep-import/types';
import MissingPraiseModal from '@/features/worship-prep-import/MissingPraiseModal';
// [FEATURE: UPCOMING_WORSHIP_AUTOLOAD] 실행하면 도래하는 정기예배를 알아서 불러온다
import { pickUpcomingWorship } from '@/features/upcoming-worship-autoload/pickUpcomingWorship';

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
  // 워십 / 개별 프로그램 / 찬양대 3분류 (category 기준)
  const [worships, setWorships] = useState<WorshipGroup[]>([]);
  const [programGroups, setProgramGroups] = useState<WorshipGroup[]>([]);
  const [choirGroups, setChoirGroups] = useState<WorshipGroup[]>([]);
  const [cloudChoirPrograms, setCloudChoirPrograms] = useState<CloudChoirProgramCandidate[]>([]);
  // [FEATURE: SERMON_COMPOSE_IMPORT] 입력웹 설교대지 → 프로그램 5종
  const [sermonCandidates, setSermonCandidates] = useState<SermonComposeCandidate[]>([]);
  // [FEATURE: WORSHIP_PREP_IMPORT] 입력웹 준비찬양 셋
  const [prepSets, setPrepSets] = useState<WorshipPrepSet[]>([]);
  /* 변환본이 없는 곡 처리 창 — 누르면 PPT 검색이 열리고, 받으면 알아서 들어온다 */
  const [missingPrep, setMissingPrep] = useState<{ set: WorshipPrepSet; songs: CloudPrepSong[] } | null>(null);
  const [cloudError, setCloudError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [autoLoadId, setAutoLoadId] = useState<string | null>(null);
  const autoLoadedRef = useRef(false);
  // [FEATURE: UPCOMING_WORSHIP_AUTOLOAD] 도래하는 정기예배 자동 로드 — 실행당 1회
  const upcomingLoadedRef = useRef(false);
  const [upcomingNotice, setUpcomingNotice] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    setlists,
    currentSetlistId,
    addSetlist,
    addItem,
    updateItem,
    removeItem,
    reorderItems,
    setCurrentSetlist,
    setActiveItem,
    setActiveSection,
  } = useStore();
  // [FEATURE: UPCOMING_WORSHIP_AUTOLOAD] IndexedDB 복원이 끝나야 setlists 를 믿을 수 있다
  const hydrated = useStore((s) => s._hydrated);

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

      // 카테고리별로 분리 (worship / program / choir)
      const worshipPool: SavedProgram[] = [];
      const programPool: SavedProgram[] = [];
      const choirPool: SavedProgram[] = [];
      for (const p of programs) {
        const category = resolveProgramCategory(p);
        if (category === 'program') programPool.push(p);
        else if (category === 'choir') choirPool.push(p);
        else worshipPool.push(p);
      }

      // worshipId 기준 그룹핑 (워십·찬양대 공통)
      const groupByWorship = (pool: SavedProgram[]): WorshipGroup[] => {
        const map = new Map<string, SavedProgram[]>();
        for (const p of pool) {
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
        groups.sort((a, b) => b.programs[0].updatedAt - a.programs[0].updatedAt);
        return groups;
      };

      // 개별 프로그램은 각 프로그램 1개 = 그룹 1개 (자기 이름으로 표시)
      const programEntries: WorshipGroup[] = programPool
        .map((p) => ({
          worshipId: p.worshipId,
          worshipName: p.worshipName,
          programs: [p],
          existsLocally: setlists.some((sl) =>
            sl.items.some((item) => item.id === p.item.id)
          ),
        }))
        .sort((a, b) => b.programs[0].updatedAt - a.programs[0].updatedAt);

      setWorships(groupByWorship(worshipPool));
      setProgramGroups(programEntries);
      setChoirGroups(groupByWorship(choirPool));

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

      // [FEATURE: SERMON_COMPOSE_IMPORT] 입력웹에서 저장한 설교대지 목록
      try {
        const res = await fetch('/api/imports/sermon-compose?limit=20');
        const json = await res.json().catch(() => ({})) as {
          ok?: boolean;
          candidates?: SermonComposeCandidate[];
        };
        setSermonCandidates(res.ok && json.ok ? json.candidates ?? [] : []);
      } catch {
        setSermonCandidates([]);
      }

      // [FEATURE: WORSHIP_PREP_IMPORT] 입력웹에서 저장한 준비찬양 셋
      try {
        const res = await fetch('/api/imports/worship-prep?limit=60');
        const json = await res.json().catch(() => ({})) as { ok?: boolean; sets?: WorshipPrepSet[] };
        setPrepSets(res.ok && json.ok ? json.sets ?? [] : []);
      } catch {
        setPrepSets([]);
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
      // [FEATURE: SCRIPTURE_BEFORE_QUOTE] 말씀찾기(본문)은 말씀찾기(인용) 바로 위에 둔다.
      //   (예전에는 목록 맨 앞에 고정했다 — features/hidden-scripture 주석 참조)
      const after = useStore.getState().setlists.find((sl) => sl.id === targetId);
      if (after) {
        const ordered = orderScriptureMainBeforeQuote(after.items);
        const changed = ordered.some((item, index) => item.id !== after.items[index]?.id);
        if (changed) reorderItems(targetId, ordered);
      }
      // 현재 세트리스트 유지 → 기존 리스트 그대로, 다운로드분만 아래에 추가됨
    } else {
      // 현재 세트리스트가 없을 때만 이 워십으로 새 세트리스트 생성/전환
      const dateStr = group.worshipId.split('-')[0] ?? '';
      const newSetlist: Setlist = {
        id: group.worshipId,
        name: group.worshipName,
        date: formatDateISO(dateStr),
        // [FEATURE: SCRIPTURE_BEFORE_QUOTE] 새 세트리스트도 같은 순서 규칙 적용
        items: orderScriptureMainBeforeQuote(updatedItems),
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

  /**
   * [FEATURE: SERMON_COMPOSE_IMPORT]
   * 입력웹 설교대지 → 프로그램 5종을 이 브라우저에서 조립하고 서버에 올린 뒤 셋리스트에 넣는다.
   * 조립을 서버에서 하면 본문 넘침 분할이 사라지므로(canvas 측정) 반드시 여기서 한다.
   */
  /**
   * 그 생성기가 예전에 만들었지만 이번 회차에는 없는 프로그램을 서버와 세트리스트에서 뺀다.
   * keepIds 에 있는 것은 그대로 둔다 — 곧 최신 내용으로 덮어쓸 것들이다.
   */
  const removeStaleByGenerator = useCallback(
    async (worshipId: string, generator: string, keepIds: string[]) => {
      const keep = new Set(keepIds);
      let stale: SavedProgram[] = [];
      try {
        const res = await fetch(`/api/programs?worship=${encodeURIComponent(worshipId)}`);
        if (!res.ok) return;
        const { programs = [] } = (await res.json()) as { programs?: SavedProgram[] };
        stale = programs.filter(
          (p) => p.formData?.generator === generator && !keep.has(p.id),
        );
      } catch {
        return; // 목록을 못 읽으면 지우지 않는다 — 지나친 삭제보다 남는 편이 안전하다
      }

      for (const p of stale) {
        try {
          await fetch(`/api/programs/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
        } catch {
          // 개별 실패는 넘어간다 — 다음 생성 때 다시 시도된다
        }
        for (const sl of useStore.getState().setlists) {
          if (sl.items.some((i) => i.id === p.item.id)) removeItem(sl.id, p.item.id);
        }
      }
    },
    [removeItem],
  );

  /**
   * [FEATURE: WORSHIP_PREP_IMPORT] 준비찬양 셋 → 곡마다 PPT 변환본 프로그램.
   *
   * 설교대지와 같은 워십(=예배일자-worship)으로 묶어 저장하므로, 예배 당일
   * 자동 불러오기가 설교 프로그램과 함께 한 번에 집는다.
   */
  const handleImportPrep = useCallback(async (set: WorshipPrepSet) => {
    const busyId = `prep:${set.serviceDate}:${set.team}`;
    setLoadingId(busyId);
    setCloudError('');

    try {
      const result = await buildWorshipPrepPrograms(set);

      /* 이번 회차에 없는 곡(빼거나 이름이 바뀐 것)은 정리한다 — 이 생성기가 만든 것만 */
      await removeStaleByGenerator(
        result.worshipId,
        WORSHIP_PREP_GENERATOR,
        result.programs.map((p) => p.id),
      );

      const failed: string[] = [];
      for (let i = result.programs.length - 1; i >= 0; i -= 1) {
        const program = result.programs[i];
        try {
          const res = await fetch('/api/programs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(program),
          });
          if (!res.ok) failed.push(program.item.title);
        } catch {
          failed.push(program.item.title);
        }
      }

      if (failed.length > 0) setCloudError(`저장 실패: ${failed.join(', ')}`);

      /* 변환본이 없는 곡은 목록으로 띄운다 — 눌러서 받으면 자동감지가 채운다 */
      if (result.skipped.length > 0) {
        setOpen(false);
        setMissingPrep({
          set,
          songs: set.songs.filter((song) => result.skipped.includes(song.title.trim())),
        });
      }

      if (result.programs.length > 0) {
        await handleLoad({
          worshipId: result.worshipId,
          worshipName: result.worshipName,
          programs: result.programs,
          existsLocally: true,
        });
      }
    } catch (error) {
      console.error('[worship-prep-import] build failed', error);
      setCloudError(error instanceof Error ? error.message : '준비찬양 프로그램을 만들지 못했습니다.');
    } finally {
      setLoadingId((current) => (current === busyId ? null : current));
    }
  }, [handleLoad, removeStaleByGenerator]);

  const handleImportSermon = useCallback(async (candidate: SermonComposeCandidate) => {
    const busyId = `sermon:${candidate.outline.id}`;
    setLoadingId(busyId);
    setCloudError('');

    try {
      const result = await buildSermonPrograms(candidate.outline, candidate.subPrograms);

      if (result.programs.length === 0) {
        setCloudError('만들 수 있는 프로그램이 없습니다. 입력웹에서 본문이나 협조문을 확인해 주세요.');
        return;
      }

      /* 다시 생성하면 이번 회차에 없는 프로그램이 서버·세트리스트에 남는다.
         (찬양을 뺐다든지, 예전 순번 id 로 저장된 회차가 있다든지)
         이 생성기가 만든 것만 골라 지운다 — 사용자가 따로 넣은 프로그램은 건드리지 않는다. */
      await removeStaleByGenerator(result.worshipId, SERMON_IMPORT_GENERATOR, result.programs.map((p) => p.id));

      /* GET 이 updatedAt 내림차순이라 역순으로 저장해야 01번부터 순서대로 잡힌다. */
      const failed: string[] = [];
      for (let i = result.programs.length - 1; i >= 0; i -= 1) {
        const program = result.programs[i];
        try {
          const res = await fetch('/api/programs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(program),
          });
          if (!res.ok) failed.push(program.item.title);
        } catch {
          failed.push(program.item.title);
        }
      }

      const notes = [
        ...result.warnings,
        result.skippedPraise.length > 0
          ? `PPT 변환본을 찾지 못한 찬양: ${result.skippedPraise.join(', ')}`
          : '',
        failed.length > 0 ? `저장 실패: ${failed.join(', ')}` : '',
      ].filter(Boolean);
      if (notes.length > 0) setCloudError(notes.join(' · '));

      await handleLoad({
        worshipId: result.worshipId,
        worshipName: result.worshipName,
        programs: result.programs,
        existsLocally: true,
      });
    } catch (error) {
      console.error('[sermon-compose-import] build failed', error);
      setCloudError(
        error instanceof Error ? error.message : '설교대지 프로그램을 만들지 못했습니다.',
      );
    } finally {
      setLoadingId((current) => (current === busyId ? null : current));
    }
  }, [handleLoad, removeStaleByGenerator]);

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
    if (!autoLoadId || autoLoadedRef.current) return;
    const group =
      worships.find((w) => w.worshipId === autoLoadId) ??
      choirGroups.find((w) => w.worshipId === autoLoadId) ??
      programGroups.find((w) => w.worshipId === autoLoadId);
    if (group) {
      autoLoadedRef.current = true;
      handleLoad(group);
    }
  }, [autoLoadId, worships, choirGroups, programGroups, handleLoad]);

  // [FEATURE: UPCOMING_WORSHIP_AUTOLOAD]
  // 실행하면 목록을 한 번 받아 둔다. ?loadWorship= 로 들어온 경우는 그쪽이 처리하므로 비켜준다.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('loadWorship')) return;
    fetchWorships();
    // 마운트 시 1회만 (fetchWorships 는 setlists 변화 때마다 재생성된다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 목록이 오면 도래하는 정기예배 한 건을 자동으로 내려받는다.
  //   · setlists 는 IndexedDB 에서 비동기로 복원된다. _hydrated 를 기다리지 않으면
  //     복원 전 빈 목록을 보고 '없다'고 판단해 이미 있는 것을 또 넣는다.
  //   · 이미 로컬에 한 조각이라도 있으면 건너뛴다 — 지운 프로그램이 매번 되살아나지 않게.
  useEffect(() => {
    if (!hydrated || upcomingLoadedRef.current || autoLoadId || worships.length === 0) return;
    upcomingLoadedRef.current = true;

    const group = pickUpcomingWorship(worships);
    if (!group) return;

    const alreadyHere = group.programs.some((p) =>
      setlists.some((sl) => sl.items.some((i) => i.id === p.item.id)),
    );
    if (alreadyHere) return;

    setUpcomingNotice(`${group.worshipName} 자동 불러오는 중…`);
    handleLoad(group)
      .then(() => setUpcomingNotice(`${group.worshipName} 불러왔습니다`))
      .catch(() => setUpcomingNotice(''));
  }, [hydrated, worships, autoLoadId, setlists, handleLoad]);

  // 안내 문구는 잠깐만 띄운다
  useEffect(() => {
    if (!upcomingNotice) return;
    const t = setTimeout(() => setUpcomingNotice(''), 6000);
    return () => clearTimeout(t);
  }, [upcomingNotice]);

  // 워십·프로그램·찬양대 그룹 공용 항목 버튼
  const renderGroupButton = (group: WorshipGroup) => (
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
        <span className="text-[10px] text-gray-500 truncate">
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
  );

  const isEmpty =
    worships.length === 0 &&
    programGroups.length === 0 &&
    choirGroups.length === 0 &&
    cloudChoirPrograms.length === 0;

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

      {/* [FEATURE: WORSHIP_PREP_IMPORT] 변환본 없는 찬양 처리 창 */}
      {missingPrep && (
        <MissingPraiseModal
          set={missingPrep.set}
          missing={missingPrep.songs}
          onResolved={async (program) => {
            await handleLoad({
              worshipId: program.worshipId,
              worshipName: program.worshipName,
              programs: [program],
              existsLocally: true,
            });
          }}
          onClose={() => setMissingPrep(null)}
        />
      )}

      {/* [FEATURE: UPCOMING_WORSHIP_AUTOLOAD] 자동으로 불러온 예배 안내 — 6초 뒤 사라진다 */}
      {upcomingNotice && !open && (
        <div className="absolute left-0 top-full mt-1 whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-violet-900/90 border border-violet-600/50 text-[11px] text-violet-100 shadow-xl z-50">
          {upcomingNotice}
        </div>
      )}

      {/* 드롭다운 */}
      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-[#2a2a2a]">
            <p className="text-[11px] font-bold text-violet-400 uppercase tracking-wider">
              서버 저장 프로그램
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isEmpty && !cloudError ? (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-gray-500">저장된 프로그램이 없습니다</p>
              <p className="text-[10px] text-gray-600 mt-1">
                입력 페이지 또는 개별 저장으로 프로그램을 등록하세요
              </p>
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto py-1">
              {/* ── 워십 ── */}
              {worships.length > 0 && (
                <>
                  <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-violet-400 uppercase tracking-wider">
                    워십
                  </p>
                  {worships.map((group) => renderGroupButton(group))}
                </>
              )}

              {/* ── 개별 프로그램 ── */}
              {programGroups.length > 0 && (
                <div className="mt-1 border-t border-[#2a2a2a] pt-1">
                  <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                    프로그램
                  </p>
                  {programGroups.map((group) => renderGroupButton(group))}
                </div>
              )}

              {/* ── 찬양대(헵시다) ── */}
              {choirGroups.length > 0 && (
                <div className="mt-1 border-t border-[#2a2a2a] pt-1">
                  <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-rose-400 uppercase tracking-wider">
                    찬양대
                  </p>
                  {choirGroups.map((group) => renderGroupButton(group))}
                </div>
              )}

              {/* ── 입력웹 설교대지 [FEATURE: SERMON_COMPOSE_IMPORT] ── */}
              {sermonCandidates.length > 0 && (
                <div className="mt-1 border-t border-[#2a2a2a] pt-1">
                  <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-violet-400 uppercase tracking-wider">
                    입력웹 설교대지
                  </p>
                  {sermonCandidates.map((candidate) => {
                    const { outline, subPrograms } = candidate;
                    const meta = outline.metadata ?? {};
                    const title = meta.sermonTitle || meta.parsed?.sermonTitle || '제목 없음';
                    const scripture = meta.scriptureRef || meta.parsed?.scriptureRef || '';
                    const pointCount = meta.parsed?.points.length ?? 0;
                    const hymnCount = subPrograms.filter((p) => p.kind === 'hymn').length;
                    const praiseCount = subPrograms.filter((p) => p.kind === 'praise').length;
                    const isImporting = loadingId === `sermon:${outline.id}`;

                    return (
                      <button
                        key={outline.id}
                        onClick={() => handleImportSermon(candidate)}
                        disabled={isImporting}
                        className="w-full text-left px-3 py-2.5 transition-colors hover:bg-[#222]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-white truncate">{title}</p>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-900/50 text-violet-300 flex-shrink-0">
                            {isImporting ? '만드는 중' : '프로그램 생성'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] text-gray-400">
                            {outline.service_date ?? '날짜 없음'} {outline.service_type}
                          </span>
                          {scripture && <span className="text-[10px] text-gray-500">{scripture}</span>}
                          <span className="text-[10px] text-gray-500">
                            대지 {pointCount} · 찬송 {hymnCount} · 찬양 {praiseCount}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ── 입력웹 준비찬양 [FEATURE: WORSHIP_PREP_IMPORT] ── */}
              {prepSets.length > 0 && (
                <div className="mt-1 border-t border-[#2a2a2a] pt-1">
                  <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                    입력웹 준비찬양
                  </p>
                  {prepSets.map((set) => {
                    const busyId = `prep:${set.serviceDate}:${set.team}`;
                    const isImporting = loadingId === busyId;
                    return (
                      <div key={busyId} className="px-3 py-2.5 hover:bg-[#222] transition-colors">
                        <button
                          onClick={() => handleImportPrep(set)}
                          disabled={isImporting}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-white truncate">
                              {set.team} · {set.songs.length}곡
                            </p>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-900/50 text-emerald-300 flex-shrink-0">
                              {isImporting ? '만드는 중' : '프로그램 생성'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[10px] text-gray-400">
                              {set.serviceDate || '날짜 없음'} {set.serviceType}
                            </span>
                            <span className="text-[10px] text-gray-500 truncate">
                              {set.songs.map((song) => song.title).join(', ')}
                            </span>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

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
