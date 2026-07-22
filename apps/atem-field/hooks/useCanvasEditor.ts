'use client';

/**
 * useCanvasEditor.ts
 * 캔버스 에디터 인터랙션 상태 관리 훅
 *
 * 책임:
 *  - 선택(select) / 드래그(drag) / 리사이즈(resize) / 회전(rotate) 상태
 *  - 마우스 이벤트 → % 좌표 변환
 *  - store 의 updateElement 를 통한 실시간 반영
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { CanvasElement } from '@/lib/canvasTypes';
import { useStore } from '@/lib/store';
import { snapToGuides, type SnapResult } from '@/lib/canvasGuides';
import { snapToElements, type ElementSnapResult, type AlignGuideLine, type SpacingGuide } from '@/lib/elementSnap';
import { undoManager } from '@/lib/undoManager';

// ─────────────────────────────────────────
// 드래그 핸들 종류
// ─────────────────────────────────────────
export type HandleId =
  | 'nw' | 'n' | 'ne'
  | 'w'  |        'e'
  | 'sw' | 's' | 'se'
  | 'rotate'
  | 'move';

// ─────────────────────────────────────────
// 내부 drag 세션 타입
// ─────────────────────────────────────────
interface DragSession {
  handleId: HandleId;
  startX: number;      // clientX at mousedown
  startY: number;      // clientY at mousedown
  startEl: CanvasElement;
  canvasW: number;     // px
  canvasH: number;     // px
  /** 멀티 드래그 시 선택된 다른 요소들의 시작 위치 (주 요소 제외) */
  multiStarts: { id: string; x: number; y: number; width: number; height: number }[];
}

// ─────────────────────────────────────────
// 훅 파라미터
// ─────────────────────────────────────────
export interface UseCanvasEditorOptions {
  setlistId: string;
  itemId: string;
  sectionId: string;
  elements: CanvasElement[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

// ─────────────────────────────────────────
// 훅 반환 타입
// ─────────────────────────────────────────
export interface UseCanvasEditorReturn {
  /** 현재 선택된 요소 id (단일 — 하위호환) */
  selectedId: string | null;
  /** 현재 선택된 요소 id 배열 (멀티셀렉트) */
  selectedIds: string[];
  /** 드래그 중 여부 */
  isDragging: boolean;
  /** 현재 스냅 상태 (드래그 중에만 유효) */
  snapState: SnapResult | null;
  /** 요소 간 정렬 가이드라인 (드래그 중에만 유효) */
  elementSnapGuides: AlignGuideLine[];
  /** 요소 간 간격 가이드 (드래그 중에만 유효) */
  spacingGuides: SpacingGuide[];
  /** 캔버스 클릭 핸들러 (선택 해제) */
  onCanvasPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** 요소 포인터다운 핸들러 팩토리 */
  onElementPointerDown: (
    elementId: string,
    handleId: HandleId
  ) => (e: React.PointerEvent<HTMLDivElement>) => void;
}

// ─────────────────────────────────────────
// 메인 훅
// ─────────────────────────────────────────
export function useCanvasEditor({
  setlistId,
  itemId,
  sectionId,
  elements,
  canvasRef,
}: UseCanvasEditorOptions): UseCanvasEditorReturn {
  const { selectedElementId, selectedElementIds, setSelectedElement, toggleSelectedElement, updateElement } = useStore();
  const selectedId = selectedElementId;
  const selectedIds = selectedElementIds;

  const [isDragging, setIsDragging] = useState(false);
  const [snapState, setSnapState] = useState<SnapResult | null>(null);
  const [elementSnapGuides, setElementSnapGuides] = useState<AlignGuideLine[]>([]);
  const [spacingGuides, setSpacingGuides] = useState<SpacingGuide[]>([]);
  const dragSession  = useRef<DragSession | null>(null);
  const onPointerUpRef = useRef<(() => void) | null>(null);

  // elements 를 ref 로 유지 — onPointerMove 콜백이 항상 최신 요소를 참조
  const elementsRef = useRef(elements);
  useEffect(() => { elementsRef.current = elements; }, [elements]);

  // ── 포인터 무브 ──────────────────────────
  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const session = dragSession.current;
      if (!session) return;

      const dx = e.clientX - session.startX;  // px
      const dy = e.clientY - session.startY;

      const { canvasW, canvasH, startEl, handleId } = session;

      // px → % 변환 헬퍼
      const pctX = (px: number) => (px / canvasW) * 100;
      const pctY = (px: number) => (px / canvasH) * 100;

      let updates: Partial<CanvasElement> = {};

      if (handleId === 'move') {
        // 경계 제한 없음: ProPresenter/OBS/Figma처럼 캔버스 밖으로 자유 이동 허용
        const rawX = startEl.x + pctX(dx);
        const rawY = startEl.y + pctY(dy);

        // 멀티 드래그 시 선택된 요소들을 스냅 대상에서 제외
        const multiIds = new Set(session.multiStarts.map((m) => m.id));
        const snapTargets = elementsRef.current.filter(
          (el) => el.id !== startEl.id && !multiIds.has(el.id),
        );

        // 1) 요소 간 스냅 — RAW 좌표 기준 (최우선, 피그마 동작)
        const elSnap = snapToElements(
          rawX, rawY, startEl.width, startEl.height,
          startEl.id, snapTargets,
        );
        const elSnappedX = elSnap.x !== rawX;
        const elSnappedY = elSnap.y !== rawY;

        // 2) 캔버스 가이드 스냅 — 요소 스냅이 없는 축에만 적용
        const canvasSnap = snapToGuides(rawX, rawY, startEl.width, startEl.height);
        const mergedSnap: typeof canvasSnap = {
          ...canvasSnap,
          x: elSnappedX ? elSnap.x : canvasSnap.x,
          y: elSnappedY ? elSnap.y : canvasSnap.y,
          snappedCenterX: elSnappedX ? false : canvasSnap.snappedCenterX,
          snappedLeft:    elSnappedX ? false : canvasSnap.snappedLeft,
          snappedRight:   elSnappedX ? false : canvasSnap.snappedRight,
          snappedCenterY: elSnappedY ? false : canvasSnap.snappedCenterY,
          snappedTop:     elSnappedY ? false : canvasSnap.snappedTop,
          snappedBottom:  elSnappedY ? false : canvasSnap.snappedBottom,
        };
        setSnapState(mergedSnap);
        setElementSnapGuides(elSnap.guides);
        setSpacingGuides(elSnap.spacingGuides);

        const finalX = mergedSnap.x;
        const finalY = mergedSnap.y;
        updates = { x: finalX, y: finalY };

        // ── 멀티 드래그: 같은 delta를 다른 선택 요소에도 적용 ──
        if (session.multiStarts.length > 0) {
          const deltaX = finalX - startEl.x;
          const deltaY = finalY - startEl.y;
          for (const ms of session.multiStarts) {
            const mx = ms.x + deltaX;
            const my = ms.y + deltaY;
            updateElement(setlistId, itemId, sectionId, ms.id, { x: mx, y: my });
          }
        }
      } else if (handleId === 'rotate') {
        // 회전: 요소 중심 기준 각도 계산
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cx = rect.left + (startEl.x + startEl.width  / 2) * canvasW / 100;
        const cy = rect.top  + (startEl.y + startEl.height / 2) * canvasH / 100;
        const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI) + 90;
        updates = { rotation: Math.round(angle) };
      } else {
        // 리사이즈 8방향
        let { x, y, width, height } = startEl;
        const MIN = 5; // 최소 % 크기

        if (handleId.includes('e')) {
          width  = Math.max(MIN, startEl.width  + pctX(dx));
        }
        if (handleId.includes('s')) {
          height = Math.max(MIN, startEl.height + pctY(dy));
        }
        if (handleId.includes('w')) {
          const newWidth = Math.max(MIN, startEl.width  - pctX(dx));
          x = startEl.x + (startEl.width - newWidth);
          width = newWidth;
        }
        if (handleId.includes('n')) {
          const newHeight = Math.max(MIN, startEl.height - pctY(dy));
          y = startEl.y + (startEl.height - newHeight);
          height = newHeight;
        }
        updates = { x, y, width, height };

        // 텍스트 요소: 수동 리사이즈 시 해당 축 auto 해제 (피그마 동작)
        if (startEl.type === 'text') {
          const touchesWidth = handleId.includes('e') || handleId.includes('w');
          const touchesHeight = handleId.includes('n') || handleId.includes('s');
          if (touchesWidth) (updates as Record<string, unknown>).autoWidth = false;
          if (touchesHeight) (updates as Record<string, unknown>).autoHeight = false;
        }
      }

      updateElement(setlistId, itemId, sectionId, startEl.id, updates);
    },
    [setlistId, itemId, sectionId, updateElement, canvasRef]
  );

  // ── 포인터 업 ──────────────────────────
  const onPointerUp = useCallback(() => {
    if (!dragSession.current) return;
    dragSession.current = null;
    setIsDragging(false);
    setSnapState(null);
    setElementSnapGuides([]);
    setSpacingGuides([]);
    undoManager.endBatch(); // [UNDO] 연속 조작 종료
    window.removeEventListener('pointermove', onPointerMove);
    if (onPointerUpRef.current) {
      window.removeEventListener('pointerup', onPointerUpRef.current);
    }
  }, [onPointerMove]);

  // ── 히트테스트: 클릭 지점에서 현재 요소보다 앞에 있는(zIndex 높은) 요소 찾기 ──
  // 뒤에 있는(zIndex 낮은) 요소는 절대 반환하지 않음
  const hitTestFrontElement = useCallback(
    (clientX: number, clientY: number, currentEl: CanvasElement): string | null => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;

      const pctX = ((clientX - rect.left) / rect.width) * 100;
      const pctY = ((clientY - rect.top)  / rect.height) * 100;

      // 현재 요소보다 zIndex가 높고, 클릭 위치에 겹치는 요소만 필터
      const hits = elementsRef.current.filter((el) => {
        if (el.id === currentEl.id || el.locked || !el.visible) return false;
        if (el.zIndex <= currentEl.zIndex) return false; // ← 핵심: 뒤 레이어 제외
        return (
          pctX >= el.x && pctX <= el.x + el.width &&
          pctY >= el.y && pctY <= el.y + el.height
        );
      });

      if (hits.length === 0) return null;

      // 가장 높은 zIndex 요소 반환 (최전면)
      hits.sort((a, b) => b.zIndex - a.zIndex);
      return hits[0].id;
    },
    [canvasRef],
  );

  // ── 요소 포인터다운 팩토리 ──────────────
  const onElementPointerDown = useCallback(
    (elementId: string, handleId: HandleId) =>
      (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();

        // ── Shift+클릭: 멀티셀렉트 토글 ──
        if (e.shiftKey && handleId === 'move') {
          // BoundingBox 위에서 Shift+클릭 시, 클릭 지점의 최상위 요소를 토글
          // (BoundingBox가 아래 요소를 가리므로 히트테스트로 실제 대상 찾기)
          const currentEl = elements.find((el) => el.id === elementId);
          if (currentEl) {
            const frontHit = hitTestFrontElement(e.clientX, e.clientY, currentEl);
            toggleSelectedElement(frontHit ?? elementId);
          } else {
            toggleSelectedElement(elementId);
          }
          return;
        }

        // ── 단일 선택 상태에서 이동 핸들 클릭:
        //    클릭 지점에 현재 요소보다 앞에 있는(zIndex 높은) 요소가 있으면 그 요소 선택
        //    뒤에 있는 요소는 무시 → 그냥 현재 요소 드래그
        //    ★ 멀티셀렉 상태(2개 이상 선택)에서는 실행하지 않음 — 멀티 드래그 보장
        if (handleId === 'move' && selectedIds.length === 1 && selectedIds.includes(elementId)) {
          const currentEl = elements.find((el) => el.id === elementId);
          if (currentEl) {
            const frontHit = hitTestFrontElement(e.clientX, e.clientY, currentEl);
            if (frontHit) {
              setSelectedElement(frontHit);
              // 앞 요소로 드래그 세션 시작
              const rect = canvasRef.current?.getBoundingClientRect();
              const el = elements.find((el) => el.id === frontHit);
              if (rect && el) {
                undoManager.beginBatch(elements);
                dragSession.current = {
                  handleId: 'move',
                  startX: e.clientX,
                  startY: e.clientY,
                  startEl: { ...el },
                  canvasW: rect.width,
                  canvasH: rect.height,
                  multiStarts: [],
                };
                setIsDragging(true);
                onPointerUpRef.current = onPointerUp;
                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp);
              }
              return;
            }
          }
        }

        // 일반 클릭으로 미선택 요소 클릭 → 단일 선택으로 교체
        if (!selectedIds.includes(elementId)) {
          setSelectedElement(elementId);
        }

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const el = elements.find((el) => el.id === elementId);
        if (!el) return;

        // [UNDO] 드래그/리사이즈/회전 시작 시 스냅샷 (전체 조작 = 1 undo 단계)
        undoManager.beginBatch(elements);

        // 멀티 드래그: 주 요소 외 선택된 요소들의 시작 위치 저장
        const isMultiMove = handleId === 'move' && selectedIds.includes(elementId) && selectedIds.length > 1;
        const multiStarts = isMultiMove
          ? elements
              .filter((other) => selectedIds.includes(other.id) && other.id !== elementId)
              .map((other) => ({ id: other.id, x: other.x, y: other.y, width: other.width, height: other.height }))
          : [];

        dragSession.current = {
          handleId,
          startX: e.clientX,
          startY: e.clientY,
          startEl: { ...el },
          canvasW: rect.width,
          canvasH: rect.height,
          multiStarts,
        };
        setIsDragging(true);
        onPointerUpRef.current = onPointerUp;

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      },
    [elements, canvasRef, selectedIds, setSelectedElement, toggleSelectedElement, onPointerMove, onPointerUp, hitTestFrontElement]
  );

  // ── 캔버스 배경 클릭 (선택 해제) ────────
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        setSelectedElement(null);
      }
    },
    [setSelectedElement]
  );

  return {
    selectedId,
    selectedIds,
    isDragging,
    snapState,
    elementSnapGuides,
    spacingGuides,
    onCanvasPointerDown,
    onElementPointerDown,
  };
}
