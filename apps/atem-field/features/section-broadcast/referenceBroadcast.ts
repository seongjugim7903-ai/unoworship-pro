// 송출번호 참조 패널의 송출 기능 — 클릭 송출·활성 표시·PageUp/Down 이동 송출을 담당하는 전용 모듈.
//   실제 송출은 SetlistPanel 의 sendToOutput(단일 구현)을 CustomEvent 브리지로 호출한다
//   (MiddleTopMenu 'open-ppt-loader' 와 같은 in-repo 패턴 — 송출 로직 이중 구현 방지).

import { useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store';

/** 참조 패널 → SetlistPanel 송출 요청 이벤트 (detail: { num: 전역 송출순번(1-based) }) */
export const REFERENCE_BROADCAST_EVENT = 'unolive:reference-broadcast';

interface ReferenceBroadcastDetail {
  num: number;
}

/** 참조 패널에서 전역 순번으로 송출 요청 (forceCommit 경로 — 유튜브 섹션도 즉시 재생) */
export function requestReferenceBroadcast(num: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ReferenceBroadcastDetail>(REFERENCE_BROADCAST_EVENT, { detail: { num } }),
  );
}

/**
 * SetlistPanel 쪽 브리지 — 참조 패널의 송출 요청을 받아 기존 sendToOutput 으로 실행.
 * sendToOutput(index(0-based), forceCommit) 시그니처 그대로 사용.
 */
export function useReferenceBroadcastBridge(
  sendToOutput: (index?: number, forceCommit?: boolean) => void,
): void {
  useEffect(() => {
    const handler = (e: Event) => {
      const num = (e as CustomEvent<ReferenceBroadcastDetail>).detail?.num;
      if (typeof num !== 'number' || num < 1) return;
      sendToOutput(num - 1, true); // 번호 입력 Enter 와 동일한 명시 송출 경로
    };
    window.addEventListener(REFERENCE_BROADCAST_EVENT, handler);
    return () => window.removeEventListener(REFERENCE_BROADCAST_EVENT, handler);
  }, [sendToOutput]);
}

export interface ReferenceRow {
  num: number;
  label: string;
  sectionId: string;
}

/**
 * 참조 패널용 송출 컨트롤 —
 *   activeSectionId : 현재 송출 중인 섹션(스토어 broadcastSection 기준 — 어느 경로로 보냈든 반영)
 *   sendRow(num)    : 행 클릭 한 번 송출
 *   키보드          : 활성 행이 이 패널 목록 안에 있으면 PageDown/PageUp 으로 다음/이전 행 송출.
 *                     capture 단계에서 가로채 OperatorPanel 전역 단축키와의 이중 송출을 막고,
 *                     목록 경계(처음/끝)에서는 가로채지 않아 전역 이동으로 자연스럽게 이어진다.
 */
export function useReferencePanelBroadcast(rows: ReferenceRow[]): {
  activeSectionId: string | null;
  sendRow: (num: number) => void;
} {
  const broadcastSection = useStore((s) => s.broadcastSection);
  const activeSectionId =
    broadcastSection && rows.some((r) => r.sectionId === broadcastSection.sectionId)
      ? broadcastSection.sectionId
      : null;

  const sendRow = useCallback((num: number) => {
    requestReferenceBroadcast(num);
  }, []);

  useEffect(() => {
    if (!activeSectionId) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'PageDown' && e.key !== 'PageUp') return;
      const activeIndex = rows.findIndex((r) => r.sectionId === activeSectionId);
      if (activeIndex < 0) return;
      const nextIndex = e.key === 'PageDown' ? activeIndex + 1 : activeIndex - 1;
      const next = rows[nextIndex];
      if (!next) return; // 목록 경계 — 전역(OperatorPanel) 이동에 맡긴다
      e.preventDefault();
      e.stopPropagation(); // capture 단계 → OperatorPanel window 리스너(버블) 차단
      requestReferenceBroadcast(next.num);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [rows, activeSectionId]);

  return { activeSectionId, sendRow };
}
