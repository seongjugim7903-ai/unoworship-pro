/**
 * layerActions.ts
 * 레이어 순서 조작 순수 함수 모음
 *
 * [FEATURE: LAYER_ACTIONS]
 * - EditorCanvas.tsx 의 인라인 bringToFront/bringForward/sendBackward/sendToBack 를 대체
 * - LayerPanel.tsx 에서 동일 로직 재사용
 * - 부수효과 없음: 입력된 elements 배열을 분석해 {id, zIndex} 업데이트 목록만 반환
 * - zIndex 항상 0-based 연속 정수로 정규화하여 중복/충돌 방지
 *
 * 사용법:
 *   const updates = reorderLayer(elements, targetId, 'bringForward');
 *   updates.forEach(({ id, zIndex }) =>
 *     updateElement(setlistId, itemId, sectionId, id, { zIndex })
 *   );
 */

import { CanvasElement } from '@/lib/canvasTypes';

export type LayerAction =
  | 'bringToFront'
  | 'bringForward'
  | 'sendBackward'
  | 'sendToBack';

/**
 * 레이어 순서를 변경한 뒤 새 zIndex 목록을 반환한다.
 * zIndex 는 항상 0-based 연속 정수로 재할당된다.
 *
 * @returns 변경이 필요한 요소들의 { id, zIndex } 배열.
 *          변경 없으면 빈 배열 반환.
 */
export function reorderLayer(
  elements: CanvasElement[],
  targetId: string,
  action: LayerAction,
): Array<{ id: string; zIndex: number }> {
  if (elements.length === 0) return [];

  // 현재 zIndex 기준으로 정렬 (index 0 = 맨 뒤)
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  const idx = sorted.findIndex((el) => el.id === targetId);
  if (idx < 0) return [];

  // 이미 최상위/최하위인 경우 조기 반환
  if (action === 'bringToFront' && idx === sorted.length - 1) return [];
  if (action === 'sendToBack'   && idx === 0)                  return [];
  if (action === 'bringForward' && idx === sorted.length - 1) return [];
  if (action === 'sendBackward' && idx === 0)                  return [];

  const newSorted = [...sorted];
  const [removed] = newSorted.splice(idx, 1);

  switch (action) {
    case 'bringToFront':
      newSorted.push(removed);
      break;
    case 'bringForward':
      newSorted.splice(idx + 1, 0, removed);
      break;
    case 'sendBackward':
      newSorted.splice(idx - 1, 0, removed);
      break;
    case 'sendToBack':
      newSorted.unshift(removed);
      break;
  }

  // 0-based 연속 zIndex 재할당 → 변경된 것만 반환
  return newSorted
    .map((el, i) => ({ id: el.id, zIndex: i }))
    .filter(({ id, zIndex }) => {
      const original = elements.find((e) => e.id === id);
      return original && original.zIndex !== zIndex;
    });
}

/**
 * 요소 배열을 zIndex 오름차순(맨뒤 → 맨앞)으로 정렬한 사본 반환.
 * LayerPanel 에서 목록 표시용.
 */
export function getSortedByZIndex(elements: CanvasElement[]): CanvasElement[] {
  return [...elements].sort((a, b) => a.zIndex - b.zIndex);
}

/**
 * 현재 선택된 요소의 레이어 위치에 따라 각 액션 가능 여부를 반환.
 */
export function getLayerActionAvailability(
  elements: CanvasElement[],
  targetId: string | null,
): Record<LayerAction, boolean> {
  const disabled: Record<LayerAction, boolean> = {
    bringToFront: false,
    bringForward: false,
    sendBackward: false,
    sendToBack: false,
  };
  if (!targetId || elements.length <= 1) return disabled;

  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  const idx = sorted.findIndex((el) => el.id === targetId);
  if (idx < 0) return disabled;

  return {
    bringToFront: idx < sorted.length - 1,
    bringForward: idx < sorted.length - 1,
    sendBackward: idx > 0,
    sendToBack:   idx > 0,
  };
}
