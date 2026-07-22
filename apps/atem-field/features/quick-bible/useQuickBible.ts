'use client';

// 긴급 말씀찾기 훅 — 송출그리드가 열려 있을 때 B(ㅂ) 키로 QuickBibleModal 을 띄우고,
//   조회된 본문을 현재 세트리스트의 "말씀찾기(인용)" 프로그램 마지막에 삽입한 뒤,
//   상태 반영이 끝나면(pending 방식) 첫 섹션을 자동 송출한다.
//   SetlistPanel 접점은 훅 호출 + {quickBibleModal} 렌더 두 줄뿐 — 유지보수는 이 폴더에서 완결.

import { createElement, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '@/lib/store';
import type { SavedProgram } from '@/lib/generators/programTypes';
import type { Section, SetlistItem } from '@/lib/types';
import QuickBibleModal from './QuickBibleModal';
import { saveQuickBibleProgram } from './saveQuickBibleProgram';
import { placePptProgramBelowQuickBibleQuote } from './quickBiblePptPlacement';

/** SetlistPanel 의 allSections 항목(필요 최소 필드) */
interface SourceSection {
  itemId: string;
  section: Section;
}

export function useQuickBible(
  allSections: SourceSection[],
  sendToOutput: (index: number, forceCommit?: boolean) => void,
): { quickBibleModal: ReactNode; openQuickBible: () => void } {
  const [open, setOpen] = useState(false);
  // 프로그램 중간 삽입으로 전역 번호가 달라질 수 있어, 새 섹션 ID로 반영 뒤 위치를 다시 찾는다.
  const [pendingSectionId, setPendingSectionId] = useState<string | null>(null);

  const gridOpen = useStore((s) => s.broadcastGridOpen);
  const currentSetlistId = useStore((s) => s.currentSetlistId);
  const addItem = useStore((s) => s.addItem);
  const addSection = useStore((s) => s.addSection);
  const updateSetlist = useStore((s) => s.updateSetlist);
  const setActiveItem = useStore((s) => s.setActiveItem);
  const setActiveSection = useStore((s) => s.setActiveSection);

  // B 단축키 판정은 실제 키 입력을 가장 먼저 받는 BroadcastGridOverlay 가 담당한다.
  // store 동기화 타이밍에 의존하지 않고 그리드가 화면에 떠 있으면 즉시 열리게 한다.
  const openQuickBible = useCallback(() => setOpen(true), []);

  // 그리드가 닫히면 모달도 정리
  useEffect(() => {
    // 외부 그리드 열림 상태와 모달 생명주기를 맞추는 의도적인 동기화다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!gridOpen) setOpen(false);
  }, [gridOpen]);

  // 삽입: 말씀찾기(인용) 프로그램의 마지막에 추가. 필요할 때만 첫 신규 섹션 송출을 예약한다.
  // 기존 워십에 해당 프로그램이 없으면 같은 이름의 인용 프로그램을 만든다.
  const insertQuickBibleSections = (sections: Section[], shouldBroadcast: boolean) => {
    if (!currentSetlistId || sections.length === 0) return;

    const currentSetlist = useStore.getState().setlists.find((setlist) => setlist.id === currentSetlistId);
    if (!currentSetlist) return;
    const quoteItem = currentSetlist.items.find((item) => item.title.includes('말씀찾기(인용)'));

    let targetItemId: string;
    let nextQuoteItem: SetlistItem;
    if (quoteItem) {
      targetItemId = quoteItem.id;
      for (const section of sections) addSection(currentSetlistId, targetItemId, section);
      nextQuoteItem = {
        ...quoteItem,
        sections: [...quoteItem.sections, ...sections],
      };
    } else {
      targetItemId = `item-quick-quote-${sections[0].id}`;
      const datePrefix = currentSetlist.date.replace(/\D/g, '').slice(0, 8);
      const item: SetlistItem = {
        id: targetItemId,
        title: datePrefix.length === 8 ? `${datePrefix}-말씀찾기(인용)` : '말씀찾기(인용)',
        sections,
        promptLayout: 'bible',
      };
      addItem(currentSetlistId, item);
      nextQuoteItem = item;
    }

    setActiveItem(targetItemId);
    setActiveSection(sections[0].id);
    if (shouldBroadcast) setPendingSectionId(sections[0].id);

    void saveQuickBibleProgram(currentSetlist, nextQuoteItem).catch((error) => {
      console.warn('[QuickBible] 말씀찾기(인용) 프로그램 자동 저장 실패', error);
    });
  };

  const handleSubmit = (sections: Section[]) => {
    insertQuickBibleSections(sections, true);
  };

  const handlePrepare = (sections: Section[]) => {
    insertQuickBibleSections(sections, false);
  };

  // PPT 변환본은 말씀찾기(인용) 프로그램 "안"이 아니라 그 바로 아래 별도 프로그램으로 배치한다.
  const handleLoadPptProgram = (program: SavedProgram) => {
    if (!currentSetlistId) throw new Error('현재 예배 세트리스트가 없습니다.');

    const currentSetlist = useStore.getState().setlists.find((setlist) => setlist.id === currentSetlistId);
    if (!currentSetlist) throw new Error('현재 예배 세트리스트를 찾지 못했습니다.');

    const placement = placePptProgramBelowQuickBibleQuote(
      currentSetlist.items,
      program.item,
      { dateText: currentSetlist.date },
    );

    updateSetlist(currentSetlistId, { items: placement.items });
    setActiveItem(placement.placedItemId);
    setActiveSection(placement.firstSectionId);
    setOpen(false);
  };

  // pending 송출 — 대상 프로그램 끝에 삽입된 실제 전역 위치를 새 섹션 ID로 찾아 실행
  useEffect(() => {
    if (!pendingSectionId) return;
    const index = allSections.findIndex((entry) => entry.section.id === pendingSectionId);
    if (index < 0) return;
    sendToOutput(index, true);
    // 예약은 실제 송출 직후 한 번만 해제한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingSectionId(null);
  }, [pendingSectionId, allSections, sendToOutput]);

  return {
    openQuickBible,
    quickBibleModal: open
      ? createElement(QuickBibleModal, {
          onSubmit: handleSubmit,
          onPrepare: handlePrepare,
          onLoadPptProgram: handleLoadPptProgram,
          onClose: () => setOpen(false),
        })
      : null,
  };
}
