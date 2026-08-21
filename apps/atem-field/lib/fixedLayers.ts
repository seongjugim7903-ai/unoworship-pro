import type { CanvasElement } from './canvasTypes';
import type { Section, Setlist, SetlistItem } from './types';
import { getProgramBackgroundElements, isProgramBackgroundSection } from './programBackground';

const PROGRAM_BACKGROUND_Z_BASE = -10_000;

export function isFixedLayerElement(el: CanvasElement): boolean {
  return el.fixedLayer === true || el.layerRole === 'mask';
}

export function getSectionOwnElements(section: Section): CanvasElement[] {
  return (section.elements ?? []).filter((el) => !isFixedLayerElement(el));
}

/**
 * 이 **프로그램(item) 안의** 고정 레이어 요소.
 *
 * [FIX: FIXED_LAYER_PROGRAM_SCOPE] 예전에는 세트리스트 전체를 훑어서, A 프로그램에
 * 걸어둔 고정 레이어(예: 배경 유튜브 영상)가 B·C 프로그램에까지 따라붙었다.
 * 고정 레이어는 "그 프로그램 안에서 섹션이 바뀌어도 유지" 라는 의미이므로
 * 프로그램 경계를 넘지 않는다.
 */
export function getFixedLayerElementsForItem(
  item: SetlistItem | null | undefined,
): CanvasElement[] {
  if (!item) return [];

  const fixedElements = new Map<string, CanvasElement>();
  for (const section of item.sections) {
    for (const el of section.elements ?? []) {
      if (isFixedLayerElement(el)) {
        fixedElements.set(el.id, el);
      }
    }
  }

  return [...fixedElements.values()];
}

function lowerProgramBackgroundElements(elements: CanvasElement[]): CanvasElement[] {
  return elements
    .map((el, originalIndex) => ({ el, originalIndex }))
    .sort((a, b) => a.el.zIndex - b.el.zIndex || a.originalIndex - b.originalIndex)
    .map(({ el }, rank) => ({
      ...el,
      zIndex: PROGRAM_BACKGROUND_Z_BASE + rank,
    }));
}

export function getSectionOutputElements(
  setlist: Setlist | null | undefined,
  section: Section,
): CanvasElement[] {
  // 배경 섹션 자체를 합성 대상으로 부르면 자기 요소만 반환(무한 중첩 방지).
  if (isProgramBackgroundSection(section)) return section.elements ?? [];

  // 이 섹션을 소유한 프로그램 — 고정 레이어·배경 모두 이 프로그램 안에서만 모은다.
  const owningItem = setlist?.items.find((it) =>
    it.sections.some((s) => s.id === section.id),
  );
  const fixedElements = getFixedLayerElementsForItem(owningItem);
  const backgroundElements = lowerProgramBackgroundElements(
    getProgramBackgroundElements(owningItem),
  );

  if (fixedElements.length === 0 && backgroundElements.length === 0) {
    return section.elements ?? [];
  }

  return [
    ...backgroundElements,
    ...fixedElements,
    ...getSectionOwnElements(section),
  ];
}
