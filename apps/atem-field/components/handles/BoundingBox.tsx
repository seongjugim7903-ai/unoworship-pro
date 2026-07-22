'use client';

/**
 * BoundingBox.tsx
 * 선택된 캔버스 요소 위에 오버레이되는 8핸들 + 회전 핸들
 *
 * - 위치는 부모(EditorCanvas)의 position:relative 기준 % 절대위치
 * - 핸들 크기는 캔버스 실제 너비에 비례하여 자동 스케일
 *   (ResizeObserver로 부모 캔버스 너비 감지 → EditorCanvas.tsx 수정 불필요)
 *
 * [FIX: DOUBLE_CLICK_EDIT]
 *   이동 핸들이 TextElementView 위를 덮어서 더블클릭 이벤트를 가로채는 문제 수정.
 *   이동 핸들에서 dblclick 발생 시 TextEditContext.requestEdit 호출.
 *   useStore에서 선택 요소 타입을 확인해 텍스트 요소일 때만 편집 모드 진입.
 *   ★ EditorCanvas.tsx 수정 없이 동작
 */

import React, { useEffect, useRef, useState } from 'react';
import { HandleId } from '@/hooks/useCanvasEditor';
import { useTextEdit } from '@/lib/textEditContext';
import { useStore } from '@/lib/store';

interface BoundingBoxProps {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  onHandlePointerDown: (handleId: HandleId) => (e: React.PointerEvent<HTMLDivElement>) => void;
  // [FEATURE: LAYER_ACTIONS] 우클릭 → 레이어 모달 — EditorCanvas 에서 주입
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  // [/FEATURE: LAYER_ACTIONS]
}

const RESIZE_HANDLES: { id: HandleId; top: string; left: string; cursor: string }[] = [
  { id: 'nw', top: '0',    left: '0',    cursor: 'nw-resize' },
  { id: 'n',  top: '0',    left: '50%',  cursor: 'n-resize'  },
  { id: 'ne', top: '0',    left: '100%', cursor: 'ne-resize' },
  { id: 'w',  top: '50%',  left: '0',    cursor: 'w-resize'  },
  { id: 'e',  top: '50%',  left: '100%', cursor: 'e-resize'  },
  { id: 'sw', top: '100%', left: '0',    cursor: 'sw-resize' },
  { id: 's',  top: '100%', left: '50%',  cursor: 's-resize'  },
  { id: 'se', top: '100%', left: '100%', cursor: 'se-resize' },
];

const REF_CANVAS_WIDTH = 800;

export default function BoundingBox({
  x, y, width, height, rotation,
  onHandlePointerDown,
  onContextMenu,
}: BoundingBoxProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  // ── 캔버스 너비 감지 → 핸들 비례 스케일 ────────────
  const [canvasWidth, setCanvasWidth] = useState(REF_CANVAS_WIDTH);

  useEffect(() => {
    const parent = boxRef.current?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(([entry]) => {
      setCanvasWidth(entry.contentRect.width);
    });
    ro.observe(parent);
    setCanvasWidth(parent.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const scale = Math.max(0.4, Math.min(2, canvasWidth / REF_CANVAS_WIDTH));
  const handleSize   = Math.round(8  * scale);
  const rotateSize   = Math.round(14 * scale);
  const rotateOffset = Math.round(24 * scale);
  const lineLen      = Math.round(rotateOffset - rotateSize / 2);

  // [FIX: DOUBLE_CLICK_EDIT] ──────────────────────────
  // 이동 핸들 더블클릭 → 선택된 요소가 텍스트면 편집 모드 진입
  const { requestEdit } = useTextEdit();
  const {
    selectedElementId,
    setlists,
    currentSetlistId,
    activeItemId,
    activeSectionId,
  } = useStore();

  // 현재 선택된 요소 찾기 (타입 확인용)
  const setlist  = setlists.find((sl) => sl.id === currentSetlistId);
  const item     = setlist?.items.find((it) => it.id === activeItemId);
  const section  = item?.sections.find((sec) => sec.id === activeSectionId);
  const selectedElement = section?.elements.find((el) => el.id === selectedElementId);

  const handleMoveDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (selectedElement?.type === 'text' && selectedElementId) {
      requestEdit(selectedElementId, section?.elements ?? []);
    }
  };
  // [/FIX: DOUBLE_CLICK_EDIT]

  return (
    <div
      ref={boxRef}
      style={{
        position: 'absolute',
        left:   `${x}%`,
        top:    `${y}%`,
        width:  `${width}%`,
        height: `${height}%`,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      {/* 외곽선 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: '1.5px solid #3b82f6',
          boxSizing: 'border-box',
        }}
      />

      {/* 이동 핸들 — 더블클릭으로 텍스트 편집 진입, 우클릭으로 레이어 모달 */}
      <div
        onPointerDown={onHandlePointerDown('move')}
        onDoubleClick={handleMoveDoubleClick}
        onContextMenu={onContextMenu}  // [FEATURE: LAYER_ACTIONS]
        style={{
          position: 'absolute',
          inset: 0,
          cursor: 'move',
          pointerEvents: 'all',
        }}
      />

      {/* 8방향 리사이즈 핸들 */}
      {RESIZE_HANDLES.map(({ id, top, left, cursor }) => (
        <div
          key={id}
          onPointerDown={onHandlePointerDown(id)}
          style={{
            position: 'absolute',
            top,
            left,
            transform: 'translate(-50%, -50%)',
            width: handleSize,
            height: handleSize,
            borderRadius: 2,
            background: '#ffffff',
            border: '1.5px solid #3b82f6',
            cursor,
            pointerEvents: 'all',
            zIndex: 10000,
          }}
        />
      ))}

      {/* 회전 핸들 */}
      <div
        onPointerDown={onHandlePointerDown('rotate')}
        style={{
          position: 'absolute',
          top: -rotateOffset,
          left: '50%',
          transform: 'translateX(-50%)',
          width: rotateSize,
          height: rotateSize,
          borderRadius: '50%',
          background: '#3b82f6',
          border: '2px solid #ffffff',
          cursor: 'grab',
          pointerEvents: 'all',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="회전"
      >
        <div
          style={{
            position: 'absolute',
            bottom: -lineLen,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 1,
            height: lineLen,
            background: '#3b82f6',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
