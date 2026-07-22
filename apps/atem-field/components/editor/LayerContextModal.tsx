'use client';

/**
 * LayerContextModal.tsx
 * 캔버스 요소 우클릭 시 나타나는 레이어 조작 모달
 *
 * [FEATURE: LAYER_ACTIONS]
 * - 커서 위치 근처에 카드형 모달로 표시
 * - 레이어 섹션: 맨 앞으로 / 앞으로 / 뒤로 / 맨 뒤로 (2×2 그리드)
 * - 기타 섹션: 복사 / 붙여넣기 / 잠금 / 숨기기 / 삭제
 * - 외부 클릭 / Escape 로 닫힘
 * - lib/layerActions.ts 의 getLayerActionAvailability 사용
 *
 * EditorCanvas.tsx 에서 기존 ContextMenu 대신 이 컴포넌트 사용
 */

import React, { useEffect, useRef } from 'react';
import { CanvasElement } from '@/lib/canvasTypes';
import { getLayerActionAvailability, LayerAction } from '@/lib/layerActions';

/* ── Props ─────────────────────────────────────────── */
export interface LayerContextModalProps {
  x: number;
  y: number;
  element: CanvasElement | null;
  elements: CanvasElement[];
  selectedIds: string[];
  onClose: () => void;
  /* 레이어 액션 */
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onSendToBack: () => void;
  /* 클리핑 마스크 */
  onCreateClipMask: () => void;
  onReleaseClipMask: () => void;
  /* [FEATURE: SHAPE_CUT] 아래 도형 형태로 위 도형을 잘라 이미지로 (아래 도형 유지) */
  onCutShapeToImage: () => void;
  /* [FEATURE: SHAPE_YOUTUBE_CLIP] 도형에 유튜브 영상 넣기 (클리핑) */
  onAttachYouTube: () => void;
  /* [FEATURE: CLIP_MASK_GROUP] 클리핑된 요소 → 마스크 요소 선택 점프 */
  onSelectMask: () => void;
  /* 기타 액션 */
  onCopy: () => void;
  onPaste: () => void;
  onToggleLock: () => void;
  onToggleVisible: () => void;
  onDelete: () => void;
  hasClipboard: boolean;
}

/* ── 레이어 버튼 정의 ─────────────────────────────── */
const LAYER_ACTIONS: {
  action: LayerAction;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    action: 'bringToFront',
    label: '맨 앞으로',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1v14M3 5l5-4 5 4" stroke="currentColor" strokeWidth="1.4"
          strokeLinecap="round" strokeLinejoin="round" />
        <line x1="1" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="1.4"
          strokeLinecap="round" />
      </svg>
    ),
  },
  {
    action: 'bringForward',
    label: '앞으로',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 3v10M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.4"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    action: 'sendBackward',
    label: '뒤로',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 13V3M4 9l4 4 4-4" stroke="currentColor" strokeWidth="1.4"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    action: 'sendToBack',
    label: '맨 뒤로',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 15V1M3 11l5 4 5-4" stroke="currentColor" strokeWidth="1.4"
          strokeLinecap="round" strokeLinejoin="round" />
        <line x1="1" y1="1" x2="15" y2="1" stroke="currentColor" strokeWidth="1.4"
          strokeLinecap="round" />
      </svg>
    ),
  },
];

/* ── LayerContextModal ──────────────────────────── */
export default function LayerContextModal({
  x, y,
  element,
  elements,
  selectedIds,
  onClose,
  onBringToFront, onBringForward, onSendBackward, onSendToBack,
  onCreateClipMask, onReleaseClipMask,
  onCutShapeToImage,
  onAttachYouTube,
  onSelectMask,
  onCopy, onPaste, onToggleLock, onToggleVisible, onDelete,
  hasClipboard,
}: LayerContextModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  /* 외부 클릭 / Escape 닫기 */
  useEffect(() => {
    function handleDown(e: MouseEvent | TouchEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleDown, true);
    document.addEventListener('touchstart', handleDown, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown, true);
      document.removeEventListener('touchstart', handleDown, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  /* 뷰포트 경계 보정 */
  const MODAL_W = 200;
  const MODAL_H_EST = 220;
  const posX = Math.min(x + 4, window.innerWidth  - MODAL_W  - 8);
  const posY = Math.min(y + 4, window.innerHeight - MODAL_H_EST - 8);

  /* 레이어 버튼 활성화 여부 */
  const avail = getLayerActionAvailability(elements, element?.id ?? null);

  const layerHandlers: Record<LayerAction, () => void> = {
    bringToFront: onBringToFront,
    bringForward: onBringForward,
    sendBackward: onSendBackward,
    sendToBack:   onSendToBack,
  };

  function runAndClose(fn: () => void) {
    fn();
    onClose();
  }

  return (
    <>
      {/* 반투명 백드롭 (클릭 시 닫힘) */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 99990 }}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />

      {/* 모달 카드 */}
      <div
        ref={modalRef}
        style={{
          position: 'fixed',
          left: posX,
          top: posY,
          zIndex: 99999,
          width: MODAL_W,
        }}
        className="
          bg-[#1c1c1e] border border-[#3a3a3a] rounded-xl
          shadow-[0_8px_32px_rgba(0,0,0,0.7)]
          overflow-hidden
          animate-in fade-in zoom-in-95 duration-100
        "
        onContextMenu={(e) => e.preventDefault()}
      >

        {/* ── 레이어 섹션 헤더 ── */}
        <div className="px-3 pt-2.5 pb-1">
          <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest">
            레이어 순서
          </p>
        </div>

        {/* ── 레이어 버튼 2×2 그리드 ── */}
        <div className="grid grid-cols-2 gap-1 px-2 pb-2">
          {LAYER_ACTIONS.map(({ action, label, icon }) => (
            <button
              key={action}
              disabled={!avail[action]}
              onClick={() => runAndClose(layerHandlers[action])}
              title={label}
              className="
                flex flex-col items-center justify-center gap-1
                py-2.5 rounded-lg text-[10px] font-medium
                border border-[#2e2e2e] bg-[#252525]
                text-gray-300
                hover:bg-[#2f2f2f] hover:border-[#444] hover:text-white
                disabled:opacity-25 disabled:cursor-not-allowed
                transition-colors
              "
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* ── 클리핑 마스크 섹션 ── */}
        {(() => {
          // 현재 요소가 이미 클리핑 마스크가 적용된 상태인지
          const hasClipMask = !!element?.clipMaskId;
          // 2개 이상 선택 시 클리핑 마스크 생성 가능
          const canCreate = selectedIds.length >= 2;
          // 현재 요소가 다른 요소의 마스크 역할을 하는지
          const isMaskFor = elements.some((el) => el.clipMaskId === element?.id);
          // [FEATURE: SHAPE_YOUTUBE_CLIP] 도형 선택 시 유튜브 삽입 옵션 활성화
          //   선택된 요소 중 하나 이상이 shape 여야 함 (현재 우클릭 대상이 아니어도
          //   선택 자체가 shape 를 포함하면 OK — 낮은 zIndex 의 shape 가 마스크가 됨)
          const shapesInSelection = selectedIds
            .map((id) => elements.find((e) => e.id === id))
            .filter((e): e is CanvasElement => !!e && e.type === 'shape');
          const canAttachYouTube = shapesInSelection.length > 0;

          if (hasClipMask || canCreate || isMaskFor || canAttachYouTube) {
            return (
              <>
                <div className="border-t border-[#2a2a2a] mx-2" />
                <div className="py-1">
                  {canCreate && !hasClipMask && (
                    <ActionItem
                      label="클리핑 마스크 만들기"
                      onClick={() => runAndClose(onCreateClipMask)}
                      icon={
                        <svg viewBox="0 0 12 12" fill="none">
                          <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1" />
                          <rect x="3" y="3" width="6" height="6" rx="1" fill="currentColor" opacity="0.4" />
                        </svg>
                      }
                    />
                  )}
                  {/* [FEATURE: SHAPE_CUT] 도형 2개 이상 → 아래 형태로 위를 잘라 이미지로 (아래 도형 유지) */}
                  {shapesInSelection.length >= 2 && (
                    <ActionItem
                      label="도형자르기 (아래 모양대로)"
                      onClick={() => runAndClose(onCutShapeToImage)}
                      icon={
                        <svg viewBox="0 0 12 12" fill="none">
                          <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                        </svg>
                      }
                    />
                  )}
                  {hasClipMask && (
                    <>
                      <ActionItem
                        label="마스크 선택"
                        onClick={() => runAndClose(onSelectMask)}
                        icon={
                          <svg viewBox="0 0 12 12" fill="none">
                            <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1" />
                          </svg>
                        }
                      />
                      <ActionItem
                        label="클리핑 마스크 해제"
                        onClick={() => runAndClose(onReleaseClipMask)}
                        icon={
                          <svg viewBox="0 0 12 12" fill="none">
                            <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
                            <path d="M2 10L10 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                          </svg>
                        }
                      />
                    </>
                  )}
                  {isMaskFor && (
                    <ActionItem
                      label="클리핑 마스크 해제 (마스크)"
                      onClick={() => runAndClose(onReleaseClipMask)}
                      icon={
                        <svg viewBox="0 0 12 12" fill="none">
                          <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M2 10L10 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      }
                    />
                  )}
                  {/* [FEATURE: SHAPE_YOUTUBE_CLIP] 도형에 유튜브 영상 넣기 */}
                  {canAttachYouTube && !hasClipMask && (
                    <ActionItem
                      label="유튜브 영상 넣기"
                      onClick={() => runAndClose(onAttachYouTube)}
                      icon={
                        <svg viewBox="0 0 12 12" fill="none">
                          <rect x="1" y="2.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M5 4.5L8 6L5 7.5V4.5Z" fill="currentColor" />
                        </svg>
                      }
                    />
                  )}
                </div>
              </>
            );
          }
          return null;
        })()}

        {/* ── 구분선 ── */}
        <div className="border-t border-[#2a2a2a] mx-2" />

        {/* ── 기타 액션 목록 ── */}
        <div className="py-1">

          {/* 복사 */}
          <ActionItem
            label="복사"
            shortcut="⌘C"
            onClick={() => runAndClose(onCopy)}
            icon={
              <svg viewBox="0 0 12 12" fill="none">
                <rect x="1" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 1h7v7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />

          {/* 붙여넣기 */}
          <ActionItem
            label="붙여넣기"
            shortcut="⌘V"
            onClick={() => runAndClose(onPaste)}
            disabled={!hasClipboard}
            icon={
              <svg viewBox="0 0 12 12" fill="none">
                <rect x="2" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            }
          />

          <div className="border-t border-[#2a2a2a] mx-3 my-1" />

          {/* 잠금 */}
          <ActionItem
            label={element?.locked ? '잠금 해제' : '잠금'}
            onClick={() => runAndClose(onToggleLock)}
            icon={
              <svg viewBox="0 0 12 12" fill="none">
                <rect x="2" y="5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            }
          />

          {/* 숨기기/보이기 */}
          <ActionItem
            label={element?.visible ? '숨기기' : '보이기'}
            onClick={() => runAndClose(onToggleVisible)}
            icon={
              <svg viewBox="0 0 12 12" fill="none">
                <path d="M1 6s2-4 5-4 5 4 5 4-2 4-5 4-5-4-5-4z" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="6" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            }
          />

          <div className="border-t border-[#2a2a2a] mx-3 my-1" />

          {/* 삭제 */}
          <ActionItem
            label="삭제"
            danger
            onClick={() => runAndClose(onDelete)}
            icon={
              <svg viewBox="0 0 12 12" fill="none">
                <path d="M2 3h8M5 3V2h2v1M4 3l.5 7h3L8 3"
                  stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
        </div>

      </div>
    </>
  );
}

/* ── 보조 컴포넌트: 액션 행 ──────────────────────── */
function ActionItem({
  label, shortcut, onClick, disabled, danger, icon,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`
        w-full flex items-center gap-2.5 px-3 py-[5px] text-[11px] text-left
        transition-colors select-none
        ${disabled
          ? 'text-gray-700 cursor-not-allowed'
          : danger
            ? 'text-red-400 hover:bg-red-900/25 hover:text-red-300'
            : 'text-gray-300 hover:bg-[#2a2a2a] hover:text-white'
        }
      `}
    >
      <span className="w-3.5 h-3.5 flex-shrink-0 opacity-60">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-[9px] text-gray-600 ml-auto">{shortcut}</span>
      )}
    </button>
  );
}
