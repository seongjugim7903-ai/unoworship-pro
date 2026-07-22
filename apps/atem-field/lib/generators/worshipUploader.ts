/**
 * lib/generators/worshipUploader.ts
 * 워쉽 업로더 — 모든 입력 페이지(찬양콘티, 설교대지, 주보, 찬양대 자막요청 등)가
 * 생성한 프로그램(SetlistItem)을 UnoLive 셋리스트에 자동 등록하는 공통 모듈.
 *
 * 동작:
 *   1. worshipId (예: "20260415-수요예배") 로 기존 셋리스트 탐색
 *   2. 없으면 새 셋리스트 생성
 *   3. 프로그램(SetlistItem)을 해당 셋리스트에 추가
 *   4. 이미 같은 id 의 프로그램이 있으면 교체 (재작성 대응)
 */

import { useStore } from '@/lib/store';
import type { Setlist, SetlistItem, Section } from '@/lib/types';
import type { CanvasElement } from '@/lib/canvasTypes';
import type { SavedProgram } from './programTypes';
import { shouldPreserveProgramElements } from './programTypes';
import type { ProgramDesign } from './designs/index';
import { loadDesignForProgram } from './designs/designLoader';

/**
 * 예배 워쉽ID 생성
 * @param date  YYYYMMDD 문자열
 * @param worship  정기예배명 (예: "주일낮예배", "수요예배")
 */
export function makeWorshipId(date: string, worship: string): string {
  return `${date}-${worship}`;
}

/**
 * 날짜 문자열을 YYYY-MM-DD 형식으로 변환 (셋리스트 date 필드용)
 */
export function formatDateISO(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * 섹션 요소를 고유 ID 로 복제
 */
function cloneElements(elements: CanvasElement[], sectionId: string): CanvasElement[] {
  return elements.map((el) => ({
    ...el,
    id: `${el.id}-${sectionId}-${Date.now()}`,
  }));
}

/**
 * 섹션이 표지인지 판별 (label 이 '표지' 이거나 colorMark 가 '#facc15')
 */
function isCoverSection(section: Section): boolean {
  return section.label === '표지' || section.colorMark === '#facc15';
}

/**
 * 섹션이 비고/메모인지 판별 (label 이 '비고')
 */
function isNoteSection(section: Section): boolean {
  return section.label === '비고';
}

/**
 * 최신 디자인을 기존 SetlistItem 의 섹션에 재적용.
 * 텍스트(text) 는 유지하고 elements 만 최신 디자인으로 교체.
 * 비고 섹션은 elements 가 없으므로 스킵.
 */
export function reapplyDesignToItem(item: SetlistItem, design: ProgramDesign): SetlistItem {
  const updatedSections = item.sections.map((section) => {
    // 비고 섹션은 디자인 적용 불필요
    if (isNoteSection(section)) return section;

    // 표지 / 일반 섹션 구분
    const isCover = isCoverSection(section);
    const sectionDesign = isCover
      ? (design.coverSection ?? design.defaultSection)
      : design.defaultSection;

    const newElements = cloneElements(sectionDesign.elements, section.id);

    // 디자인 점검 로그
    const oldEl = section.elements[0] as unknown as Record<string, unknown> | undefined;
    const newEl = newElements[0] as unknown as Record<string, unknown> | undefined;
    if (oldEl || newEl) {
      const changed = oldEl?.fontSize !== newEl?.fontSize || oldEl?.x !== newEl?.x || oldEl?.y !== newEl?.y;
      console.log(
        `[designApply] ${item.title} > ${section.label}${isCover ? '(표지)' : ''}:`,
        changed ? '✅ 디자인 변경됨' : '⬜ 동일',
        `| old(${oldEl?.fontSize}px, x:${oldEl?.x}, y:${oldEl?.y})`,
        `→ new(${newEl?.fontSize}px, x:${newEl?.x}, y:${newEl?.y})`,
      );
    }

    return {
      ...section,
      elements: newElements,
    };
  });

  return {
    ...item,
    sections: updatedSections,
    promptLayout: item.promptLayout ?? design.promptLayout,
    ...(design.subtitleStyle ? { style: { ...item.style, ...design.subtitleStyle } } : {}),
  };
}

/**
 * 프로그램을 UnoLive 셋리스트에 업로드.
 * worshipId 가 같은 셋리스트가 있으면 그곳에 추가, 없으면 새로 생성.
 */
export function uploadToUnoLive(
  worshipId: string,
  worshipName: string,
  dateISO: string,
  item: SetlistItem
): { setlistId: string; itemId: string } {
  const state = useStore.getState();
  const existing = state.setlists.find((sl) => sl.id === worshipId);

  if (existing) {
    // 기존 셋리스트에 같은 item.id 가 있으면 교체, 없으면 추가
    const hasItem = existing.items.some((i) => i.id === item.id);
    if (hasItem) {
      // 교체: 기존 아이템 제거 후 새로 추가
      state.removeItem(worshipId, item.id);
    }
    state.addItem(worshipId, item);
    return { setlistId: worshipId, itemId: item.id };
  }

  // 새 셋리스트 생성
  const newSetlist: Setlist = {
    id: worshipId,
    name: worshipName,
    date: dateISO,
    items: [item],
    createdAt: Date.now(),
  };
  state.addSetlist(newSetlist);
  return { setlistId: worshipId, itemId: item.id };
}

/**
 * 서버에 저장된 프로그램들을 UnoLive 스토어에 로드
 * 앱 시작 시 한번 호출하여, 서버에 저장된 모든 프로그램을 셋리스트로 복원.
 * 이미 같은 ID 의 셋리스트/아이템이 있으면 스킵.
 *
 * 중요: 저장된 프로그램의 elements 는 생성 당시의 디자인이 베이킹되어 있으므로,
 *       최신 디자인을 다시 적용(reapplyDesignToItem)하여 등록.
 */
export async function loadProgramsFromServer(): Promise<number> {
  try {
    const res = await fetch('/api/programs');
    if (!res.ok) return 0;

    const { programs }: { programs: SavedProgram[] } = await res.json();
    if (!programs || programs.length === 0) return 0;

    const state = useStore.getState();
    let loaded = 0;

    // 프로그램 타입별 최신 디자인 캐시
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

    // worshipId 기준으로 그룹핑
    const byWorship = new Map<string, SavedProgram[]>();
    for (const p of programs) {
      const list = byWorship.get(p.worshipId) || [];
      list.push(p);
      byWorship.set(p.worshipId, list);
    }

    for (const [worshipId, progs] of byWorship) {
      const existing = state.setlists.find((sl) => sl.id === worshipId);

      // 각 프로그램에 최신 디자인 적용
      const updatedItems: SetlistItem[] = [];
      for (const p of progs) {
        const design = shouldPreserveProgramElements(p) ? null : await getDesign(p.type);
        const item = design ? reapplyDesignToItem(p.item, design) : p.item;
        updatedItems.push(item);
      }

      if (existing) {
        // 기존 셋리스트: 없으면 추가, 있으면 디자인만 교체
        for (const item of updatedItems) {
          const found = existing.items.some((i) => i.id === item.id);
          if (found) {
            // 이미 존재 → 최신 디자인으로 sections 교체
            state.updateItem(worshipId, item.id, {
              sections: item.sections,
              promptLayout: item.promptLayout,
              style: item.style,
            });
          } else {
            state.addItem(worshipId, item);
          }
          loaded++;
        }
      } else {
        // 새 셋리스트 생성
        const first = progs[0];
        const newSetlist: Setlist = {
          id: worshipId,
          name: first.worshipName,
          date: formatDateISO(worshipId.split('-')[0] ?? ''),
          items: updatedItems,
          createdAt: first.createdAt,
        };
        state.addSetlist(newSetlist);
        loaded += progs.length;
      }
    }

    if (loaded > 0) {
      console.log(`[worshipUploader] ${loaded}개 프로그램 로드 + 최신 디자인 적용 완료`);
    }
    return loaded;
  } catch (err) {
    console.warn('[worshipUploader] 서버 프로그램 로드 실패:', err);
    return 0;
  }
}
