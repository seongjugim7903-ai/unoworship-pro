'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '@/lib/store';
import { SetlistItem, Setlist, Section, extractSectionDisplayText } from '@/lib/types';
import type { SocketMessage, SocketMessageTarget } from '@/lib/socketEvents';
import { useFileManager } from '@/hooks/useFileManager';
import { useSocketSender } from '@/hooks/useSocketSender'; // [FEATURE: SOCKET_IO]
import { useSectionScroller } from '@/components/composer/setlist/SectionScroller'; // [기능2]
import ItemTitleEditor from '@/components/composer/setlist/ItemTitleEditor'; // [기능3]
import SetlistFileBar from '@/components/composer/setlist/SetlistFileBar'; // [기능4]
import SectionCard from '@/components/composer/setlist/SectionCard'; // [기능1]
import { autoPlayVideos } from '@/lib/videoAutoplay';
import { sectionHasYouTube } from '@/lib/youtubeStandby'; // [FEATURE: YT_STANDBY]
import { preloadImages, renderElements } from '@/lib/canvasRenderer'; // [FEATURE: FRAME_PRERENDER]
import { hasCustomRenderTargets, type CanvasElement } from '@/lib/canvasTypes';
import {
  getFixedLayerElements,
  getSectionOutputElements,
  getSectionOwnElements,
} from '@/lib/fixedLayers';
import { hasMotion } from '@/lib/motionEngine';
import { buildPromptVerseContext } from '@/lib/prompt/promptVerseContext'; // [FEATURE: BIBLE_PMT]
import { isSermonTitleSection } from '@/lib/prompt/sermonTitleSection'; // [FEATURE: SCRIPTURE_PMT_EXCLUDE]
import {
  isLayerOutputWorkspaceItem,
  isLayerOutputWorkspaceSection,
} from '@/lib/layerOutputWorkspace';
import { applyBackgroundMotionOnce, isProgramBackgroundSection } from '@/lib/programBackground';
import { isHiddenScriptureItem } from '@/features/hidden-scripture/hiddenScripture';
// [FEATURE: HIDDEN_SCRIPTURE 제거 2026-07-10] 말씀찾기(본문) 숨김 동작 삭제 — 일반 프로그램처럼
//   목록에 보이고 직접 삭제 가능. 플래그(hiddenScripture)는 로더의 "맨앞 배치" 식별용으로만 유지.
import { injectNextLineIntoElements } from '@/features/scripture-next-line/nextLine'; // [FEATURE: SCRIPTURE_NEXT_LINE]
import {
  applySectionCueMacroElements,
  isPromptOnlyTargets,
  isSectionCueMacroEnabled,
  resolveSectionCueBlackoutAction,
  resolveSectionCuePromptLayout,
  resolveSectionCueTargets,
  resolveSectionCueTransitionConfig,
  resolvePromptLayoutTargets,
} from '@/lib/sectionCueMacro';
import {
  canPrerenderOutputFrameForElements,
  createOutputFrameCacheKey,
  digestOutputFrameCacheKey,
  getSharedOutputFrameCacheEntry,
  hasOutputVisibleVideo,
  hasSocketTargets,
  renderOutputFrameDataUrl,
  renderOutputFrameDataUrlAsync,
  setSharedOutputFrameCacheEntry,
  targetsIncludeOutput,
  touchSharedOutputFrameCacheEntry,
  withOutputCacheTrace,
  withoutOutputTarget,
} from '@/lib/outputFrameTransport';
import ChoirPromptLayoutSelector from '@/components/prompt/choir/ChoirPromptLayoutSelector'; // [FEATURE: CHOIR_PMT]
import ServerWorshipLoader from '@/components/composer/setlist/ServerWorshipLoader'; // [FEATURE: SERVER_LOAD]
import CurrentProgramSaveButton from '@/components/composer/setlist/CurrentProgramSaveButton';
import { createSocketTrace } from '@/lib/latencyDiagnostics';
import { useReferenceBroadcastBridge } from '@/features/section-broadcast/referenceBroadcast'; // [FEATURE: REF_BROADCAST]
import BroadcastGridOverlay from '@/features/broadcast-grid/BroadcastGridOverlay'; // [FEATURE: BROADCAST_GRID]
import { useBroadcastGrid } from '@/features/broadcast-grid/useBroadcastGrid'; // [FEATURE: BROADCAST_GRID]
import { useQuickBible } from '@/features/quick-bible/useQuickBible'; // [FEATURE: QUICK_BIBLE] 그리드 B키 긴급 말씀찾기
import { useFixedPrograms } from '@/features/fixed-programs/useFixedPrograms'; // [FEATURE: FIXED_PROGRAMS] 그리드 O키 고정 자료

const MAX_FRAME_CACHE_ENTRIES = 40;
const FRAME_PRERENDER_DELAY_MS = 120;

type CachedFrame = {
  frame: string;
  text: string;
  bytes: number;
  cachedAt: number;
  cacheKey?: string;
};

function isQuoteReferenceItem(item: Pick<SetlistItem, 'title'> | null | undefined): boolean {
  return !!item?.title.includes('말씀찾기(인용)');
}

function sectionHasVisibleImage(section: Section): boolean {
  return !!section.elements?.some((el) => el.type === 'image' && el.visible !== false);
}

function includePromptForVisibleImages(elements: CanvasElement[]): CanvasElement[] {
  let changed = false;
  const next = elements.map((el) => {
    if (el.type !== 'image' || el.visible === false || !el.visibleOn?.length || el.visibleOn.includes('prompt')) {
      return el;
    }
    changed = true;
    return { ...el, visibleOn: [...el.visibleOn, 'prompt' as const] };
  });
  return changed ? next : elements;
}

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');
  const payload = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  return Math.ceil(payload.length * 0.75);
}

function trimFrameCache(cache: Map<string, CachedFrame>): void {
  while (cache.size > MAX_FRAME_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) return;
    cache.delete(oldestKey);
  }
}

function setFrameCacheEntry(
  cache: Map<string, CachedFrame>,
  sectionId: string,
  frame: string,
  text: string,
  cacheKey?: string,
): void {
  cache.delete(sectionId);
  cache.set(sectionId, {
    frame,
    text,
    bytes: estimateDataUrlBytes(frame),
    cachedAt: Date.now(),
    cacheKey,
  });
  trimFrameCache(cache);
}

function touchFrameCacheEntry(cache: Map<string, CachedFrame>, sectionId: string, entry: CachedFrame): void {
  cache.delete(sectionId);
  cache.set(sectionId, { ...entry, cachedAt: Date.now() });
}

function isUsableCachedFrame(entry: CachedFrame | undefined, cacheKey: string): entry is CachedFrame {
  return !!entry && (!entry.cacheKey || entry.cacheKey === cacheKey);
}

function SortableItem({
  item,
  isActive,
  isConfirmingDelete,
  setlistId,
  onSelect,
  onDelete,
  onRename,
  onShowReference,
}: {
  item: SetlistItem;
  isActive: boolean;
  isConfirmingDelete: boolean;
  setlistId: string;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  onShowReference: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  // [FIX: DELETE_ITEM] dnd setNodeRef 와 병합한 카드 ref — 프로그램 선택 시 카드에 포커스를 줘
  //   Delete 키 삭제가 확실히 동작하게 한다.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    cardRef.current = node;
  }, [setNodeRef]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // [FEATURE: DIVIDER] 구분선 아이템 — 얇은 흰 선으로 렌더(드래그로 위치 이동, hover ✕ 삭제).
  //   빈 섹션이라 송출·번호·프로그램 이동(allSections)에는 전혀 잡히지 않는다.
  if (item.id.startsWith('__divider__')) {
    return (
      <div
        ref={setNodeRef}
        data-item-id={item.id}
        style={style}
        {...attributes}
        {...listeners}
        className="group flex items-center gap-1 px-1 py-1 cursor-grab active:cursor-grabbing touch-none"
      >
        <div className="h-px flex-1 bg-white/80" />
        <button
          onClick={onDelete}
          onPointerDown={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-[10px] flex-shrink-0"
          title="구분선 삭제"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setRefs}
      data-item-id={item.id}
      style={style}
      tabIndex={0}
      // [FEATURE: DELETE_ITEM] 카드를 클릭/선택하면 포커스가 들어가고, Delete 키로 삭제(2단계 확인).
      //   포커스된 카드에서만 동작 → 번호칸 Delete(송출해제)나 다른 곳과 안 섞인다.
      //   단, 이름수정 input·PMT 셀렉터 등 인터랙티브 요소 클릭 시엔 포커스를 뺏지 않는다
      //   (대신 제목 클릭=선택 시 onSelect 에서 카드에 포커스를 준다).
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('input, button, select, [contenteditable]')) return;
        e.currentTarget.focus();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Delete') {
          e.preventDefault();
          e.stopPropagation(); // 전역 캔버스 요소 삭제(useEditorCommands window 리스너)로 이벤트가 새지 않게
          onDelete(); // 첫 Delete = 확인 대기(빨간 테두리), 3초 내 다시 Delete = 삭제
        }
      }}
      className={`group rounded-lg border transition-colors outline-none ${
        isConfirmingDelete
          ? 'border-red-500 bg-red-500/10'
          : isActive
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-[#222222] bg-[#1a1a1a] hover:border-[#333]'
      } focus-visible:ring-1 focus-visible:ring-blue-400`}
      onContextMenu={(e) => {
        e.preventDefault();
        onShowReference(); // 우클릭 → 송출번호 참조 패널에 이 프로그램 표시
      }}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex items-center gap-1.5 px-2 py-[4.8px] cursor-grab active:cursor-grabbing touch-none"
      >
        {/* Drag handle — 행 전체가 드래그 영역이라 시각 표시만 */}
        <span className="text-gray-500 group-hover:text-gray-300 select-none text-xs flex-shrink-0">
          ⠿
        </span>

        {/* 제목 + 클립 수 — 더블클릭으로 인라인 수정 [기능3] */}
        <ItemTitleEditor
          title={item.title}
          isActive={isActive}
          sectionCount={item.sections.length}
          onSelect={() => { onSelect(); cardRef.current?.focus(); }}
          onRename={onRename}
        />

        {/* [FEATURE: CHOIR_PMT] 찬양대 전용 PMT — 드래그와 분리(클릭이 드래그로 안 먹히게) */}
        <span onPointerDown={(e) => e.stopPropagation()} className="flex-shrink-0 flex items-center">
          <ChoirPromptLayoutSelector
            setlistId={setlistId}
            itemId={item.id}
            currentLayout={item.promptLayout}
            currentSendMode={item.promptSendMode}
          />
        </span>
        {/* [FEATURE: DELETE_ITEM] 기존 ✕ 삭제 버튼 제거 — 카드 클릭 후 Delete 키로 삭제. */}
      </div>
    </div>
  );
}

export default function SetlistPanel() {
  const {
    setlists,
    currentSetlistId,
    activeItemId,
    activeSectionId,
    isBlackout,
    globalStyle,
    setSelectedElement,
    addSetlist,
    updateSetlist,
    addItem,
    removeItem,
    reorderItems,
    addSection,
    removeSection,
    duplicateSection,
    updateSection,
    updateItem,
    setActiveItem,
    setActiveSection,
    setCurrentSetlist,
    setBlackout,
    setYouTubeStandby,
    broadcastSection,
    setBroadcastSection,
    setReferenceItemId,
  } = useStore();

  const { send } = useSocketSender(); // [FEATURE: SOCKET_IO]
  const { sectionCardRef, suppressNextScroll, suppressNextBroadcastScroll } = useSectionScroller(activeItemId, broadcastSection); // [기능2] 자동 스크롤 + 송출 섹션 추적

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const numberInputRef = useRef<HTMLInputElement>(null);
  const programListRef = useRef<HTMLDivElement>(null);

  // 활성 프로그램(item)이 바뀌면(화살표 ↑/↓, 클릭 등) 프로그램 목록이 따라 스크롤한다.
  useEffect(() => {
    if (!activeItemId) return;
    const container = programListRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-item-id="${activeItemId}"]`);
    if (!el) return;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    if (eRect.top < cRect.top) {
      container.scrollBy({ top: eRect.top - cRect.top - 8, behavior: 'smooth' });
    } else if (eRect.bottom > cRect.bottom) {
      container.scrollBy({ top: eRect.bottom - cRect.bottom + 8, behavior: 'smooth' });
    }
  }, [activeItemId]);

  // ── 실시간 요소 동기화: 송출 중인 섹션은 store.broadcastSection 에서 읽음 ──
  //   (이전에는 지역 outputRef 였으나 OperatorPanel / YouTube 커밋 등 다른
  //    송출 경로와 상태가 어긋나는 문제가 있어 store 로 통합함.)

  // 두 영역 사이 수직 드래그 핸들
  const [itemListHeight, setItemListHeight] = useState(190); // px 초기값
  const MIN_AREA_HEIGHT = 60;
  const panelRef = useRef<HTMLDivElement>(null);

  const handleAreaResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = itemListHeight;

    const handleMouseMove = (ev: MouseEvent) => {
      const panelHeight = panelRef.current?.clientHeight ?? 600;
      const maxHeight = panelHeight * 0.7;
      const newHeight = Math.max(MIN_AREA_HEIGHT, Math.min(maxHeight, startHeight + ev.clientY - startY));
      setItemListHeight(newHeight);
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [itemListHeight]);

  const currentSetlist = setlists.find((s) => s.id === currentSetlistId);
  const currentItem = currentSetlist?.items.find((i) => i.id === activeItemId);
  const currentSection = currentItem?.sections.find((s) => s.id === activeSectionId);
  const visibleItems = currentSetlist?.items.filter(
    (item) => !isLayerOutputWorkspaceItem(item),
  ) ?? [];

  // 전체 섹션 목록 (프로그램순 flatten) + 프로그램 순서 인덱스
  const allSections = useMemo(() => {
    const sections: { itemId: string; section: Section; itemTitle: string; itemIndex: number }[] = [];
    if (currentSetlist) {
      currentSetlist.items.forEach((item, itemIdx) => {
        if (isLayerOutputWorkspaceItem(item)) return;
        for (const section of item.sections) {
          if (isLayerOutputWorkspaceSection(section)) continue;
          if (isProgramBackgroundSection(section)) continue;
          sections.push({ itemId: item.id, section, itemTitle: item.title, itemIndex: itemIdx });
        }
      });
    }
    return sections;
  }, [currentSetlist]);

  const currentIndex = allSections.findIndex(
    (s) => s.section.id === activeSectionId && s.itemId === activeItemId
  );

  // [FEATURE: FRAME_PRERENDER] 프리렌더 프레임 캐시
  // sectionId → { frame: dataURL, text: string }
  const frameCacheRef = useRef<Map<string, CachedFrame>>(new Map());
  const prerenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 단일 섹션 프리렌더 (비동기 — toBlob 기반)
  const prerenderSection = useCallback(async (
    section: Section,
    displayText: string,
  ): Promise<{
    frame: string;
    cacheKey: string;
    text: string;
    outputOnly: boolean;
    fixedLayerCount: number;
    ownElementCount: number;
    outputElementCount: number;
    hasOutputRouting: boolean;
    hasOutputVideo: boolean;
  } | null> => {
    const fixedElements = getFixedLayerElements(currentSetlist);
    const item = currentSetlist?.items.find((candidate) =>
      candidate.sections.some((s) => s.id === section.id),
    );
    const elements = applyBackgroundMotionOnce(
      getSectionOutputElements(currentSetlist, section),
      item,
      section.id,
    );
    if (!elements || elements.length === 0) return null;

    const sectionHasMotion = hasMotion(elements);
    const hasOutputVideo = hasOutputVisibleVideo(elements);
    if (!canPrerenderOutputFrameForElements({
      elements,
      hasMotion: sectionHasMotion,
      targets: ['output'],
    })) {
      return null;
    }

    const ownElements = getSectionOwnElements(section);
    const sectionHasOutputRouting = hasCustomRenderTargets(elements);
    const outputOnly = fixedElements.length > 0 || sectionHasOutputRouting;
    const frameText = outputOnly && ownElements.length === 0 ? '' : displayText;
    const cacheKey = createOutputFrameCacheKey(section.id, elements, frameText);

    // 이미지 프리로드 확인
    await preloadImages(elements);

    const frame = await renderOutputFrameDataUrlAsync(elements, frameText);
    return frame
      ? {
          frame,
          cacheKey,
          text: frameText,
          outputOnly,
          fixedLayerCount: fixedElements.length,
          ownElementCount: ownElements.length,
          outputElementCount: elements.length,
          hasOutputRouting: sectionHasOutputRouting,
          hasOutputVideo,
        }
      : null;
  }, [currentSetlist]);

  // 셋리스트 변경 시 모든 섹션을 백그라운드에서 미리 렌더링
  useEffect(() => {
    if (allSections.length === 0) return;
    let cancelled = false;

    if (prerenderTimerRef.current) {
      clearTimeout(prerenderTimerRef.current);
      prerenderTimerRef.current = null;
    }
    frameCacheRef.current.clear();

    // 1단계: 컴포저 이미지 캐시
    const allElements = currentSetlist?.items.flatMap((item) =>
      item.sections.flatMap((section) => section.elements ?? [])
    ) ?? [];
    const preloadPromise = allElements.length > 0
      ? preloadImages(allElements)
      : Promise.resolve(0);

    // 2단계: 이미지 로드 완료 후 모든 섹션 프리렌더 + 출력 모니터로 전송
    preloadPromise.then(() => {
      // 순차 렌더 + 유휴 시간에 출력 PC로 전송 (소켓 부하 분산)
      const renderNext = async (i: number) => {
        if (cancelled || i >= allSections.length) {
          return;
        }
        const { section } = allSections[i];
        if (section.elements && section.elements.length > 0) {
          const text = extractSectionDisplayText(section);
          const prerendered = await prerenderSection(section, text);
          if (!cancelled && prerendered) {
            setFrameCacheEntry(
              frameCacheRef.current,
              section.id,
              prerendered.frame,
              prerendered.text,
              prerendered.cacheKey,
            );
            setSharedOutputFrameCacheEntry({
              sectionId: section.id,
              frame: prerendered.frame,
              text: prerendered.text,
              cacheKey: prerendered.cacheKey,
            });
            send({
              ...withOutputCacheTrace({
                type: 'FRAME_CACHE',
                targets: prerendered.outputOnly ? ['output'] : undefined,
                payload: { sectionId: section.id, frame: prerendered.frame },
              }, {
                cachePhase: 'setlist-prerender',
                cacheDecision: 'store-frame-cache',
                cacheReason: prerendered.outputOnly ? 'fixed-or-routed-output-frame' : 'normal-frame-cache',
                cacheKeyDigest: digestOutputFrameCacheKey(prerendered.cacheKey),
                fixedLayerCount: prerendered.fixedLayerCount,
                ownElementCount: prerendered.ownElementCount,
                outputElementCount: prerendered.outputElementCount,
                hasOutputRouting: prerendered.hasOutputRouting,
                hasOutputVideo: prerendered.hasOutputVideo,
                outputOnlyFrame: prerendered.outputOnly,
              }),
            });
          }
        }
        // 다음 섹션 — 500ms 간격으로 소켓 부하 분산
        if (!cancelled) {
          prerenderTimerRef.current = setTimeout(() => renderNext(i + 1), FRAME_PRERENDER_DELAY_MS);
        }
      };
      void renderNext(0);
    });

    return () => {
      cancelled = true;
      if (prerenderTimerRef.current) {
        clearTimeout(prerenderTimerRef.current);
        prerenderTimerRef.current = null;
      }
    };
  }, [currentSetlistId, allSections.length, prerenderSection, send]); // eslint-disable-line react-hooks/exhaustive-deps

  // [FIX: ELEMENTS_UPDATE] 섹션에 캔버스 요소가 있으면 ELEMENTS_UPDATE,
  // 없으면 레거시 SUBTITLE_UPDATE 전송
  //
  // [FEATURE: YT_STANDBY]
  //   index 가 지정된 호출(섹션 카드 더블클릭) 에서 YouTube 섹션이면
  //   즉시 송출하지 않고 스탠바이만 잡음. Enter/Space 또는 에디터 내 YouTube
  //   클릭으로 커밋.
  const sendToOutput = useCallback((index?: number, forceCommit?: boolean) => {
    const controlStartedAt = Date.now();
    const sendWithTrace = (msg: SocketMessage) => {
      const trace = msg.trace ?? createSocketTrace(msg);
      send(trace
        ? ({
            ...msg,
            trace: {
              ...trace,
              controlStartedAt,
              controlPrepMs: Date.now() - controlStartedAt,
            },
          } as SocketMessage)
        : msg);
    };

    let targetSection: Section | null = null;
    let targetItem: string | null = null;

    if (index !== undefined && index >= 0 && index < allSections.length) {
      const target = allSections[index];
      targetSection = target.section;
      targetItem = target.itemId;
      setActiveItem(target.itemId);
      setActiveSection(target.section.id);
    } else {
      targetSection = currentSection ?? null;
      targetItem = activeItemId;
      // 재송출(편집 후) → 캐시 무효화하여 최신 상태 렌더링
      if (targetSection) frameCacheRef.current.delete(targetSection.id);
    }

    if (!targetSection || !targetItem) {
      sendWithTrace({ type: 'CLEAR_TEXT' });
      setYouTubeStandby(null);
      setBroadcastSection(null);
      return;
    }

    if (isLayerOutputWorkspaceSection(targetSection)) {
      return;
    }

    const item = currentSetlist?.items.find((i) => i.id === targetItem);
    const cueMacro = isSectionCueMacroEnabled(targetSection) ? targetSection.cueMacro : undefined;
    const resolvedLayout = resolveSectionCuePromptLayout(cueMacro, item?.promptLayout);
    // [FEATURE: SCRIPTURE_PMT_EXCLUDE] 말씀본문(scripture) 프로그램이라도 설교 타이틀류(말씀타이틀·
    //   제목/본문·설교자) 섹션은 scripture 렌더에서 제외 → 그 섹션 송출 시엔 PMT 미적용(none)처럼.
    const quoteReferenceImageSection = isQuoteReferenceItem(item) && sectionHasVisibleImage(targetSection);
    const promptLayout =
      quoteReferenceImageSection
        ? 'none'
        : resolvedLayout === 'scripture' && isSermonTitleSection(targetSection)
          ? 'none'
          : resolvedLayout;
    const baseTargets: SocketMessageTarget[] | undefined =
      item?.promptSendMode === 'prompt-only' ? ['prompt'] : undefined;
    const cueTargets = resolveSectionCueTargets(cueMacro, baseTargets);
    const messageTargets = resolvePromptLayoutTargets(promptLayout, cueTargets);
    const isPromptOnlySend = isPromptOnlyTargets(messageTargets);

    const blackoutAction = resolveSectionCueBlackoutAction(cueMacro);
    if (!isPromptOnlySend) {
      if (blackoutAction === 'on') {
        setBlackout(true);
      } else if (isBlackout && blackoutAction === 'auto-off') {
        setBlackout(false);
      }
    }

    // [FEATURE: YT_STANDBY] 네비게이션 경로에서 YouTube 섹션 도착 시 ARM(스탠바이)만.
    //   단, 명시적 '송출 버튼'(번호 입력 후 Enter → forceCommit=true)이면 ARM 없이
    //   바로 정상 송출 경로로 흘려보내 유튜브가 그 섹션에서 즉시 재생되게 한다.
    if (!isPromptOnlySend && index !== undefined && !forceCommit && sectionHasYouTube(targetSection)) {
      setYouTubeStandby({ itemId: targetItem, sectionId: targetSection.id });
      return;
    }

    // 실제 송출 — 스탠바이 해제, 브로드캐스트 섹션 갱신
    setYouTubeStandby(null);
    if (!isPromptOnlySend) {
      setBroadcastSection({ itemId: targetItem, sectionId: targetSection.id });
    }

    const mergedStyle = { ...globalStyle, ...item?.style };

    // [FEATURE: PROMPT_LAYOUT] 프롬프트 레이아웃 + 다음 섹션 텍스트
    const targetIndex = allSections.findIndex(
      (s) => s.section.id === targetSection.id && s.itemId === targetItem
    );
    // [FIX: PROMPT_TEXT] 다음 섹션 텍스트 — 같은 프로그램(itemId) 내에서만
    const nextEntry = targetIndex >= 0 && targetIndex < allSections.length - 1
      ? allSections[targetIndex + 1]
      : null;
    const nextSection = nextEntry && nextEntry.itemId === targetItem
      ? nextEntry.section
      : null;
    const nextSectionText = nextSection ? extractSectionDisplayText(nextSection) : '';
    const displayText = extractSectionDisplayText(targetSection);
    // [FEATURE: BIBLE_PMT] bible 레이아웃이면 프로그램 전체 절 목록 동봉 (무대 프롬프터 전체 보기)
    const verseContext = buildPromptVerseContext(item, targetSection.id, promptLayout) ?? {};
    const sectionKind = targetSection.label === '표지' || targetSection.colorMark === '#facc15'
      ? 'cover'
      : 'default';

    const fixedElements = getFixedLayerElements(currentSetlist);
    const ownElements = applySectionCueMacroElements(getSectionOwnElements(targetSection), cueMacro);
    // [FEATURE: SCRIPTURE_NEXT_LINE] 성경본문 템플릿의 nextLine 슬롯에 다음 섹션 첫 줄 주입 (PMT 규칙 재사용)
    const baseElements = injectNextLineIntoElements(
      applySectionCueMacroElements(
        applyBackgroundMotionOnce(
          getSectionOutputElements(currentSetlist, targetSection),
          item,
          targetSection.id,
        ),
        cueMacro,
      ),
      nextSectionText,
    );
    const elements = quoteReferenceImageSection ? includePromptForVisibleImages(baseElements) : baseElements;
    const hasElements = elements.length > 0;
    const hasOwnElements = ownElements.length > 0;
    const hasText = !!targetSection.text;

    // [FEATURE: SECTION_TRANSITION] 섹션 전환 효과 payload (cut 이면 undefined 로 전송)
    const sectionTransition = resolveSectionCueTransitionConfig(cueMacro, useStore.getState().sectionTransition);
    const transitionPayload = sectionTransition.type !== 'cut' && sectionTransition.duration > 0
      ? { type: sectionTransition.type, duration: sectionTransition.duration }
      : undefined;

    if (hasElements) {
      const sectionHasMotion = hasMotion(elements);
      const sectionHasOutputRouting = hasCustomRenderTargets(elements);
      const sectionHasFixedLayers = fixedElements.length > 0;
      const shouldSendRawElements = sectionHasMotion || sectionHasOutputRouting || sectionHasFixedLayers || !!cueMacro;
      const elementSectionText = hasOwnElements ? displayText : '';
      const normalFrameCacheKey = createOutputFrameCacheKey(targetSection.id, elements, displayText);
      const outputOnlyFrameCacheKey = createOutputFrameCacheKey(targetSection.id, elements, elementSectionText);
      const outputFrameDebugInfo = {
        fixedLayerCount: fixedElements.length,
        ownElementCount: ownElements.length,
        outputElementCount: elements.length,
        hasOutputRouting: sectionHasOutputRouting,
        hasOutputVideo: hasOutputVisibleVideo(elements),
      };
      let rawElementTargets = messageTargets;
      let rawElementsSent = false;
      let outputElementsSent = false;
      const sendRawElementsUpdate = (targets: SocketMessageTarget[] | undefined) => {
        if (!hasSocketTargets(targets)) return;
        sendWithTrace({
          type: 'ELEMENTS_UPDATE',
          targets,
          payload: {
            elements,
            sectionText: elementSectionText,
            promptLayout,
            nextSectionText,
            sectionKind,
            transition: transitionPayload,
            ...verseContext,
          },
        });
        if (targetsIncludeOutput(targets)) outputElementsSent = true;
        rawElementsSent = true;
      };

      // [FEATURE: FRAME_PRERENDER] 캐시 히트 → FRAME_SHOW (ID만), 미스 → FRAME_UPDATE (프레임 포함)
      const cached = shouldSendRawElements
        ? undefined
        : frameCacheRef.current.get(targetSection.id);
      const usableCached = isUsableCachedFrame(
        cached,
        normalFrameCacheKey,
      ) ? cached : undefined;

      if (usableCached) {
        touchFrameCacheEntry(frameCacheRef.current, targetSection.id, usableCached);
        // ✅ 캐시 히트 — 출력 모니터에도 이미 FRAME_CACHE로 전송됨
        sendWithTrace(withOutputCacheTrace({
          type: 'FRAME_SHOW',
          targets: messageTargets,
          payload: {
            sectionId: targetSection.id,
            sectionText: displayText,
            hasMotion: sectionHasMotion,
            promptLayout,
            nextSectionText,
            sectionKind,
            transition: transitionPayload,
          },
        }, {
          ...outputFrameDebugInfo,
          cachePhase: 'setlist-normal',
          cacheDecision: 'hit-frame-show',
          cacheReason: 'frame-cache-ref-hit',
          cacheKeyDigest: digestOutputFrameCacheKey(normalFrameCacheKey),
          cacheAgeMs: Date.now() - usableCached.cachedAt,
          outputOnlyFrame: false,
        }));
      } else if (!shouldSendRawElements) {
        // ❌ 캐시 미스 — 실시간 렌더 후 FRAME_UPDATE (프레임 포함)
        const offCanvas = document.createElement('canvas');
        offCanvas.width = 1920;
        offCanvas.height = 1080;
        const offCtx = offCanvas.getContext('2d');
        if (offCtx) {
          renderElements(offCtx, elements, displayText, 1920, 1080, { target: 'output' });
          const frame = offCanvas.toDataURL('image/webp', 0.85);

          setFrameCacheEntry(frameCacheRef.current, targetSection.id, frame, displayText, normalFrameCacheKey);

          sendWithTrace(withOutputCacheTrace({
            type: 'FRAME_UPDATE',
            targets: messageTargets,
            payload: {
              frame,
              sectionText: displayText,
              hasMotion: sectionHasMotion,
              promptLayout,
              nextSectionText,
              sectionKind,
              transition: transitionPayload,
            },
          }, {
            ...outputFrameDebugInfo,
            cachePhase: 'setlist-normal',
            cacheDecision: 'miss-frame-update',
            cacheReason: 'frame-cache-ref-miss',
            cacheKeyDigest: digestOutputFrameCacheKey(normalFrameCacheKey),
            outputOnlyFrame: false,
          }));
          sendWithTrace(withOutputCacheTrace({
            type: 'FRAME_CACHE',
            targets: messageTargets,
            payload: { sectionId: targetSection.id, frame },
          }, {
            ...outputFrameDebugInfo,
            cachePhase: 'setlist-normal',
            cacheDecision: 'store-frame-cache',
            cacheReason: 'store-after-frame-update',
            cacheKeyDigest: digestOutputFrameCacheKey(normalFrameCacheKey),
            outputOnlyFrame: false,
          }));
        }
      }

      // Output 렌더 최적화:
      //   분리출력/고정레이어/큐매크로 때문에 raw elements가 필요하더라도,
      //   Output 화면 자체가 정적 캔버스로 납작하게 합성 가능한 경우에는 Output에만 FRAME_UPDATE를 보낸다.
      //   Prompt/Broadcast는 기존처럼 raw elements를 받아 각자의 타겟 필터를 유지한다.
      if (
        shouldSendRawElements &&
        canPrerenderOutputFrameForElements({
          elements,
          hasMotion: sectionHasMotion,
          targets: messageTargets,
        })
      ) {
        // Prompt/Broadcast 원본 요소를 먼저 내보내 output 프레임 생성 대기 시간을 분리한다.
        rawElementTargets = withoutOutputTarget(messageTargets);
        sendRawElementsUpdate(rawElementTargets);

        const cachedOutputFrame = getSharedOutputFrameCacheEntry(targetSection.id, outputOnlyFrameCacheKey);
        if (cachedOutputFrame) {
          touchSharedOutputFrameCacheEntry(targetSection.id, cachedOutputFrame);
          sendWithTrace(withOutputCacheTrace({
            type: 'FRAME_SHOW',
            targets: ['output'],
            payload: {
              sectionId: targetSection.id,
              sectionText: displayText,
              hasMotion: false,
              promptLayout,
              nextSectionText,
              sectionKind,
              transition: transitionPayload,
            },
          }, {
            ...outputFrameDebugInfo,
            cachePhase: 'setlist-output-only',
            cacheDecision: 'hit-frame-show',
            cacheReason: 'shared-output-cache-hit',
            cacheKeyDigest: digestOutputFrameCacheKey(outputOnlyFrameCacheKey),
            cacheAgeMs: Date.now() - cachedOutputFrame.cachedAt,
            outputOnlyFrame: true,
          }));
        } else {
          const frame = renderOutputFrameDataUrl(elements, elementSectionText);
          if (frame) {
            setSharedOutputFrameCacheEntry({
              sectionId: targetSection.id,
              frame,
              text: elementSectionText,
              cacheKey: outputOnlyFrameCacheKey,
            });
            sendWithTrace(withOutputCacheTrace({
              type: 'FRAME_SHOW',
              targets: ['output'],
              payload: {
                sectionId: targetSection.id,
                sectionText: displayText,
                hasMotion: false,
                promptLayout,
                nextSectionText,
                sectionKind,
                transition: transitionPayload,
              },
            }, {
              ...outputFrameDebugInfo,
              cachePhase: 'setlist-output-only',
              cacheDecision: 'miss-store-show',
              cacheReason: 'shared-output-cache-miss-frame-cache-sent',
              cacheKeyDigest: digestOutputFrameCacheKey(outputOnlyFrameCacheKey),
              outputOnlyFrame: true,
            }));
            sendWithTrace(withOutputCacheTrace({
              type: 'FRAME_CACHE',
              targets: ['output'],
              payload: { sectionId: targetSection.id, frame },
            }, {
              ...outputFrameDebugInfo,
              cachePhase: 'setlist-output-only',
              cacheDecision: 'store-frame-cache',
              cacheReason: 'store-before-frame-show',
              cacheKeyDigest: digestOutputFrameCacheKey(outputOnlyFrameCacheKey),
              outputOnlyFrame: true,
            }));
          } else {
            sendRawElementsUpdate(['output']);
          }
        }
      }

      if (!shouldSendRawElements && !usableCached) {
        const latestFrame = frameCacheRef.current.get(targetSection.id);
        if (latestFrame) {
          setSharedOutputFrameCacheEntry({
            sectionId: targetSection.id,
            frame: latestFrame.frame,
            text: latestFrame.text,
            cacheKey: normalFrameCacheKey,
          });
        }
      }

      // 요소 원본(raw)을 필요한 화면에 전송한다.
      // [FIX: 무대 누락] 예전에는 이 raw 전송이 `if (shouldSendRawElements)` 안에 갇혀 있어,
      //   정적 섹션(모션·출력라우팅·고정레이어·큐매크로 없음)은 무대(prompt)·방송(broadcast)에
      //   raw 요소를 보내지 않았다. 무대는 FRAME_SHOW 를 자기 로컬 캐시에 프레임이 있을 때만
      //   그리므로(PromptCanvas 698행) 캐시가 비면 무대가 안 바뀐다. → 가드를 없애 OperatorPanel
      //   (PageDown, 정상 동작) 과 동일하게 항상 raw 를 보낸다. output 은 rawElementTargets 에
      //   포함될 때만 받고, 아래 블록이 FRAME 경로의 output 미전송을 보강한다.
      if (!rawElementsSent) {
        sendRawElementsUpdate(rawElementTargets);
      }
      if (!outputElementsSent && targetsIncludeOutput(messageTargets)) {
        sendRawElementsUpdate(['output']);
      }

      if (sectionHasFixedLayers && !hasOwnElements && hasText) {
        sendWithTrace({
          type: 'SUBTITLE_UPDATE',
          targets: messageTargets,
          payload: {
            text: targetSection.text,
            style: mergedStyle,
            promptLayout,
            nextSectionText,
            sectionKind,
            transition: transitionPayload,
            ...verseContext,
          },
        });
      }

      // 비디오 요소 자동 재생 (에디터 + 송출 PC, 재시도 로직 포함)
      autoPlayVideos(elements, { targets: messageTargets });
    } else if (hasText) {
      // 텍스트만 있으면 레거시 SUBTITLE_UPDATE + elements 초기화
      sendWithTrace({ type: 'ELEMENTS_UPDATE', targets: messageTargets, payload: { elements: [], sectionText: '', promptLayout, nextSectionText, sectionKind, transition: transitionPayload, ...verseContext } });
      sendWithTrace({ type: 'SUBTITLE_UPDATE', targets: messageTargets, payload: { text: targetSection.text, style: mergedStyle, promptLayout, nextSectionText, sectionKind, transition: transitionPayload, ...verseContext } });
    } else {
      // 아무것도 없는 빈 섹션 → 화면 클리어 (맨 화면 = 카메라만 보임)
      sendWithTrace({ type: 'ELEMENTS_UPDATE', targets: messageTargets, payload: { elements: [], sectionText: '', promptLayout, nextSectionText, sectionKind, transition: transitionPayload, ...verseContext } });
      sendWithTrace({ type: 'SUBTITLE_UPDATE', targets: messageTargets, payload: { text: '', style: mergedStyle, promptLayout, nextSectionText, sectionKind, transition: transitionPayload, ...verseContext } });
    }
  }, [allSections, currentSection, activeItemId, currentSetlist, isBlackout, globalStyle,
      setActiveItem, setActiveSection, setBlackout, setYouTubeStandby, setBroadcastSection, send]);
  // [/FIX: ELEMENTS_UPDATE]

  // [FEATURE: REF_BROADCAST] 송출번호 참조 패널의 송출 요청 → 동일한 sendToOutput 단일 구현으로 실행
  useReferenceBroadcastBridge(sendToOutput);

  // [FEATURE: BROADCAST_GRID] 송출 그리드 열기/데이터 로직은 features/broadcast-grid 로 격리 (본체엔 오버레이 렌더만)
  const { gridMode, closeGrid, gridEntries } = useBroadcastGrid(allSections);
  const broadcastItem = broadcastSection
    ? currentSetlist?.items.find((i) => i.id === broadcastSection.itemId)
    : undefined;
  const clearTextTargets: SocketMessageTarget[] | undefined =
    broadcastItem && (isHiddenScriptureItem(broadcastItem) || broadcastItem.title.includes('말씀찾기(본문)'))
      // 말씀찾기(본문)는 메인 해제 시 서브(prompt)를 유지한다. 서브는 다른 섹션 송출 때만 교체된다.
      ? ['output', 'broadcast']
      : undefined;
  const clearGridBroadcast = useCallback(() => {
    send(clearTextTargets ? { type: 'CLEAR_TEXT', targets: clearTextTargets } : { type: 'CLEAR_TEXT' });
    setYouTubeStandby(null);
    setBroadcastSection(null);
  }, [clearTextTargets, send, setYouTubeStandby, setBroadcastSection]);
  const selectGridSection = useCallback((index: number) => {
    const target = allSections[index];
    if (!target) return;
    // 그리드 한 번 클릭은 선택만 한다. 송출·자동 스크롤은 실행하지 않는다.
    setSelectedElement(null);
    setActiveItem(target.itemId);
    setActiveSection(target.section.id);
  }, [allSections, setSelectedElement, setActiveItem, setActiveSection]);
  // [FEATURE: QUICK_BIBLE] 그리드에서 B키 → 책장절 입력 → 말씀찾기(인용) 끝 삽입+즉시 송출
  const { quickBibleModal, openQuickBible } = useQuickBible(allSections, sendToOutput);
  // [FEATURE: FIXED_PROGRAMS] 그리드에서 O키 → 고정 찬양·예식문을 배치/송출
  const { fixedProgramModal, openFixedPrograms } = useFixedPrograms(allSections, sendToOutput);

  // ── 실시간 동기화 비활성화 ──
  //   기 송출된 섹션을 에디터에서 수정해도 라이브로 나가지 않음.
  //   재 송출은 명시적 조작(더블클릭, Enter, PageDown/Up)으로만 가능.
  // [/실시간 동기화]

  const handleNumberInput = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const num = parseInt((e.target as HTMLInputElement).value);
      if (!isNaN(num) && num >= 1 && num <= allSections.length) {
        sendToOutput(num - 1, true); // [YT] 명시적 송출 — 유튜브 섹션도 스탠바이 없이 즉시 송출/재생
      }
      (e.target as HTMLInputElement).value = '';
    }
    // [FEATURE: DELETE_UNCAST] 번호칸에 커서가 있을 때 Delete → 현재 송출 해제(다른 폼엔 영향 없음).
    //   blur 안 함 → 커서는 번호칸에 그대로 유지. 소켓 CLEAR_TEXT 로 출력/ATEM 창까지 해제됨.
    if (e.key === 'Delete') {
      e.preventDefault();
      send(clearTextTargets ? { type: 'CLEAR_TEXT', targets: clearTextTargets } : { type: 'CLEAR_TEXT' });
      setBroadcastSection(null); // "송출 중" 하이라이트 제거 (섹션 선택은 유지)
      (e.target as HTMLInputElement).value = '';
    }
  }, [allSections.length, sendToOutput, clearTextTargets, send, setBroadcastSection]);

  // 파일 관리 — hooks/useFileManager.ts 에서 관리
  const { triggerImport, handleFileChange, createSetlist, fileInputRef } =
    useFileManager({
      onImport: (imported) => {
        const newSetlist: Setlist = {
          ...imported,
          id: `setlist-${Date.now()}`,
          createdAt: Date.now(),
        };
        addSetlist(newSetlist);
        setCurrentSetlist(newSetlist.id);
        if (newSetlist.items[0]) {
          setActiveItem(newSetlist.items[0].id);
          if (newSetlist.items[0].sections[0]) {
            setActiveSection(newSetlist.items[0].sections[0].id);
          }
        }
      },
    });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !currentSetlist || !currentSetlistId) return;

      const oldIndex = currentSetlist.items.findIndex((i) => i.id === active.id);
      const newIndex = currentSetlist.items.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const newItems = arrayMove(currentSetlist.items, oldIndex, newIndex);
      reorderItems(currentSetlistId, newItems);
    },
    [currentSetlist, currentSetlistId, reorderItems]
  );

  const handleAddItem = useCallback(() => {
    if (!currentSetlistId) return;
    const newItem: SetlistItem = {
      id: `item-${Date.now()}`,
      title: '새 프로그램',
      sections: [
        {
          id: `sec-${Date.now()}`,
          label: '절 1',
          text: '',
          colorMark: '#ffffff',
          elements: [],
        },
      ],
    };
    addItem(currentSetlistId, newItem);
    setActiveItem(newItem.id);
    setActiveSection(newItem.sections[0].id);
  }, [currentSetlistId, addItem, setActiveItem, setActiveSection]);

  // [FEATURE: DIVIDER] 흰 구분선 추가 — 빈 섹션 아이템(끝에 추가 → 드래그로 위치 이동). 클릭할 때마다 하나씩 생성.
  const handleAddDivider = useCallback(() => {
    if (!currentSetlistId) return;
    addItem(currentSetlistId, { id: `__divider__${Date.now()}`, title: '', sections: [] });
  }, [currentSetlistId, addItem]);

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      if (confirmDelete === itemId) {
        if (currentSetlistId) removeItem(currentSetlistId, itemId);
        setConfirmDelete(null);
      } else {
        setConfirmDelete(itemId);
        setTimeout(() => setConfirmDelete(null), 3000);
      }
    },
    [confirmDelete, currentSetlistId, removeItem]
  );

  const handleSelectItem = useCallback(
    (item: SetlistItem) => {
      // 캔버스 요소 선택 해제 → 화살표 키가 섹션 탐색으로 전환
      setSelectedElement(null);
      setActiveItem(item.id);
      if (item.sections.length > 0) {
        setActiveSection(item.sections[0].id);
      }
    },
    [setSelectedElement, setActiveItem, setActiveSection]
  );

  // handleExport, handleImport → hooks/useFileManager.ts 로 이동됨

  if (!currentSetlist) {
    return (
      <div className="flex flex-col h-full bg-[#111111] text-white">
        {/* 상단 바 — 빈 상태에서도 새 예배 만들기 가능 */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#222222]">
          <span className="text-sm flex-shrink-0">📋</span>
          <p className="flex-1 text-sm font-semibold text-gray-500 truncate">
            새 예배 만들기
          </p>

          {/* 서버에서 워십 불러오기 */}
          <ServerWorshipLoader />

          {/* 새 워십 만들기 */}
          {creatingNew ? (
            <input
              autoFocus
              placeholder="워십명 + Enter"
              onBlur={() => setCreatingNew(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const name = (e.target as HTMLInputElement).value.trim();
                  if (name) {
                    const newSetlist = createSetlist(name);
                    addSetlist(newSetlist);
                    setCurrentSetlist(newSetlist.id);
                  }
                  setCreatingNew(false);
                }
                if (e.key === 'Escape') setCreatingNew(false);
              }}
              className="w-28 h-7 bg-[#0a0a0a] border border-blue-500 rounded px-2 text-xs
                         text-white focus:outline-none placeholder-gray-600"
            />
          ) : (
            <button
              onClick={() => setCreatingNew(true)}
              title="새 워십 만들기"
              className="flex-shrink-0 w-7 h-7 rounded-md bg-[#1e2a1e] hover:bg-green-700
                         flex items-center justify-center text-green-400 hover:text-white
                         transition-colors text-base font-bold"
            >
              +
            </button>
          )}
        </div>

        {/* 빈 상태 안내 */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-500 p-8">
          <div className="text-4xl opacity-30">📋</div>
          <p className="text-sm text-center">
            세트리스트가 없습니다
          </p>
          <button
            onClick={() => setCreatingNew(true)}
            className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm rounded-lg transition-colors"
          >
            + 새 예배 만들기
          </button>
          <button
            onClick={triggerImport}
            className="px-4 py-2 bg-[#222] hover:bg-[#333] text-gray-300 text-sm rounded-lg transition-colors"
          >
            파일에서 불러오기
          </button>
          {/* 숨겨진 file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} className="flex flex-col h-full bg-[#111111] text-white">
      {/* [FEATURE: BROADCAST_GRID] 홈키로 여는 전체화면 송출 그리드 (portal → body) */}
      {gridMode && (
        <BroadcastGridOverlay
          entries={gridEntries}
          broadcastSectionId={broadcastSection?.sectionId ?? null}
          activeSectionId={activeSectionId}
          onSelect={selectGridSection}
          onBroadcast={(index) => sendToOutput(index, true)}
          onClearBroadcast={clearGridBroadcast}
          onOpenQuickBible={openQuickBible}
          onOpenFixedPrograms={openFixedPrograms}
          onClose={closeGrid}
        />
      )}
      {/* [FEATURE: QUICK_BIBLE] 긴급 말씀찾기 모달 (그리드 위 z-9999, portal) */}
      {quickBibleModal}
      {/* [FEATURE: FIXED_PROGRAMS] 고정 프로그램 모달 (그리드 위 z-10000, portal) */}
      {fixedProgramModal}
      {/* Setlist name + 프로그램 추가/새 워십 아이콘 */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#222222]">
        <span className="text-sm flex-shrink-0">📋</span>
        {editingName ? (
          <input
            autoFocus
            defaultValue={currentSetlist.name}
            onBlur={(e) => {
              updateSetlist(currentSetlist.id, { name: e.target.value });
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateSetlist(currentSetlist.id, { name: (e.target as HTMLInputElement).value });
                setEditingName(false);
              }
            }}
            className="flex-1 bg-[#0a0a0a] border border-[#333] rounded px-2 py-0.5 text-sm font-semibold text-white focus:outline-none focus:border-blue-500"
          />
        ) : (
          <p
            className="flex-1 text-sm font-semibold text-white truncate cursor-pointer hover:text-blue-400 transition-colors"
            onClick={() => setEditingName(true)}
          >
            {currentSetlist.name || '워십 이름 없음'}
          </p>
        )}

        {/* 프로그램 추가 아이콘 */}
        <button
          onClick={handleAddItem}
          title="프로그램 추가"
          className="flex-shrink-0 w-7 h-7 rounded-md bg-[#1e2a3a] hover:bg-blue-600
                     flex items-center justify-center text-blue-400 hover:text-white
                     transition-colors text-base font-bold"
        >
          ♪
        </button>

        {/* 현재 선택 프로그램을 서버에 저장/갱신 */}
        <CurrentProgramSaveButton />

        {/* [임시] 변환본 불러오기 — PPT 변환 슬라이드를 프로그램으로 불러오기(load 탭 오픈) */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-ppt-loader'))}
          title="변환본 불러오기 (PPT 슬라이드)"
          className="flex-shrink-0 h-7 px-2 rounded-md bg-[#0e2a2a] hover:bg-cyan-600
                     flex items-center justify-center text-cyan-300 hover:text-white
                     transition-colors text-[11px] font-bold whitespace-nowrap"
        >
          변환본
        </button>

        {/* 서버에서 워십 불러오기 */}
        <ServerWorshipLoader />

        {/* 구분선 추가 (흰 아이콘) — 누를 때마다 프로그램 사이 구분선 하나씩 생성 */}
        <button
          onClick={handleAddDivider}
          title="구분선 추가"
          className="flex-shrink-0 w-7 h-7 rounded-md bg-[#1a1a1a] hover:bg-white/20
                     flex items-center justify-center text-white
                     transition-colors text-lg font-bold leading-none"
        >
          —
        </button>

        {/* 새 워십 만들기 아이콘 */}
        {creatingNew ? (
          <input
            autoFocus
            placeholder="워십명 + Enter"
            onBlur={() => setCreatingNew(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const name = (e.target as HTMLInputElement).value.trim();
                if (name) {
                  const newSetlist = createSetlist(name);
                  addSetlist(newSetlist);
                  setCurrentSetlist(newSetlist.id);
                }
                setCreatingNew(false);
              }
              if (e.key === 'Escape') setCreatingNew(false);
            }}
            className="w-28 h-7 bg-[#0a0a0a] border border-blue-500 rounded px-2 text-xs
                       text-white focus:outline-none placeholder-gray-600"
          />
        ) : (
          <button
            onClick={() => setCreatingNew(true)}
            title="새 워십 만들기"
            className="flex-shrink-0 w-7 h-7 rounded-md bg-[#1e2a1e] hover:bg-green-700
                       flex items-center justify-center text-green-400 hover:text-white
                       transition-colors text-base font-bold"
          >
            +
          </button>
        )}
      </div>

      {/* ── 영역 1: 프로그램 목록 (드래그로 높이 조절) ── */}
      <div
        ref={programListRef}
        className="overflow-y-auto px-2 py-1.5 border-b border-[#222222]"
        style={{ height: itemListHeight }}
      >
        <p className="text-[10px] text-gray-600 px-1 pb-1">프로그램 목록</p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={visibleItems.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-0.5">
              {visibleItems.map((item) => (
                <SortableItem
                  key={item.id}
                  item={item}
                  isActive={item.id === activeItemId}
                  isConfirmingDelete={confirmDelete === item.id}
                  setlistId={currentSetlist.id}
                  onSelect={() => handleSelectItem(item)}
                  onDelete={() => handleDeleteItem(item.id)}
                  onRename={(newTitle) =>
                    currentSetlistId && updateItem(currentSetlistId, item.id, { title: newTitle })
                  }
                  onShowReference={() => setReferenceItemId(item.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {visibleItems.length === 0 && (
          <p className="text-center text-gray-600 text-xs mt-4">
            프로그램을 추가하세요
          </p>
        )}
      </div>

      {/* ── 수평 드래그 핸들 ── */}
      <div
        className="flex-shrink-0 h-2 cursor-row-resize flex items-center justify-center
                   hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors group"
        onMouseDown={handleAreaResizeStart}
        title="드래그해서 높이 조절"
      >
        <div className="w-8 h-0.5 rounded-full bg-[#333] group-hover:bg-blue-400 transition-colors" />
      </div>

      {/* ── 영역 2: 섹션 목록 (16:9 고정 카드, 패널 너비에 따라 줄바꿈) ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3">

        {allSections.length > 0 ? (
          <>
            {/* 상단 인포 바: 번호입력(소형) + 현재 프로그램 제목 + 섹션 카운터 — sticky 고정 */}
            <div className="sticky top-0 z-10 bg-[#111111] pb-2 mb-1 flex items-center gap-2">
              {/* 번호 송출 — 섹션 번호 입력 후 Enter 로 해당 섹션 송출 */}
              <div
                className="flex flex-shrink-0 items-center gap-1 rounded border border-[#333] bg-[#0a0a0a] pl-1.5 focus-within:border-red-500"
                title="섹션 번호를 입력하고 Enter 를 누르면 그 섹션이 송출됩니다"
              >
                <span className="text-[9px] font-bold leading-none text-red-400">송출</span>
                <input
                  ref={numberInputRef}
                  type="number"
                  min={1}
                  max={allSections.length}
                  placeholder="번호"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={handleNumberInput}
                  style={{ width: 40 }}
                  className="border-0 bg-transparent px-0.5 py-1 text-center text-xs text-white placeholder-gray-600 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="pr-1.5 text-[10px] leading-none text-gray-500">↵</span>
              </div>
              {/* 현재 프로그램 제목 */}
              <span className="flex-1 min-w-0 text-xs text-gray-300 truncate font-medium">
                {currentItem?.title || '—'}
              </span>
              {/* 섹션 추가 버튼 */}
              {currentSetlistId && currentItem && !isLayerOutputWorkspaceItem(currentItem) && (
                <button
                  onClick={() => {
                    const sectionCount = currentItem.sections.length;
                    const newSection: Section = {
                      id: `sec-${Date.now()}`,
                      label: `절 ${sectionCount + 1}`,
                      text: '',
                      colorMark: '#ffffff',
                      elements: [],
                    };
                    addSection(currentSetlistId, currentItem.id, newSection);
                    setActiveSection(newSection.id);
                  }}
                  title="섹션 추가"
                  className="flex-shrink-0 w-5 h-5 rounded bg-[#1e2a3a] hover:bg-blue-600
                             flex items-center justify-center text-blue-400 hover:text-white
                             transition-colors text-xs font-bold leading-none"
                >
                  +
                </button>
              )}
              {/* 섹션 카운터: 활성번호 / 전체 */}
              <span className="flex-shrink-0 text-[11px] font-mono text-gray-500">
                <span className={currentIndex >= 0 ? 'text-blue-400 font-bold' : ''}>
                  {currentIndex >= 0 ? currentIndex + 1 : '–'}
                </span>
                <span className="text-gray-600"> / </span>
                <span>{allSections.length}</span>
              </span>
            </div>

            {/* 카드 그리드: 캔버스 축소판 미러링 [기능1] — 줄간(세로 행 간격) 1/3 축소, 가로 간격은 유지 */}
            <div className="flex flex-wrap gap-x-2 gap-y-[5.3px]">
              {allSections.map((s, i) => {
                const isFirstOfItem = i === 0 || allSections[i - 1].itemId !== s.itemId;
                return (
                  <SectionCard
                    key={`${s.itemId}-${s.section.id}`}
                    section={s.section}
                    itemTitle={s.itemTitle}
                    index={i}
                    itemIndex={s.itemIndex}
                    isActive={i === currentIndex}
                    isLive={
                      broadcastSection?.itemId === s.itemId &&
                      broadcastSection?.sectionId === s.section.id
                    }
                    isFirstOfItem={isFirstOfItem}
                    scrollRef={sectionCardRef(s.itemId, s.section.id, isFirstOfItem)}
                    onSelect={() => {
                      // 섹션 카드 직접 클릭 시 자동 스크롤 억제
                      // (다른 프로그램의 섹션을 클릭해도 첫 섹션으로 강제 스크롤하지 않음)
                      suppressNextScroll();
                      // 캔버스 요소 선택 해제 → 화살표 키가 섹션 탐색으로 전환
                      setSelectedElement(null);
                      setActiveItem(s.itemId);
                      setActiveSection(s.section.id);
                      // 어떤 프로그램·섹션이든 클릭 → 송출 번호칸에 그 전역 번호를 채우고
                      // 커서(포커스)를 넣어 전체 선택한다. → 바로 Enter 송출하거나 새 번호 타이핑(덮어쓰기).
                      const numEl = numberInputRef.current;
                      if (numEl) {
                        numEl.value = String(i + 1);
                        requestAnimationFrame(() => {
                          numEl.focus();
                          numEl.select();
                        });
                      }
                    }}
                    onDoubleClick={() => {
                      suppressNextBroadcastScroll();
                      sendToOutput(i);
                      // 더블클릭 송출 후에도 번호칸에 커서를 넣어(번호 채우고 전체선택) →
                      //   바로 다른 프로그램 섹션을 번호로 송출하거나 Delete 로 해제 가능.
                      const numEl = numberInputRef.current;
                      if (numEl) {
                        numEl.value = String(i + 1);
                        requestAnimationFrame(() => {
                          numEl.focus();
                          numEl.select();
                        });
                      }
                    }}
                    onToggleBookmark={() => {
                      if (currentSetlistId) {
                        updateSection(currentSetlistId, s.itemId, s.section.id, {
                          bookmarked: !s.section.bookmarked,
                        });
                      }
                    }}
                    onDuplicate={() => {
                      if (currentSetlistId) {
                        duplicateSection(currentSetlistId, s.itemId, s.section.id);
                      }
                    }}
                    onUpdateCueMacro={(cueMacro) => {
                      if (currentSetlistId) {
                        updateSection(currentSetlistId, s.itemId, s.section.id, { cueMacro });
                        frameCacheRef.current.delete(s.section.id);
                      }
                    }}
                    onDelete={() => {
                      if (currentSetlistId) {
                        removeSection(currentSetlistId, s.itemId, s.section.id);
                      }
                    }}
                  />
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-center text-gray-700 text-[10px] mt-6">
            프로그램을 추가하면 섹션이 표시됩니다
          </p>
        )}
      </div>

      {/* 하단: 저장 / 불러오기 / 새로저장 [기능4] */}
      <SetlistFileBar
        currentSetlist={currentSetlist}
        onImportClick={triggerImport}
        fileInputRef={fileInputRef}
        onFileChange={handleFileChange}
      />
    </div>
  );
}
