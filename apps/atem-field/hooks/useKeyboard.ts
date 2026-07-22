'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';

export interface KeyboardHandlers {
  // 섹션 선택만 (에디터에 표시, 아웃풋 송출 없음)
  selectNext: () => void;
  selectPrev: () => void;
  // 프로그램(item) 이동 — ↑/↓
  selectNextProgram: () => void;
  selectPrevProgram: () => void;
  // 이동 + 아웃풋 송출
  goNext: () => void;
  goPrev: () => void;
  toggleBlackout: () => void;
  clearText: () => void;
  openOutput: () => void;
  sendToOutput: () => void;
}

/**
 * Composer 키보드 단축키 전담 훅
 *
 * 단축키 목록:
 *   →           : 다음 섹션 선택 (에디터만, 송출 없음)
 *   ←           : 이전 섹션 선택 (에디터만, 송출 없음)
 *   ↓           : 다음 프로그램(item)으로 이동 (첫 섹션 선택)
 *   ↑           : 이전 프로그램(item)으로 이동 (첫 섹션 선택)
 *   PageDown    : 다음 섹션으로 이동 + 아웃풋 송출
 *   PageUp      : 이전 섹션으로 이동 + 아웃풋 송출
 *   Enter       : 현재 선택 섹션 아웃풋 송출
 *   Space       : 현재 선택 섹션 아웃풋 송출 (Enter와 동일)
 *   B           : 블랙아웃 토글
 *   Esc         : 텍스트 지우기
 *   O           : Output 창 열기
 *
 * INPUT / TEXTAREA / SELECT 포커스 중에는 동작하지 않음
 */
export function useKeyboard({
  selectNext,
  selectPrev,
  selectNextProgram,
  selectPrevProgram,
  goNext,
  goPrev,
  toggleBlackout,
  clearText,
  openOutput,
  sendToOutput,
}: KeyboardHandlers): void {
  // 캔버스 요소가 선택되어 있으면 화살표 키를 섹션 이동에서 제외
  const selectedElementIds = useStore((s) => s.selectedElementIds);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const isFormField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      // [FIX 버그A] 한번클릭 시 송출 번호칸에 포커스가 들어가는데,
      //   그 상태에서도 PageDown/PageUp 은 섹션 송출 이동으로 동작해야 한다.
      //   (그 외 키는 입력 중 방해 방지를 위해 기존대로 무시)
      if (isFormField && e.key !== 'PageDown' && e.key !== 'PageUp') return;

      switch (e.key) {
        // 화살표: ←/→ = 섹션 선택, ↑/↓ = 프로그램(item) 이동 (송출 없음)
        // — 캔버스 요소가 선택되어 있으면 넛지가 우선이므로 여기서 무시
        case 'ArrowRight':
          if (selectedElementIds.length > 0) return;
          e.preventDefault();
          selectNext();
          break;
        case 'ArrowLeft':
          if (selectedElementIds.length > 0) return;
          e.preventDefault();
          selectPrev();
          break;
        case 'ArrowDown':
          if (selectedElementIds.length > 0) return;
          e.preventDefault();
          selectNextProgram();
          break;
        case 'ArrowUp':
          if (selectedElementIds.length > 0) return;
          e.preventDefault();
          selectPrevProgram();
          break;

        // PageDown / PageUp: 이동 + 아웃풋 송출
        case 'PageDown':
          e.preventDefault();
          goNext();
          break;
        case 'PageUp':
          e.preventDefault();
          goPrev();
          break;

        // Enter / Space: 현재 섹션 아웃풋 송출
        case 'Enter':
        case ' ':
          e.preventDefault();
          sendToOutput();
          break;

        case 'b':
        case 'B':
          e.preventDefault();
          toggleBlackout();
          break;
        case 'Escape':
          e.preventDefault();
          clearText();
          break;
        case 'o':
        case 'O':
          e.preventDefault();
          openOutput();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectNext, selectPrev, selectNextProgram, selectPrevProgram, goNext, goPrev, toggleBlackout, clearText, openOutput, sendToOutput, selectedElementIds]);
}
