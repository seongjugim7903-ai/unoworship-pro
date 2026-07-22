import type { CanvasElement } from './canvasTypes';
import type { Section, Setlist } from './types';
import { getProgramBackgroundElements, isProgramBackgroundSection } from './programBackground';

const PROGRAM_BACKGROUND_Z_BASE = -10_000;

export function isFixedLayerElement(el: CanvasElement): boolean {
  return el.fixedLayer === true || el.layerRole === 'mask';
}

export function getSectionOwnElements(section: Section): CanvasElement[] {
  return (section.elements ?? []).filter((el) => !isFixedLayerElement(el));
}

export function getFixedLayerElements(setlist: Setlist | null | undefined): CanvasElement[] {
  if (!setlist) return [];

  const fixedElements = new Map<string, CanvasElement>();
  for (const item of setlist.items) {
    for (const section of item.sections) {
      for (const el of section.elements ?? []) {
        if (isFixedLayerElement(el)) {
          fixedElements.set(el.id, el);
        }
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

  const fixedElements = getFixedLayerElements(setlist);

  // 이 섹션을 소유한 프로그램의 배경 요소(맨 뒤 = 가장 아래층).
  const owningItem = setlist?.items.find((it) =>
    it.sections.some((s) => s.id === section.id),
  );
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
