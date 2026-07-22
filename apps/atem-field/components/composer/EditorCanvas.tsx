'use client';

/**
 * EditorCanvas.tsx
 * WYSIWYG 에디터 캔버스 — 16:9 div 오버레이 방식
 *
 * - 요소(TextElement, ShapeElement …)를 % 좌표로 렌더링
 * - 선택·드래그·리사이즈·회전 → useCanvasEditor 훅
 * - BoundingBox 오버레이 → 선택된 요소 위에만 표시
 * - 우클릭 → ContextMenu (레이어 순서, 복사, 삭제)
 * - Ctrl/Cmd+C / V 로 요소 복사·붙여넣기
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { useCanvasEditor } from '@/hooks/useCanvasEditor';
import { undoManager } from '@/lib/undoManager';
// [FEATURE: EDITOR_COMMANDS] Undo/Redo/Cut/Copy/Paste/SelectAll/Delete 통합 훅
import { useEditorCommands } from '@/hooks/useEditorCommands';
// [/FEATURE: EDITOR_COMMANDS]
import {
  CanvasElement,
  TextElement,
  ShapeElement,
  ImageElement,
  VideoElement,
  resolveCornerRadii,
  createImageElement,
} from '@/lib/canvasTypes';
import { cutTopShapeToImage } from '@/features/shape-cut/shapeCut';
import BoundingBox   from '@/components/handles/BoundingBox';
import EraserOverlay from '@/components/composer/EraserOverlay';
import SelectionOverlay from '@/components/composer/SelectionOverlay';
import TextElementView  from '@/components/elements/TextElementView';
import ShapeElementView from '@/components/elements/ShapeElementView';
import ImageElementView from '@/components/elements/ImageElementView';
import VideoElementView from '@/components/elements/VideoElementView';
import TextClipMaskView from '@/components/composer/TextClipMaskView';
// [FEATURE: LAYER_ACTIONS] 레이어 순서 조작 로직을 별도 파일로 분리
import { reorderLayer } from '@/lib/layerActions';
import LayerContextModal from '@/components/editor/LayerContextModal';
import { extractYouTubeId, getEmbedUrl, getThumbnailUrl } from '@/lib/youtube';
// [/FEATURE: LAYER_ACTIONS]
// [FEATURE: GUIDE_LINES] 센터라인 + 안전영역 + 스냅
import EditorGuides from '@/components/composer/EditorGuides';
// [/FEATURE: GUIDE_LINES]
// [FEATURE: ELEMENT_ALIGN] 요소 간 정렬 가이드라인
import ElementAlignGuides from '@/components/composer/ElementAlignGuides';
import SpacingGuidesOverlay from '@/components/composer/SpacingGuidesOverlay';
// [/FEATURE: ELEMENT_ALIGN]
// [FEATURE: MOTION_SEQUENCE] 모션 미리보기 오버레이
import { MotionPreviewOverlay } from '@/features/motion-sequence';

interface EditorCanvasProps {
  background?: string;
  className?: string;
}

const CHECKERBOARD =
  'repeating-conic-gradient(#353535 0% 25%, #2a2a2a 0% 50%) 0 0 / 28px 28px';

interface CtxMenuState {
  x: number;
  y: number;
  elementId: string;
}

export default function EditorCanvas({ background, className }: EditorCanvasProps) {
  const {
    setlists,
    currentSetlistId,
    activeItemId,
    activeSectionId,
    youtubeStandby, // [FEATURE: YT_STANDBY]
    isEraserMode,
    isSelectionMode,
    updateElement,
    removeElement,
    reorderElements,
    addElement,
    setSelectedElement,
  } = useStore();

  // [FEATURE: YT_STANDBY] 현재 에디터 섹션이 스탠바이 상태인가?
  //   스탠바이가 가리키는 섹션 == 현재 active 섹션일 때만 true.
  //   true 일 때 모든 video(youtubeId 있는) 요소에 isStandby=true 전달.
  const isCurrentSectionStandby =
    !!youtubeStandby &&
    youtubeStandby.itemId === activeItemId &&
    youtubeStandby.sectionId === activeSectionId;

  const canvasRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);

  // 현재 섹션의 elements
  const setlist = setlists.find((sl) => sl.id === currentSetlistId);
  const item    = setlist?.items.find((it) => it.id === activeItemId);
  const section = item?.sections.find((sec) => sec.id === activeSectionId);
  const elements: CanvasElement[] = section?.elements ?? [];

  const {
    selectedId,
    selectedIds,
    isDragging,
    snapState,
    elementSnapGuides,
    spacingGuides,
    onCanvasPointerDown,
    onElementPointerDown,
  } = useCanvasEditor({
    setlistId: currentSetlistId ?? '',
    itemId:    activeItemId    ?? '',
    sectionId: activeSectionId ?? '',
    elements,
    canvasRef,
  });

  // [FEATURE: LAYER_ACTIONS] ─────────────────────────────
  // 인라인 헬퍼 대신 layerActions.ts 의 reorderLayer 사용
  function applyLayerAction(
    elementId: string,
    action: 'bringToFront' | 'bringForward' | 'sendBackward' | 'sendToBack',
  ) {
    undoManager.pushState(elements); // [UNDO]
    const updates = reorderLayer(elements, elementId, action);
    updates.forEach(({ id, zIndex }) => {
      updateElement(currentSetlistId!, activeItemId!, activeSectionId!, id, { zIndex });
    });
  }
  const bringToFront = (id: string) => applyLayerAction(id, 'bringToFront');
  const bringForward = (id: string) => applyLayerAction(id, 'bringForward');
  const sendBackward = (id: string) => applyLayerAction(id, 'sendBackward');
  const sendToBack   = (id: string) => applyLayerAction(id, 'sendToBack');
  // [/FEATURE: LAYER_ACTIONS]

  // [FEATURE: CLIP_MASK] ─────────────────────────────
  // 클리핑 마스크 생성/해제
  const createClipMask = useCallback(() => {
    if (selectedIds.length < 2) return;
    undoManager.pushState(elements);
    // 선택된 요소들 중 가장 낮은 zIndex = 마스크, 나머지 = 클리핑 대상
    const sorted = [...selectedIds]
      .map((id) => elements.find((el) => el.id === id)!)
      .filter(Boolean)
      .sort((a, b) => a.zIndex - b.zIndex);
    const maskEl = sorted[0];
    const clippedEls = sorted.slice(1);
    clippedEls.forEach((el) => {
      updateElement(currentSetlistId!, activeItemId!, activeSectionId!, el.id, { clipMaskId: maskEl.id });
    });
  }, [selectedIds, elements, currentSetlistId, activeItemId, activeSectionId, updateElement]);

  // [FEATURE: SHAPE_CUT] 아래 도형 형태로 위 도형을 잘라 "이미지 요소"로 굽는다.
  //   - 선택된 shape 중 가장 낮은 zIndex = 아래(칼), 가장 높은 zIndex = 위(잘릴 도형)
  //   - 아래 도형은 그대로 유지, 위 도형은 잘린 이미지로 교체
  const cutShapeToImage = useCallback(() => {
    const shapes = selectedIds
      .map((id) => elements.find((el) => el.id === id))
      .filter((el): el is ShapeElement => !!el && el.type === 'shape')
      .sort((a, b) => a.zIndex - b.zIndex);
    if (shapes.length < 2) return;

    const bottom = shapes[0];                 // 가장 낮은 zIndex = 칼
    const top = shapes[shapes.length - 1];    // 가장 높은 zIndex = 잘릴 도형
    const result = cutTopShapeToImage(top, bottom);
    if (!result) return;

    undoManager.pushState(elements);
    const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
    const cutImage = createImageElement({
      id: `cut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      src: result.src,
      x: result.x,
      y: result.y,
      width: result.width,
      height: result.height,
      zIndex: maxZ + 1,
      objectFit: 'fill',
    });
    // 위 도형 제거 → 잘린 이미지 추가 (아래 도형은 유지)
    removeElement(currentSetlistId!, activeItemId!, activeSectionId!, top.id);
    addElement(currentSetlistId!, activeItemId!, activeSectionId!, cutImage);
    setSelectedElement(cutImage.id);
  }, [selectedIds, elements, currentSetlistId, activeItemId, activeSectionId, removeElement, addElement, setSelectedElement]);

  // [FEATURE: SHAPE_YOUTUBE_CLIP] 선택된 도형(들) 안에 유튜브 영상을 넣는다.
  //   - 선택 중 shape 가 1개 이상이어야 함
  //   - 가장 낮은 zIndex 의 shape 가 "마스크" 가 됨 (기존 createClipMask 와 일관)
  //   - 그 shape 의 bounds 로 새 VideoElement 생성 → clipMaskId = shape.id
  //   - 미리보기는 썸네일 (autoplay=false, muted=true). 실제 재생은 송출 시점에
  //     기존 autoPlayVideos() 가 담당.
  const attachYouTubeToShape = useCallback(() => {
    if (!currentSetlistId || !activeItemId || !activeSectionId) return;
    const shapes = selectedIds
      .map((id) => elements.find((el) => el.id === id))
      .filter((el): el is ShapeElement => !!el && el.type === 'shape')
      .sort((a, b) => a.zIndex - b.zIndex);
    if (shapes.length === 0) return;

    const maskShape = shapes[0]; // 가장 낮은 zIndex

    // URL 입력 — MVP 단계에서 window.prompt (추후 전용 모달로 대체 가능)
    const raw = window.prompt('유튜브 링크를 붙여넣으세요', '');
    if (!raw) return;
    const id = extractYouTubeId(raw.trim());
    if (!id) {
      alert('올바른 유튜브 링크가 아닙니다. 예: https://youtu.be/xxxx');
      return;
    }

    undoManager.pushState(elements);

    const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
    const newVideo: VideoElement = {
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'video',
      src: getEmbedUrl(id, { autoplay: false, muted: true }),
      youtubeId: id,
      thumbnailUrl: getThumbnailUrl(id, 'hq'),
      loop: false,
      muted: true,
      autoplay: false,
      // 마스크 도형 위치와 크기에 정확히 맞춤 (덮어서 클리핑)
      x: maskShape.x,
      y: maskShape.y,
      width: maskShape.width,
      height: maskShape.height,
      rotation: maskShape.rotation ?? 0,
      opacity: 1,
      zIndex: maxZ + 1,          // 마스크보다 위 (클리핑 대상이 되려면 높은 쪽)
      locked: false,
      visible: true,
      clipMaskId: maskShape.id,  // 즉시 클리핑 상태로 추가
    };

    addElement(currentSetlistId, activeItemId, activeSectionId, newVideo);
  }, [selectedIds, elements, currentSetlistId, activeItemId, activeSectionId, addElement]);

  const releaseClipMask = useCallback((elementId: string) => {
    undoManager.pushState(elements);
    const el = elements.find((e) => e.id === elementId);
    if (el?.clipMaskId) {
      // 이 요소의 클리핑 마스크 해제
      updateElement(currentSetlistId!, activeItemId!, activeSectionId!, elementId, { clipMaskId: undefined });
    } else {
      // 이 요소가 마스크 역할 → 이 마스크를 참조하는 모든 요소 해제
      elements.filter((e) => e.clipMaskId === elementId).forEach((e) => {
        updateElement(currentSetlistId!, activeItemId!, activeSectionId!, e.id, { clipMaskId: undefined });
      });
    }
  }, [elements, currentSetlistId, activeItemId, activeSectionId, updateElement]);

  // 클리핑 관계 맵 구축: maskId → clipped elements
  const clipMaskMap = useMemo(() => {
    const map = new Map<string, CanvasElement[]>();
    elements.forEach((el) => {
      if (el.clipMaskId) {
        const arr = map.get(el.clipMaskId) || [];
        arr.push(el);
        map.set(el.clipMaskId, arr);
      }
    });
    return map;
  }, [elements]);

  // 클리핑된 요소 ID 세트 (일반 렌더링에서 제외)
  const clippedIds = useMemo(() => {
    const set = new Set<string>();
    elements.forEach((el) => { if (el.clipMaskId) set.add(el.id); });
    return set;
  }, [elements]);
  // [/FEATURE: CLIP_MASK]

  // [FEATURE: EDITOR_COMMANDS] ─────────────────────────────
  // Undo/Redo/Cut/Copy/Paste/SelectAll/Delete 를 통합 훅으로 처리
  const {
    handleKeyDown,
    hasClipboard,
    commands,
  } = useEditorCommands({
    setlistId:  currentSetlistId ?? '',
    itemId:     activeItemId    ?? '',
    sectionId:  activeSectionId ?? '',
    elements,
    selectedId,
    selectedIds,
  });
  // [/FEATURE: EDITOR_COMMANDS]

  // ── 우클릭 메뉴 ─────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent, elementId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, elementId });
  }, []);

  // buildContextMenuItems 는 LayerContextModal 로 이전됨 — [FEATURE: LAYER_ACTIONS]

  // ── 요소별 렌더 ─────────────────────────
  /** 단일 요소를 React 노드로 렌더 (클리핑과 분리) */
  function renderSingleElement(el: CanvasElement, isSelected: boolean) {
    switch (el.type) {
      case 'text':
        return (
          <TextElementView
            element={el as TextElement}
            sectionText={section?.text}
            isSelected={isSelected}
            onPointerDown={(handleId) => onElementPointerDown(el.id, handleId)}
            onContentChange={(content) =>
              updateElement(currentSetlistId!, activeItemId!, activeSectionId!, el.id, { content })
            }
            onWidthChange={(newWidth) =>
              updateElement(currentSetlistId!, activeItemId!, activeSectionId!, el.id, { width: newWidth })
            }
            onHeightChange={(newHeight) =>
              updateElement(currentSetlistId!, activeItemId!, activeSectionId!, el.id, { height: newHeight })
            }
          />
        );
      case 'shape':
        return (
          <ShapeElementView
            element={el as ShapeElement}
            isSelected={isSelected}
            onPointerDown={(handleId) => onElementPointerDown(el.id, handleId)}
          />
        );
      case 'image':
        return (
          <ImageElementView
            element={el as ImageElement}
            isSelected={isSelected}
            onPointerDown={(handleId) => onElementPointerDown(el.id, handleId)}
          />
        );
      case 'video': {
        const vel = el as VideoElement;
        const isVideoStandby = isCurrentSectionStandby && !!vel.youtubeId;
        return (
          <VideoElementView
            element={vel}
            isSelected={isSelected}
            isStandby={isVideoStandby}
            onPointerDown={(handleId) => onElementPointerDown(el.id, handleId)}
          />
        );
      }
      default:
        return null;
    }
  }

  /**
   * 마스크 요소의 클리핑 형태에 맞는 CSS 계산
   *
   * - shape(rect/roundRect): border-radius 로 자름
   * - shape(ellipse): clip-path ellipse() 로 자름
   * - image: CSS `mask-image` 로 이미지의 **알파 채널**을 마스크로 사용
   *          → 별/하트/구름 같은 투명 PNG 가 프로덕션(lib/canvasRenderer)과
   *             동일하게 에디터에서도 해당 모양으로 잘려 보임 (WYSIWYG).
   *          border-radius 도 함께 있으면 둘 다 적용 (라이브 렌더와 일치).
   *
   * ※ CSS type 시스템상 maskImage/WebkitMaskImage 같은 속성이 React.CSSProperties
   *    타입에 완전히 포함되지 않을 수 있어 Record 로 확장한다.
   */
  function getMaskClipStyle(maskEl: CanvasElement): React.CSSProperties {
    if (maskEl.type === 'shape') {
      const shape = maskEl as ShapeElement;
      if (shape.shapeType === 'ellipse') {
        return { clipPath: 'ellipse(50% 50% at 50% 50%)' };
      }
      // rect / roundRect: border-radius
      const radii = resolveCornerRadii(shape);
      const hasRadius = radii.some((r) => r > 0);
      if (hasRadius) {
        return { borderRadius: `${radii[0]}px ${radii[1]}px ${radii[2]}px ${radii[3]}px` };
      }
      return {};
    }

    if (maskEl.type === 'image') {
      const img = maskEl as ImageElement;
      const radii = resolveCornerRadii(img);
      const hasRadius = radii.some((r) => r > 0);

      // 이미지의 알파 채널을 마스크로 사용 (lib/canvasRenderer.ts L815-831 과 일치)
      //   - maskSize 100% 100%: 마스크 컨테이너 전체에 스트레치 (drawImage(..., mw, mh) 와 일치)
      //   - maskRepeat no-repeat
      //   - maskMode alpha: 알파 채널을 마스크로 (기본값이지만 명시)
      //   - 크로스브라우저: -webkit- prefix 병기
      const maskStyle: React.CSSProperties & Record<string, string> = {
        maskImage:        `url("${img.src}")`,
        WebkitMaskImage:  `url("${img.src}")`,
        maskSize:         '100% 100%',
        WebkitMaskSize:   '100% 100%',
        maskRepeat:       'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition:     'center',
        WebkitMaskPosition: 'center',
      };
      if (hasRadius) {
        maskStyle.borderRadius = `${radii[0]}px ${radii[1]}px ${radii[2]}px ${radii[3]}px`;
      }
      return maskStyle;
    }

    return {};
  }

  function renderElement(el: CanvasElement) {
    // 클리핑된 요소는 마스크 요소 렌더 시 함께 처리 — 일반 렌더링에서 스킵
    if (clippedIds.has(el.id)) return null;

    const isSelected = selectedIds.includes(el.id);
    const clippedEls = clipMaskMap.get(el.id);

    // 우클릭 컨텍스트 메뉴를 감싸되, 요소와 동일한 위치/크기/zIndex 적용
    // video(iframe) 요소는 display:contents가 z-index를 깨뜨리므로 positioned wrapper 사용
    const wrapContextMenu = (node: React.ReactNode) => {
      if (el.type === 'video') {
        // iframe 요소: positioned wrapper로 z-index 보장
        return (
          <div
            key={el.id}
            onContextMenu={(e) => handleContextMenu(e, el.id)}
            style={{
              position: 'absolute',
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.width}%`,
              height: `${el.height}%`,
              zIndex: el.zIndex,
              pointerEvents: 'auto',
            }}
          >
            {node}
          </div>
        );
      }
      return (
        <div
          key={el.id}
          onContextMenu={(e) => handleContextMenu(e, el.id)}
          style={{ display: 'contents' }}
        >
          {node}
        </div>
      );
    };

    // [FEATURE: CLIP_MASK] 이 요소가 마스크 역할 → 클리핑된 요소들을 마스크 형태로 잘라서 렌더
    if (clippedEls && clippedEls.length > 0) {
      // 텍스트 마스크: 캔버스 기반 destination-in 합성 (글자 글리프 정확 클리핑)
      if (el.type === 'text') {
        const textEl = el as TextElement;
        const displayText = textEl.linked && !textEl.content ? (section?.text ?? '') : textEl.content;
        return (
          <div
            key={`mask-group-${el.id}`}
            onContextMenu={(e) => handleContextMenu(e, el.id)}
            style={{ display: 'contents' }}
          >
            {clippedEls.sort((a, b) => a.zIndex - b.zIndex).map((clipped) => {
              const clippedSelected = selectedIds.includes(clipped.id);
              return (
                <TextClipMaskView
                  key={clipped.id}
                  maskEl={textEl}
                  clippedEl={clipped}
                  displayText={displayText}
                  isSelected={clippedSelected}
                  onContextMenu={(e) => handleContextMenu(e, clipped.id)}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onElementPointerDown(clipped.id, 'move')(e as unknown as React.PointerEvent<HTMLDivElement>);
                  }}
                />
              );
            })}
            {/* 마스크 텍스트 선택 표시 */}
            {isSelected && (
              <div
                style={{
                  position: 'absolute',
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.width}%`,
                  height: `${el.height}%`,
                  border: '1px dashed rgba(59,130,246,0.5)',
                  pointerEvents: 'none',
                  zIndex: el.zIndex + 10,
                }}
              />
            )}
          </div>
        );
      }

      // 도형/이미지 마스크: overflow:hidden + clip-path 방식
      const clipStyle = getMaskClipStyle(el);
      return (
        <div
          key={`mask-group-${el.id}`}
          onContextMenu={(e) => handleContextMenu(e, el.id)}
          style={{ display: 'contents' }}
        >
          {/*
            [FEATURE: CLIP_MASK] Phase 2 — 마스크 요소 시각 숨김
            프로덕션(lib/canvasRenderer) 은 마스크 자체를 그리지 않고 모양만 사용함.
            여기서도 마스크의 fill/stroke/이미지를 숨기고, 선택·드래그·우클릭이
            가능한 투명 hit target 만 남김.
              - 선택됐을 때만 점선 테두리로 마스크 영역 표시
              - pointerEvents: auto 지만 zIndex 는 el.zIndex (클리핑 컨테이너보다 아래)
                → 클리핑된 요소가 있는 영역은 위의 컨테이너가 받고, 빈 영역은 여기로 옴
          */}
          <div
            key={`mask-ghost-${el.id}`}
            style={{
              position: 'absolute',
              left:   `${el.x}%`,
              top:    `${el.y}%`,
              width:  `${el.width}%`,
              height: `${el.height}%`,
              transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
              transformOrigin: 'center center',
              zIndex: el.zIndex,
              pointerEvents: 'auto',
              border: isSelected
                ? '1.5px dashed rgba(59,130,246,0.8)'
                : undefined,
              // 마스크 안 모양을 희미하게라도 인지하게 하려면 아래 주석 해제:
              // background: isSelected ? 'rgba(59,130,246,0.04)' : undefined,
              cursor: 'move',
            }}
            onPointerDown={onElementPointerDown(el.id, 'move')}
            onContextMenu={(e) => handleContextMenu(e, el.id)}
          />
          {/* 클리핑된 요소들: 마스크 영역으로 잘림 */}
          <div
            style={{
              position: 'absolute',
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.width}%`,
              height: `${el.height}%`,
              transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
              transformOrigin: 'center center',
              overflow: 'hidden',
              pointerEvents: 'none',
              zIndex: el.zIndex + 1,
              ...clipStyle,
            }}
          >
            {clippedEls
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((clipped) => {
                const clippedSelected = selectedIds.includes(clipped.id);
                const relX = ((clipped.x - el.x) / el.width) * 100;
                const relY = ((clipped.y - el.y) / el.height) * 100;
                const relW = (clipped.width / el.width) * 100;
                const relH = (clipped.height / el.height) * 100;
                return (
                  <div
                    key={clipped.id}
                    onContextMenu={(e) => handleContextMenu(e, clipped.id)}
                    style={{
                      position: 'absolute',
                      left: `${relX}%`,
                      top: `${relY}%`,
                      width: `${relW}%`,
                      height: `${relH}%`,
                      transform: clipped.rotation ? `rotate(${clipped.rotation}deg)` : undefined,
                      transformOrigin: 'center center',
                      opacity: clipped.opacity,
                      pointerEvents: 'all',
                      zIndex: clipped.zIndex,
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onElementPointerDown(clipped.id, 'move')(e as unknown as React.PointerEvent<HTMLDivElement>);
                    }}
                  >
                    {clipped.type === 'image' && (
                      <img
                        src={(clipped as ImageElement).src}
                        alt=""
                        draggable={false}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: (clipped as ImageElement).objectFit || 'fill',
                          display: 'block',
                          pointerEvents: 'none',
                          userSelect: 'none',
                        }}
                      />
                    )}
                    {clipped.type === 'shape' && (
                      <div style={{ width: '100%', height: '100%', background: (clipped as ShapeElement).fill, opacity: (clipped as ShapeElement).fillOpacity }} />
                    )}
                    {clipped.type === 'text' && (
                      <div style={{ width: '100%', height: '100%', color: (clipped as TextElement).color, fontSize: `${(clipped as TextElement).fontSize}px`, fontFamily: (clipped as TextElement).fontFamily }}>
                        {(clipped as TextElement).content || section?.text}
                      </div>
                    )}
                    {/* [FEATURE: SHAPE_YOUTUBE_CLIP] 유튜브 영상 클리핑 렌더 */}
                    {clipped.type === 'video' && (() => {
                      const vel = clipped as VideoElement;
                      const isVideoStandby = isCurrentSectionStandby && !!vel.youtubeId;
                      return (
                        <VideoElementView
                          element={vel}
                          isSelected={false /* 선택 테두리는 상위에서 dashed 로 표시 */}
                          isStandby={isVideoStandby}
                          onPointerDown={() => () => {} /* 드래그는 상위 컨테이너가 처리 */}
                        />
                      );
                    })()}
                    {clippedSelected && (
                      <div style={{ position: 'absolute', inset: 0, border: '1.5px dashed rgba(59,130,246,0.6)', pointerEvents: 'none' }} />
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      );
    }
    // [/FEATURE: CLIP_MASK]

    return wrapContextMenu(renderSingleElement(el, isSelected));
  }

  return (
    <>
      <div
        ref={canvasRef}
        className={className}
        tabIndex={0}
        data-editor-canvas
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          background: background ?? CHECKERBOARD,
          overflow: 'hidden',
          userSelect: 'none',
          outline: 'none',
          isolation: 'isolate', // iframe 스태킹 컨텍스트 격리
        }}
        onPointerDown={onCanvasPointerDown}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* 요소 레이어 — zIndex 순 */}
        {[...elements]
          .sort((a, b) => a.zIndex - b.zIndex)
          .map(renderElement)}

        {/* [FEATURE: GUIDE_LINES] 가이드라인 오버레이 */}
        <EditorGuides
          snapState={isDragging && snapState ? {
            snappedCenterX: snapState.snappedCenterX,
            snappedCenterY: snapState.snappedCenterY,
            snappedLeft: snapState.snappedLeft,
            snappedRight: snapState.snappedRight,
            snappedTop: snapState.snappedTop,
            snappedBottom: snapState.snappedBottom,
          } : undefined}
        />
        {/* [/FEATURE: GUIDE_LINES] */}

        {/* [FEATURE: ELEMENT_ALIGN] 요소 간 정렬 가이드라인 */}
        {isDragging && elementSnapGuides.length > 0 && (
          <ElementAlignGuides guides={elementSnapGuides} />
        )}
        {/* 요소 간 간격 가이드 (피그마 스타일) */}
        {isDragging && spacingGuides.length > 0 && (
          <SpacingGuidesOverlay guides={spacingGuides} />
        )}
        {/* [/FEATURE: ELEMENT_ALIGN] */}

        {/* 지우개 모드: 선택된 요소에 지우개 오버레이 */}
        {isEraserMode && selectedIds.length === 1 && (() => {
          const el = elements.find((e) => e.id === selectedIds[0]);
          if (!el || el.locked) return null;
          return <EraserOverlay key={`eraser-${el.id}`} element={el} allElements={elements} />;
        })()}

        {/* 선택 도구 모드: 이미지 요소(또는 도형+imageFill)에만 사각 선택 오버레이 */}
        {isSelectionMode && selectedIds.length === 1 && (() => {
          const el = elements.find((e) => e.id === selectedIds[0]);
          if (!el || el.locked) return null;
          // 이미지 또는 imageFill이 있는 도형만 선택 크롭 지원
          const isImage = el.type === 'image';
          const hasImageFill = el.type === 'shape' && !!(el as any).imageFill?.src;
          if (!isImage && !hasImageFill) return null;
          return <SelectionOverlay key={`selection-${el.id}`} element={el} allElements={elements} />;
        })()}

        {/* 선택된 요소의 BoundingBox (복수 선택 지원) — 지우개/선택 도구 모드에서는 숨김 */}
        {!isEraserMode && !isSelectionMode && selectedIds.map((sid) => {
          const el = elements.find((e) => e.id === sid);
          if (!el || el.locked) return null;
          return (
            <BoundingBox
              key={sid}
              x={el.x}
              y={el.y}
              width={el.width}
              height={el.height}
              rotation={el.rotation}
              onHandlePointerDown={(handleId) => onElementPointerDown(el.id, handleId)}
              onContextMenu={(e) => handleContextMenu(e, el.id)}
            />
          );
        })}

        {/* 요소 없을 때 안내 */}
        {elements.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-[11px] text-gray-700 leading-relaxed">
                하단 요소 패널에서<br/>텍스트 · 도형을 추가하세요
              </p>
            </div>
          </div>
        )}

        {/* [FEATURE: MOTION_SEQUENCE] 모션 미리보기 오버레이 — 재생 중에만 표시 */}
        <MotionPreviewOverlay />
      </div>

      {/* 우클릭 레이어 모달 — [FEATURE: LAYER_ACTIONS] */}
      {ctxMenu && (() => {
        const ctxEl = elements.find((e) => e.id === ctxMenu.elementId) ?? null;
        return (
          <LayerContextModal
            x={ctxMenu.x}
            y={ctxMenu.y}
            element={ctxEl}
            elements={elements}
            selectedIds={selectedIds}
            onClose={() => setCtxMenu(null)}
            onBringToFront={() => bringToFront(ctxMenu.elementId)}
            onBringForward={() => bringForward(ctxMenu.elementId)}
            onSendBackward={() => sendBackward(ctxMenu.elementId)}
            onSendToBack={() => sendToBack(ctxMenu.elementId)}
            onCreateClipMask={createClipMask}
            onReleaseClipMask={() => releaseClipMask(ctxMenu.elementId)}
            onCutShapeToImage={cutShapeToImage}
            onAttachYouTube={attachYouTubeToShape}
            onSelectMask={() => {
              const target = elements.find((e) => e.id === ctxMenu.elementId);
              if (target?.clipMaskId) setSelectedElement(target.clipMaskId);
            }}
            onCopy={() => commands.copy(ctxMenu.elementId)}
            onPaste={() => commands.paste()}
            onToggleLock={() => {
              undoManager.pushState(elements);
              updateElement(currentSetlistId!, activeItemId!, activeSectionId!,
                ctxMenu.elementId, { locked: !ctxEl?.locked });
            }}
            onToggleVisible={() => {
              undoManager.pushState(elements);
              updateElement(currentSetlistId!, activeItemId!, activeSectionId!,
                ctxMenu.elementId, { visible: !ctxEl?.visible });
            }}
            onDelete={() =>
              removeElement(currentSetlistId!, activeItemId!, activeSectionId!, ctxMenu.elementId)
            }
            hasClipboard={hasClipboard}
          />
        );
      })()}
      {/* [/FEATURE: LAYER_ACTIONS] */}
    </>
  );
}
