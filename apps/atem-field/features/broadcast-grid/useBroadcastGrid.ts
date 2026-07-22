'use client';

// 송출 그리드(홈키 전체화면 바둑판) 열림/데이터 로직을 컴포즈 본체에서 분리한 훅.
//   컴포즈 페이지(SetlistPanel)는 이 훅과 BroadcastGridOverlay 만 붙이면 되고,
//   그리드 자체의 유지보수·수정은 features/broadcast-grid/ 안에서 완결된다.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import type { ImageElement } from '@/lib/canvasTypes';
import type { Section, SetlistItem, PromptLayoutType } from '@/lib/types';
import type { BroadcastGridEntry } from './BroadcastGridOverlay';

/** SetlistPanel 의 allSections 항목 형태(그리드가 필요로 하는 최소 필드) */
export interface GridSourceSection {
  itemId: string;
  itemTitle: string;
  section: Section;
}

export interface UseBroadcastGridResult {
  /** 그리드 오버레이 표시 여부 */
  gridMode: boolean;
  /** 오버레이 닫기(onClose)용 */
  closeGrid: () => void;
  /** 전 섹션을 타일로 그릴 엔트리 목록 */
  gridEntries: BroadcastGridEntry[];
}

function isHymnProgramTitle(title: string): boolean {
  const normalized = title.trim();
  if (!normalized) return false;
  return (
    /찬송/.test(normalized) ||
    /^\d{1,4}\s*장(?:\b|[\s_·.-])/.test(normalized) ||
    /^[<\[]?\s*\d{1,4}\s*장/.test(normalized)
  );
}

function isSlideImageProgramItem(item: SetlistItem): boolean {
  if (item.id.startsWith('slide-images-')) return true;
  return item.sections.some((section) =>
    section.elements.some((element): element is ImageElement =>
      element.type === 'image' &&
      typeof element.src === 'string' &&
      element.src.includes('/generated/ppt-slides/'),
    ),
  );
}

function cleanSlideDisplayTitle(title: string): string {
  return title
    .trim()
    .replace(/\.(pptx?|ppsx?)$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/([가-힣])-([가-힣])/g, '$1 $2')
    .replace(/\s*새찬송가악보\s*/g, ' ')
    .replace(/(?:\s|[_-])+(?:wide|와이드|ppt|pptx|ppsx|c|d|e|f|g|a|b)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * [FEATURE: BROADCAST_GRID]
 *  - 홈키로 그리드 열고/닫기 (입력 필드 포커스 중엔 무시)
 *  - 열림 상태를 store.broadcastGridOpen 에 반영 → OperatorPanel 이 ↑↓ 프로그램 이동 시
 *    "첫 섹션 자동 선택"을 억제하는 판단에 쓴다 (그리드 뷰가 튀지 않게).
 *  - allSections → 타일 엔트리(index 포함) 변환.
 */
export function useBroadcastGrid(allSections: GridSourceSection[]): UseBroadcastGridResult {
  const [gridMode, setGridMode] = useState(false);
  const setBroadcastGridOpen = useStore((s) => s.setBroadcastGridOpen);
  // 각 섹션이 속한 프로그램 메타 — itemId → PMT/찬송가 판정/표시 제목.
  // PMT black-white 만으로는 누락되는 찬송가 프로그램이 있어 제목 패턴도 같이 본다.
  const items = useStore((s) => s.setlists.find((l) => l.id === s.currentSetlistId)?.items);
  const itemMetaById = useMemo(() => {
    const m = new Map<string, {
      promptLayout?: PromptLayoutType;
      isHymnProgram: boolean;
      hymnDisplayTitle: string;
      isSlideImageProgram: boolean;
      slideDisplayTitle: string;
      isScriptureMainProgram: boolean;
    }>();
    items?.forEach((it) => {
      const title = it.title.trim();
      const isSlideImageProgram = isSlideImageProgramItem(it);
      m.set(it.id, {
        promptLayout: it.promptLayout,
        isHymnProgram: it.promptLayout === 'black-white' || isHymnProgramTitle(title),
        hymnDisplayTitle: title,
        isSlideImageProgram,
        slideDisplayTitle: cleanSlideDisplayTitle(title),
        isScriptureMainProgram: Boolean(it.hiddenScripture || title.includes('말씀찾기(본문)')),
      });
    });
    return m;
  }, [items]);

  // 열림 상태를 store 에 동기화
  useEffect(() => {
    setBroadcastGridOpen(gridMode);
  }, [gridMode, setBroadcastGridOpen]);

  // 홈키 = 열기 전용 (입력 필드에 커서가 있을 땐 무시).
  //   닫기는 오버레이(BroadcastGridOverlay)가 담당 — 홈키를 2초 안에 두 번 눌러야 닫힘.
  //   (오버레이가 capture 로 홈키를 가로채므로, 열려 있는 동안 이 핸들러엔 홈키가 안 옴)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Home') return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      setGridMode((v) => v || true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const gridEntries = useMemo<BroadcastGridEntry[]>(
    () => allSections.map((s, i) => {
      const itemMeta = itemMetaById.get(s.itemId);
      return {
        index: i,
        itemId: s.itemId,
        itemTitle: s.itemTitle,
        section: s.section,
        promptLayout: itemMeta?.promptLayout,
        isHymnProgram: itemMeta?.isHymnProgram ?? isHymnProgramTitle(s.itemTitle),
        hymnDisplayTitle: itemMeta?.hymnDisplayTitle || s.itemTitle,
        isSlideImageProgram: itemMeta?.isSlideImageProgram ?? s.itemId.startsWith('slide-images-'),
        slideDisplayTitle: itemMeta?.slideDisplayTitle || cleanSlideDisplayTitle(s.itemTitle),
        isScriptureMainProgram: itemMeta?.isScriptureMainProgram ?? s.itemTitle.includes('말씀찾기(본문)'),
        // 프로그램의 첫 섹션 판별 — 앞 항목과 itemId 가 다르면(또는 맨 처음) 첫 섹션.
        isFirstOfItem: i === 0 || allSections[i - 1].itemId !== s.itemId,
      };
    }),
    [allSections, itemMetaById],
  );

  return {
    gridMode,
    closeGrid: () => setGridMode(false),
    gridEntries,
  };
}
