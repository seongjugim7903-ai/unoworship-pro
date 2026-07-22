'use client';

/**
 * components/composer/setlist/SectionScroller.tsx
 * [기능2] 프로그램 선택 시 해당 첫 번째 섹션 카드로 자동 스크롤
 *
 * 사용법:
 *   const { sectionCardRef } = useSectionScroller(activeItemId);
 *
 *   // 섹션 카드 렌더링 시:
 *   <button ref={sectionCardRef(s.itemId, s.section.id)} ...>
 *
 * 동작:
 *   - activeItemId 가 변경되면 해당 아이템의 첫 번째 섹션 카드로 smooth scroll
 *   - 같은 아이템 내 섹션 전환 시에는 스크롤하지 않음 (카드가 이미 보일 확률 높음)
 *   - 최초 마운트 시에도 활성 섹션이 보이도록 스크롤
 */

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';

// SSR 경고 없이 paint 직전에 스크롤 위치를 잡기 위한 isomorphic layout effect.
// (layout effect 는 DOM 커밋 후·paint 전에 실행 → 리스트가 잘못된 스크롤로 한번 그려졌다 튀는 깜빡임이 없다.)
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function useSectionScroller(
  activeItemId: string | null,
  broadcastSection: { itemId: string; sectionId: string } | null,
) {
  // Map: "itemId" → 해당 아이템의 첫 번째 섹션 카드 DOM element
  const firstCardRefs = useRef<Map<string, HTMLElement>>(new Map());
  // [FIX] Map: "itemId:sectionId" → 모든 섹션 카드 (송출 섹션이 리스트를 벗어나지 않게 추적)
  const allCardRefs = useRef<Map<string, HTMLElement>>(new Map());
  // [FIX 버그B] 더블클릭 송출 시 다음 1회 중앙정렬 스크롤 억제(이미 보이는 카드라 튀면 오작동 유발)
  const suppressBroadcastScrollRef = useRef(false);
  // 이전 activeItemId 추적 (같은 아이템 내 섹션 전환 감지용)
  const prevItemId = useRef<string | null>(null);
  // 섹션 카드 직접 클릭 시 자동 스크롤 억제 플래그
  const suppressScrollRef = useRef(false);

  /**
   * ref 콜백 팩토리: 각 섹션 카드에 부착
   * 같은 itemId 의 첫 번째 섹션만 Map 에 등록
   */
  const sectionCardRef = useCallback(
    (itemId: string, sectionId: string, isFirstOfItem: boolean) => {
      return (el: HTMLElement | null) => {
        const key = `${itemId}:${sectionId}`;
        if (el) {
          allCardRefs.current.set(key, el);
          if (isFirstOfItem) firstCardRefs.current.set(itemId, el);
        } else {
          allCardRefs.current.delete(key);
        }
      };
    },
    []
  );

  /**
   * 섹션 카드 직접 클릭 시 호출 — 다음 한 번의 자동 스크롤을 억제
   * (사용자가 이미 눈으로 보고 클릭한 카드이므로 스크롤할 필요 없음)
   */
  const suppressNextScroll = useCallback(() => {
    suppressScrollRef.current = true;
  }, []);

  // [FIX 버그B] 더블클릭 송출 직전 호출 → 다음 1회 중앙정렬 스크롤을 건너뛴다.
  const suppressNextBroadcastScroll = useCallback(() => {
    suppressBroadcastScrollRef.current = true;
  }, []);

  // activeItemId 변경 시 스크롤 — paint 직전(layout effect)에 위치를 잡아
  // 리스트가 잘못된 스크롤로 한번 그려졌다 튀는 깜빡임 없이 매끄럽게 배치한다.
  useIsomorphicLayoutEffect(() => {
    if (!activeItemId) return;

    // 같은 아이템 내 섹션 전환이면 스크롤 스킵
    if (prevItemId.current === activeItemId) return;
    prevItemId.current = activeItemId;

    // 섹션 카드 직접 클릭으로 인한 변경이면 스크롤 스킵
    if (suppressScrollRef.current) {
      suppressScrollRef.current = false;
      return;
    }

    // [FIX] 송출이 이 프로그램으로 넘어와서 활성화된 경우(송출 주도 이동)에는
    //   첫 섹션을 맨 위로 당기지 않는다. 아래 송출-추적 effect 가 자연스럽게 이어붙인다.
    if (broadcastSection?.itemId === activeItemId) return;

    const el = firstCardRefs.current.get(activeItemId);
    if (!el) return;

    const container = el.closest('[class*="overflow-y"]') as HTMLElement | null;
    if (!container) {
      el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
      return;
    }

    // getBoundingClientRect 로 컨테이너 대비 '정확한' 델타를 구한다(offsetParent 가정 X → 오배치 없음).
    // 첫 섹션 카드가 sticky 인포바 바로 아래(최상단)에 오도록 즉시 스크롤(무애니메이션 = 페이지 넘김).
    const stickyBar = container.querySelector('[class*="sticky"]') as HTMLElement | null;
    const stickyH = stickyBar ? stickyBar.offsetHeight : 0;
    const delta = el.getBoundingClientRect().top - (container.getBoundingClientRect().top + stickyH + 8);
    if (Math.abs(delta) > 1) {
      container.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior });
    }
    // broadcastSection 은 '송출 주도 이동' 판별에만 쓰인다.
  }, [activeItemId, broadcastSection]);

  // [FIX] 송출 섹션을 리스트 가시영역 '중앙'에 위치시켜 위/아래 다음 섹션이 함께 보이게 한다.
  const bItem = broadcastSection?.itemId ?? null;
  const bSection = broadcastSection?.sectionId ?? null;
  useEffect(() => {
    if (!bItem || !bSection) return;
    // [FIX 버그B] 더블클릭 등 직접 클릭 송출이면 스크롤 억제(카드가 튀지 않게)
    if (suppressBroadcastScrollRef.current) {
      suppressBroadcastScrollRef.current = false;
      return;
    }
    const key = `${bItem}:${bSection}`;
    const timer = setTimeout(() => {
      const el = allCardRefs.current.get(key);
      if (!el) return;
      const container = el.closest('[class*="overflow-y"]') as HTMLElement | null;
      if (!container) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const stickyBar = container.querySelector('[class*="sticky"]') as HTMLElement | null;
      const stickyH = stickyBar ? stickyBar.offsetHeight : 0;

      // sticky 바를 제외한 가시영역의 중앙에 카드 중앙을 맞춘다
      const visibleTop = cRect.top + stickyH;
      const targetCenter = visibleTop + (cRect.bottom - visibleTop) / 2;
      const elCenter = eRect.top + eRect.height / 2;
      const delta = elCenter - targetCenter;
      if (Math.abs(delta) > 2) {
        container.scrollBy({ top: delta, behavior: 'smooth' });
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [bItem, bSection]);

  return { sectionCardRef, suppressNextScroll, suppressNextBroadcastScroll };
}
