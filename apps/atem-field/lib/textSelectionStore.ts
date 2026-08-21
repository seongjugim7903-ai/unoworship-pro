// [FEATURE: TEXT_RUNS] 인라인 편집기에서 선택한 문자 범위를 속성창에 전달하는 모듈 스토어

/**
 * 왜 Context 가 아니라 모듈 스토어인가:
 *   `TextEditProvider` 는 EditorCanvas 만 감싸고 있고, 스타일 패널(BottomPanels →
 *   ElementInspector)은 그 바깥에 있다. Provider 를 위로 올리면 컴포넌트 트리를
 *   건드리게 되므로, 트리에 손대지 않는 모듈 스토어로 공유한다.
 *
 * 편집기가 blur 로 닫혀도 마지막 선택을 유지한다 — 스타일 버튼을 누르는 순간
 * textarea 가 blur 되기 때문에, 그때 범위가 사라지면 적용할 대상이 없어진다.
 */

export interface TextSelectionRange {
  elementId: string;
  start: number;
  end: number;
}

let current: TextSelectionRange | null = null;
const listeners = new Set<() => void>();

export function setTextSelection(next: TextSelectionRange | null): void {
  // 빈 범위(커서만 있는 상태)는 선택으로 치지 않는다.
  const normalized = next && next.end > next.start ? next : null;
  const changed =
    (current === null) !== (normalized === null) ||
    (current &&
      normalized &&
      (current.elementId !== normalized.elementId ||
        current.start !== normalized.start ||
        current.end !== normalized.end));
  if (!changed) return;
  current = normalized;
  for (const fn of listeners) fn();
}

export function getTextSelection(): TextSelectionRange | null {
  return current;
}

/** 해당 요소에 대한 선택만 반환 (다른 요소를 고르면 무효) */
export function getTextSelectionFor(elementId: string): TextSelectionRange | null {
  return current && current.elementId === elementId ? current : null;
}

export function subscribeTextSelection(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
