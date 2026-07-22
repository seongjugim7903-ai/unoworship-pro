// 섹션 카드 클릭 판정 — 한번클릭=선택(번호칸 커서), 두번클릭=즉시 송출, 세번+클릭=무시.
//   브라우저 네이티브 dblclick 은 리렌더(DOM 교체) 시 유실될 수 있어
//   pointerdown 타임스탬프로 자체 감지하여 100% 안정적으로 동작한다.
import { useRef, useCallback } from 'react';

const DOUBLE_CLICK_MS = 400;

export interface SectionClickHandlers {
  /** 한번 클릭 — 섹션 선택 (송출 번호칸에 커서) */
  onSingle: () => void;
  /** 두번 클릭 — 즉시 송출 */
  onDouble: () => void;
}

/**
 * 섹션 카드용 클릭 판정 훅.
 * @returns pointerdown 시 호출할 핸들러.
 *   - 1클릭        → onSingle
 *   - 2클릭(400ms 내) → onDouble
 *   - 3클릭 이상    → 무시 (트리플 이상은 오작동 방지로 제거)
 */
export function useSectionClick({ onSingle, onDouble }: SectionClickHandlers) {
  const lastDownRef = useRef(0);
  // 더블클릭 송출 직후 이 시각까지의 연속 클릭은 무시(트리플 제거)
  const suppressUntilRef = useRef(0);

  return useCallback(() => {
    const now = Date.now();

    if (now < suppressUntilRef.current) {
      lastDownRef.current = now;
      return; // 트리플 이상 — 무시
    }

    if (now - lastDownRef.current < DOUBLE_CLICK_MS) {
      lastDownRef.current = now;
      suppressUntilRef.current = now + DOUBLE_CLICK_MS;
      onDouble();
    } else {
      lastDownRef.current = now;
      onSingle();
    }
  }, [onSingle, onDouble]);
}
