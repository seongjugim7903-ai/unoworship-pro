// 송출그리드 우측 레일의 프로그램 목록 — 섹션 목록을 프로그램 단위로 묶는다
import type { BroadcastGridEntry } from './BroadcastGridOverlay';

export interface BroadcastGridProgram {
  itemId: string;
  title: string;
  /** 이 프로그램 첫 섹션의 전역 인덱스 — 선택 점프 대상 */
  firstIndex: number;
  sectionCount: number;
  sectionIds: string[];
}

/**
 * itemId 가 바뀌는 지점을 프로그램 경계로 삼는다.
 * Tab 점프(resolveBroadcastGridProgramJump)와 같은 기준이라 목록과 점프가 어긋나지 않는다.
 * 같은 itemId 가 떨어져서 두 번 나오면 각각 별개 프로그램으로 잡힌다.
 */
export function buildBroadcastGridPrograms(
  entries: ReadonlyArray<Pick<BroadcastGridEntry, 'itemId' | 'itemTitle' | 'index' | 'section'>>,
): BroadcastGridProgram[] {
  const programs: BroadcastGridProgram[] = [];

  for (const entry of entries) {
    const last = programs[programs.length - 1];
    if (last && last.itemId === entry.itemId) {
      last.sectionCount += 1;
      last.sectionIds.push(entry.section.id);
      continue;
    }
    programs.push({
      itemId: entry.itemId,
      title: entry.itemTitle,
      firstIndex: entry.index,
      sectionCount: 1,
      sectionIds: [entry.section.id],
    });
  }

  return programs;
}

/** 주어진 섹션이 속한 프로그램의 배열 위치 — 목록에서 현재 위치를 강조할 때 쓴다. */
export function findProgramIndexBySectionId(
  programs: ReadonlyArray<BroadcastGridProgram>,
  sectionId: string | null,
): number {
  if (!sectionId) return -1;
  return programs.findIndex((program) => program.sectionIds.includes(sectionId));
}

/**
 * itemId 프로그램을 targetItemId 자리로 옮긴 새 배열을 돌려준다. 옮길 수 없으면 null.
 *
 * 컴포즈의 드래그 순서변경(arrayMove)과 같은 계산이다 — 빼내서 대상 자리에 끼워 넣는다.
 * 그리드 목록은 세트리스트 items 에서 워크스페이스 항목을 걸러낸 결과라,
 * 목록에서 이웃한 두 프로그램이 items 배열에서는 떨어져 있을 수 있다.
 * 그래서 인덱스를 ±1 하지 않고, 항상 "대상 프로그램의 자리"를 기준으로 옮긴다.
 */
export function moveItemToId<T extends { id: string }>(
  items: readonly T[],
  itemId: string,
  targetItemId: string,
): T[] | null {
  if (itemId === targetItemId) return null;
  const from = items.findIndex((item) => item.id === itemId);
  const to = items.findIndex((item) => item.id === targetItemId);
  if (from === -1 || to === -1) return null;

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
