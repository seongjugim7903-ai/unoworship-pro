// 프로그램(item)별 배경 레이어 — 프로그램마다 숨은 "배경 섹션"을 메인 에디터로 편집하고,
// 그 요소를 그 프로그램의 모든 콘텐츠 섹션 뒤에 합성한다. 배경 섹션이 없으면 전부 no-op.

import type { CanvasElement } from './canvasTypes';
import type { Section, SetlistItem } from './types';

export const PROGRAM_BACKGROUND_ROLE = 'program-background' as const;
export const PROGRAM_BACKGROUND_SECTION_PREFIX = '__unolive_bg__';

export function programBackgroundSectionId(itemId: string): string {
  return `${PROGRAM_BACKGROUND_SECTION_PREFIX}${itemId}`;
}

export function isProgramBackgroundSection(
  section: Pick<Section, 'workspaceRole' | 'id'>,
): boolean {
  return (
    section.workspaceRole === PROGRAM_BACKGROUND_ROLE ||
    section.id.startsWith(PROGRAM_BACKGROUND_SECTION_PREFIX)
  );
}

export function createProgramBackgroundSection(itemId: string): Section {
  return {
    id: programBackgroundSectionId(itemId),
    label: '프로그램 배경',
    text: '',
    colorMark: '#38bdf8',
    elements: [],
    workspaceRole: PROGRAM_BACKGROUND_ROLE,
  };
}

/** 프로그램의 배경 섹션 요소(없으면 빈 배열) */
export function getProgramBackgroundElements(
  item: SetlistItem | null | undefined,
): CanvasElement[] {
  if (!item) return [];
  const bg = item.sections.find(isProgramBackgroundSection);
  return bg?.elements ?? [];
}

/** 콘텐츠 섹션만 — 배경 섹션 제외 (목록·번호·네비게이션·송출에서 사용) */
export function getContentSections(item: SetlistItem): Section[] {
  return item.sections.filter((s) => !isProgramBackgroundSection(s));
}

/**
 * backgroundMotionOnce 가 켜진 프로그램에서, 송출 섹션이 '첫 콘텐츠 섹션'이 아니면
 * 합성 elements 중 배경 요소의 motion 을 제거한 사본을 반환한다.
 *   → 배경 인트로 모션이 매 섹션마다 재생되지 않고, 첫 섹션에서만 1회 재생된다.
 * (플래그 off · 첫 섹션 · 배경 없음이면 원본 그대로 반환)
 */
export function applyBackgroundMotionOnce(
  elements: CanvasElement[],
  item: SetlistItem | null | undefined,
  currentSectionId: string,
): CanvasElement[] {
  if (!item?.backgroundMotionOnce) return elements;
  const first = getContentSections(item)[0];
  if (first && first.id === currentSectionId) return elements; // 첫 섹션 → 모션 유지
  const bgIds = new Set(getProgramBackgroundElements(item).map((e) => e.id));
  if (bgIds.size === 0) return elements;
  return elements.map((el) =>
    bgIds.has(el.id) && el.motion ? { ...el, motion: undefined } : el,
  );
}
