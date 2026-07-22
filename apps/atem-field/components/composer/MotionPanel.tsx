'use client';

/**
 * components/composer/MotionPanel.tsx
 * 모션/시퀀스 패널 — 선택된 요소의 모션 시작 상태 + 시퀀스 타이밍 편집
 *
 * ▸ 요소를 클릭하는 순서대로 시퀀스 번호(1, 2, 3…)를 자동 부여
 * ▸ 각 시퀀스는 시작시간(startTime) + 종료시간(endTime) 입력
 * ▸ 모션 속성(위치/크기/색상/회전)은 입력한 것만 애니메이션 적용
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { MotionConfig, MotionEasing, DEFAULT_MOTION, CanvasElement } from '@/lib/canvasTypes';
import { undoManager } from '@/lib/undoManager';
import { hasMotion } from '@/lib/motionEngine';
// [FEATURE: MOTION_SEQUENCE] 미리보기·프리셋·순차 배치·타임라인 조작 모듈
import {
  SEQ_COLORS,
  MotionToolbar,
  MotionPresetRow,
  SequenceTimeline,
  staggerSequence,
} from '@/features/motion-sequence';
import type { MotionUpdate } from '@/features/motion-sequence';

const EASING_OPTIONS: { value: MotionEasing; label: string }[] = [
  { value: 'linear', label: 'Linear (일정)' },
  { value: 'ease-in', label: 'Ease In (가속)' },
  { value: 'ease-out', label: 'Ease Out (감속)' },
  { value: 'ease-in-out', label: 'Ease In-Out (가감속)' },
  { value: 'bounce', label: 'Bounce (튕김)' },
];

/** 숫자 입력 필드 — 로컬 상태 기반으로 타이핑 안정화 */
function NumField({
  label,
  value,
  onChange,
  onClear,
  placeholder,
  unit = '',
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  onClear: () => void;
  placeholder: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const hasValue = value !== undefined;
  const [localVal, setLocalVal] = useState(hasValue ? String(value) : '');
  const [isFocused, setIsFocused] = useState(false);

  // 외부 값이 변경되면 로컬 동기화 (focus 중이 아닐 때만)
  useEffect(() => {
    if (!isFocused) {
      setLocalVal(hasValue ? String(value) : '');
    }
  }, [value, hasValue, isFocused]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-400 w-8 flex-shrink-0">{label}</span>
      <input
        type="number"
        value={localVal}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onFocus={() => setIsFocused(true)}
        onChange={(e) => {
          const raw = e.target.value;
          setLocalVal(raw);
          if (raw === '' || raw === '-') return; // 타이핑 중간 상태
          const num = parseFloat(raw);
          if (!isNaN(num)) onChange(num);
        }}
        onBlur={() => {
          setIsFocused(false);
          if (localVal === '' || localVal === '-') {
            onClear();
            return;
          }
          const num = parseFloat(localVal);
          if (!isNaN(num)) onChange(num);
          else onClear();
        }}
        onKeyDown={(e) => {
          // Enter로 확정
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          // 캔버스 단축키 차단
          e.stopPropagation();
        }}
        className="flex-1 bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-xs text-white
                   focus:outline-none focus:border-blue-500 placeholder-gray-600
                   [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none
                   [&::-webkit-outer-spin-button]:appearance-none"
      />
      {unit && <span className="text-[10px] text-gray-600 w-5 flex-shrink-0">{unit}</span>}
      {hasValue && (
        <button
          onClick={onClear}
          className="text-[10px] text-gray-600 hover:text-red-400 flex-shrink-0"
          title="초기화"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/** 시간 입력 필드 — 로컬 상태 기반 */
function TimeField({
  value,
  onChange,
  min = 0,
  max = 30,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const [localVal, setLocalVal] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) setLocalVal(String(value));
  }, [value, isFocused]);

  return (
    <input
      type="number"
      value={localVal}
      min={min}
      max={max}
      step={0.1}
      onFocus={() => setIsFocused(true)}
      onChange={(e) => {
        setLocalVal(e.target.value);
        const num = parseFloat(e.target.value);
        if (!isNaN(num)) onChange(num);
      }}
      onBlur={() => {
        setIsFocused(false);
        const num = parseFloat(localVal);
        if (!isNaN(num)) onChange(num);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        e.stopPropagation();
      }}
      className="flex-1 bg-[#1a1a1a] border border-[#333] rounded px-2 py-1.5 text-sm text-white
                 focus:outline-none focus:border-yellow-500
                 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none
                 [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

export default function MotionPanel() {
  const {
    setlists,
    currentSetlistId,
    activeItemId,
    activeSectionId,
    selectedElementId,
    isMotionMode,
    updateElement,
    setSelectedElement,
  } = useStore();

  // 현재 선택된 요소 찾기
  const currentSetlist = setlists.find((s) => s.id === currentSetlistId);
  const currentItem = currentSetlist?.items.find((i) => i.id === activeItemId);
  const currentSection = currentItem?.sections.find((s) => s.id === activeSectionId);
  const selectedElement = currentSection?.elements.find((el) => el.id === selectedElementId);
  const allElements = currentSection?.elements ?? [];

  // 모션 설정 가져오기 (없으면 기본값)
  const motion: MotionConfig = selectedElement?.motion ?? { ...DEFAULT_MOTION };

  // ★ 최신 motion/allElements 를 ref 로 유지 — useCallback 클로저 스탈 방지
  const motionRef = useRef(motion);
  motionRef.current = motion;
  const allElementsRef = useRef(allElements);
  allElementsRef.current = allElements;

  // ── 시퀀스 자동 부여 로직 ──────────────────
  const nextSeqRef = useRef(1);
  const prevSectionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeSectionId !== prevSectionIdRef.current) {
      prevSectionIdRef.current = activeSectionId;
      const maxSeq = allElements.reduce((max, el) => {
        const seq = el.motion?.sequence ?? 0;
        return seq > max ? seq : max;
      }, 0);
      nextSeqRef.current = maxSeq + 1;
    }
  }, [activeSectionId, allElements]);

  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isMotionMode || !selectedElement || !currentSetlistId || !activeItemId || !activeSectionId) return;
    if (selectedElement.id === prevSelectedRef.current) return;
    prevSelectedRef.current = selectedElement.id;

    // 영상 요소는 송출 시 모션이 적용되지 않으므로 시퀀스 자동 부여 제외
    if (selectedElement.type === 'video') return;

    const currentSeq = selectedElement.motion?.sequence ?? 0;
    if (currentSeq > 0) return;

    const seq = nextSeqRef.current;
    nextSeqRef.current = seq + 1;

    const currentMotion = selectedElement.motion ?? { ...DEFAULT_MOTION };
    updateElement(currentSetlistId, activeItemId, activeSectionId, selectedElement.id, {
      motion: { ...currentMotion, sequence: seq },
    } as Partial<CanvasElement>);
  }, [isMotionMode, selectedElement, currentSetlistId, activeItemId, activeSectionId, updateElement]);

  // 모션 업데이트 헬퍼 — ★ ref 에서 항상 최신 motion 읽기 (클로저 스탈 문제 해결)
  const undoPushedRef = useRef(false);

  const updateMotion = useCallback(
    (updates: Partial<MotionConfig>, pushUndo = false) => {
      if (!currentSetlistId || !activeItemId || !activeSectionId || !selectedElementId) return;
      if (pushUndo || !undoPushedRef.current) {
        undoManager.pushState(allElementsRef.current);
        undoPushedRef.current = true;
        setTimeout(() => { undoPushedRef.current = false; }, 2000);
      }
      const latest = motionRef.current;
      const newMotion = { ...latest, ...updates };
      newMotion.duration = (newMotion.endTime ?? 1) - (newMotion.startTime ?? 0);
      updateElement(currentSetlistId, activeItemId, activeSectionId, selectedElementId, {
        motion: newMotion,
      } as Partial<CanvasElement>);
    },
    [currentSetlistId, activeItemId, activeSectionId, selectedElementId, updateElement]
  );

  // 속성 제거 — ref 에서 최신 motion 읽기
  const clearMotionProp = useCallback(
    (key: keyof MotionConfig) => {
      if (!currentSetlistId || !activeItemId || !activeSectionId || !selectedElementId) return;
      undoManager.pushState(allElementsRef.current);
      const newMotion = { ...motionRef.current };
      delete (newMotion as Record<string, unknown>)[key];
      updateElement(currentSetlistId, activeItemId, activeSectionId, selectedElementId, {
        motion: newMotion,
      } as Partial<CanvasElement>);
    },
    [currentSetlistId, activeItemId, activeSectionId, selectedElementId, updateElement]
  );

  // ── 시퀀스 리스트 (전체 요소에서 시퀀스가 부여된 것들) ──
  const sequencedElements = allElements
    .filter((el) => el.motion && (el.motion.sequence ?? 0) > 0)
    .sort((a, b) => (a.motion!.sequence ?? 0) - (b.motion!.sequence ?? 0));

  // 시퀀스 초기화 (전체)
  const resetAllSequences = useCallback(() => {
    if (!currentSetlistId || !activeItemId || !activeSectionId) return;
    undoManager.pushState(allElements);
    for (const el of allElements) {
      if (el.motion && (el.motion.sequence ?? 0) > 0) {
        updateElement(currentSetlistId, activeItemId, activeSectionId, el.id, {
          motion: { ...DEFAULT_MOTION },
        } as Partial<CanvasElement>);
      }
    }
    nextSeqRef.current = 1;
  }, [currentSetlistId, activeItemId, activeSectionId, allElements, updateElement]);

  // [FEATURE: MOTION_SEQUENCE] 타임라인·순차 배치용 헬퍼 ─────────────────────
  const sectionHasMotion = hasMotion(allElements);

  const pushUndo = useCallback(() => {
    undoManager.pushState(allElementsRef.current);
  }, []);

  const applyMotion = useCallback(
    (elId: string, newMotion: MotionConfig) => {
      if (!currentSetlistId || !activeItemId || !activeSectionId) return;
      updateElement(currentSetlistId, activeItemId, activeSectionId, elId, {
        motion: newMotion,
      } as Partial<CanvasElement>);
    },
    [currentSetlistId, activeItemId, activeSectionId, updateElement],
  );

  const applyMotionBatch = useCallback(
    (updates: MotionUpdate[]) => {
      for (const u of updates) applyMotion(u.id, u.motion);
    },
    [applyMotion],
  );

  const handleStagger = useCallback(
    (interval: number, duration: number) => {
      const updates = staggerSequence(allElementsRef.current, { interval, duration });
      if (updates.length === 0) return;
      pushUndo();
      applyMotionBatch(updates);
    },
    [applyMotionBatch, pushUndo],
  );

  // 요소가 선택되지 않았을 때
  if (!selectedElement) {
    return (
      <div className="h-full flex flex-col">
        {/* 도구 모음 + 시퀀스 리스트 (요소 미선택 시에도 표시) */}
        <div className="px-8 py-3 flex flex-col gap-3 border-b border-[#222]">
          <MotionToolbar
            sequencedCount={sequencedElements.length}
            canPreview={sectionHasMotion}
            onStagger={handleStagger}
          />
          <SequenceTimeline
            elements={allElements}
            selectedId={selectedElementId}
            onSelect={setSelectedElement}
            onUpdateMotion={applyMotion}
            onBatchUpdate={applyMotionBatch}
            onBeforeChange={pushUndo}
            onResetAll={resetAllSequences}
          />
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-gray-600 text-xs text-center leading-relaxed">
            요소를 클릭하면<br />순서대로 시퀀스가 부여됩니다
          </p>
        </div>
      </div>
    );
  }

  // 영상 요소 — 송출 경로가 캔버스가 아니라 모션이 적용되지 않음 (미지원 안내)
  if (selectedElement.type === 'video') {
    return (
      <div className="h-full overflow-y-auto px-8 py-3 flex flex-col gap-3">
        <MotionToolbar
          sequencedCount={sequencedElements.length}
          canPreview={sectionHasMotion}
          onStagger={handleStagger}
        />
        <SequenceTimeline
          elements={allElements}
          selectedId={selectedElementId}
          onSelect={setSelectedElement}
          onUpdateMotion={applyMotion}
          onBatchUpdate={applyMotionBatch}
          onBeforeChange={pushUndo}
          onResetAll={resetAllSequences}
        />
        <div className="px-2 py-2 bg-amber-900/20 border border-amber-700/40 rounded">
          <p className="text-[10px] text-amber-300/90 leading-relaxed">
            영상 요소는 모션이 적용되지 않습니다.
            영상은 캔버스가 아닌 별도 경로로 재생되어 송출 화면에서 모션이 무시됩니다.
          </p>
        </div>
      </div>
    );
  }

  const isTextOrShape = selectedElement.type === 'text' || selectedElement.type === 'shape';

  // 활성 모션 개수
  const activeCount = [
    motion.startX, motion.startY,
    motion.startWidth, motion.startHeight,
    motion.startColor,
    motion.startRotation,
    motion.startOpacity,
  ].filter((v) => v !== undefined).length;

  const seqNum = motion.sequence ?? 0;
  const seqColor = seqNum > 0 ? SEQ_COLORS[(seqNum - 1) % SEQ_COLORS.length] : '';

  return (
    <div className="h-full overflow-y-auto px-8 py-3 flex flex-col gap-3">

      {/* ── 도구 모음 + 시퀀스 리스트 (항상 상단에 표시) ── */}
      <div className="flex flex-col gap-3 pb-3 border-b border-[#222]">
        <MotionToolbar
          sequencedCount={sequencedElements.length}
          canPreview={sectionHasMotion}
          onStagger={handleStagger}
        />
        <SequenceTimeline
          elements={allElements}
          selectedId={selectedElementId}
          onSelect={setSelectedElement}
          onUpdateMotion={applyMotion}
          onBatchUpdate={applyMotionBatch}
          onBeforeChange={pushUndo}
          onResetAll={resetAllSequences}
        />
      </div>

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {seqNum > 0 && (
            <span className={`${seqColor} text-white text-[10px] font-bold px-1.5 py-0.5 rounded`}>
              #{seqNum}
            </span>
          )}
          <h3 className="text-xs font-bold text-white">모션 설정</h3>
        </div>
        {activeCount > 0 && (
          <span className="text-[10px] text-blue-400 font-medium">
            {activeCount}개 활성
          </span>
        )}
      </div>

      {/* 요소 정보 */}
      <div className="bg-[#1a1a1a] rounded-lg p-2 border border-[#2a2a2a]">
        <p className="text-[10px] text-gray-500">선택 요소</p>
        <p className="text-xs text-white font-medium truncate">
          {selectedElement.type === 'text' ? '텍스트' :
           selectedElement.type === 'shape' ? '도형' :
           selectedElement.type === 'image' ? '이미지' : '영상'}
          <span className="text-gray-500 ml-1">#{selectedElement.id.slice(-5)}</span>
        </p>
      </div>

      {/* ── 프리셋 (원클릭 시작값 적용) ── */}
      <MotionPresetRow
        element={selectedElement}
        onApply={(updates) => updateMotion(updates, true)}
      />

      {/* ── 시퀀스 타이밍 (시작시간 / 종료시간) ── */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold text-yellow-400">시퀀스 타이밍</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-gray-500">시작시간</span>
            <div className="flex items-center gap-1">
              <TimeField
                value={motion.startTime ?? 0}
                onChange={(v) => {
                  const end = motion.endTime ?? 1;
                  updateMotion({ startTime: v, endTime: Math.max(v + 0.1, end) });
                }}
              />
              <span className="text-[10px] text-gray-500">초</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-gray-500">종료시간</span>
            <div className="flex items-center gap-1">
              <TimeField
                value={motion.endTime ?? 1}
                min={0.1}
                onChange={(v) => {
                  const start = motion.startTime ?? 0;
                  updateMotion({ endTime: Math.max(start + 0.1, v) });
                }}
              />
              <span className="text-[10px] text-gray-500">초</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden relative">
            {/* 타임라인 바 */}
            <div
              className={`absolute top-0 h-full rounded-full ${seqColor || 'bg-yellow-500'}`}
              style={{
                left: `${Math.min(((motion.startTime ?? 0) / Math.max((motion.endTime ?? 1) * 1.5, 2)) * 100, 90)}%`,
                width: `${Math.max(((motion.endTime ?? 1) - (motion.startTime ?? 0)) / Math.max((motion.endTime ?? 1) * 1.5, 2) * 100, 10)}%`,
              }}
            />
          </div>
          <span className="text-[9px] text-gray-500 flex-shrink-0 w-10 text-right">
            {((motion.endTime ?? 1) - (motion.startTime ?? 0)).toFixed(1)}초
          </span>
        </div>
      </div>

      {/* ── 1. 위치 (Position) ── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-cyan-400">1. 위치 (Position)</p>
          <span className="text-[9px] text-gray-600">
            최종: ({selectedElement.x.toFixed(1)}, {selectedElement.y.toFixed(1)})
          </span>
        </div>
        <NumField
          label="X"
          value={motion.startX}
          onChange={(v) => updateMotion({ startX: v })}
          onClear={() => clearMotionProp('startX')}
          placeholder={selectedElement.x.toFixed(1)}
          unit="%"
          min={-100}
          max={200}
          step={0.5}
        />
        <NumField
          label="Y"
          value={motion.startY}
          onChange={(v) => updateMotion({ startY: v })}
          onClear={() => clearMotionProp('startY')}
          placeholder={selectedElement.y.toFixed(1)}
          unit="%"
          min={-100}
          max={200}
          step={0.5}
        />
      </div>

      {/* ── 2. 크기 (Scale) ── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-green-400">
            2. {selectedElement.type === 'text' ? '글자 크기 (Font Size)' : '크기 (Scale)'}
          </p>
          <span className="text-[9px] text-gray-600">
            {selectedElement.type === 'text'
              ? `최종: ${selectedElement.fontSize}px`
              : `최종: (${selectedElement.width.toFixed(1)}, ${selectedElement.height.toFixed(1)})`}
          </span>
        </div>
        {selectedElement.type === 'text' ? (
          /* 텍스트: fontSize 모션 */
          <NumField
            label="크기"
            value={motion.startFontSize}
            onChange={(v) => updateMotion({ startFontSize: v })}
            onClear={() => clearMotionProp('startFontSize')}
            placeholder={String(selectedElement.fontSize)}
            unit="px"
            min={1}
            max={500}
            step={1}
          />
        ) : (
          /* 도형/이미지: width/height 모션 */
          <>
            <NumField
              label="W"
              value={motion.startWidth}
              onChange={(v) => updateMotion({ startWidth: v })}
              onClear={() => clearMotionProp('startWidth')}
              placeholder={selectedElement.width.toFixed(1)}
              unit="%"
              min={0}
              max={200}
              step={0.5}
            />
            <NumField
              label="H"
              value={motion.startHeight}
              onChange={(v) => updateMotion({ startHeight: v })}
              onClear={() => clearMotionProp('startHeight')}
              placeholder={selectedElement.height.toFixed(1)}
              unit="%"
              min={0}
              max={200}
              step={0.5}
            />
          </>
        )}

        {/* 4면 개별 스케일 — 사각 도형(rect, roundRect) 전용 */}
        {selectedElement.type === 'shape' &&
         (selectedElement.shapeType === 'rect' || selectedElement.shapeType === 'roundRect') && (
          <>
            {/* 토글 버튼 */}
            <button
              onClick={() => {
                const has4Side =
                  motion.startLeftW !== undefined || motion.startRightW !== undefined ||
                  motion.startTopH !== undefined || motion.startBottomH !== undefined;
                if (has4Side) {
                  // 4면 값 제거 → 전체 스케일로 복귀
                  const m = { ...motionRef.current };
                  delete (m as Record<string, unknown>).startLeftW;
                  delete (m as Record<string, unknown>).startRightW;
                  delete (m as Record<string, unknown>).startTopH;
                  delete (m as Record<string, unknown>).startBottomH;
                  undoManager.pushState(allElementsRef.current);
                  updateElement(currentSetlistId!, activeItemId!, activeSectionId!, selectedElementId!, {
                    motion: m,
                  } as Partial<CanvasElement>);
                } else {
                  // 4면 활성화 — 반쪽 크기 기본값(= 최종 반쪽)으로 초기화
                  updateMotion({
                    startLeftW: selectedElement.width / 2,
                    startRightW: selectedElement.width / 2,
                    startTopH: selectedElement.height / 2,
                    startBottomH: selectedElement.height / 2,
                  }, true);
                }
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors ${
                (motion.startLeftW !== undefined || motion.startRightW !== undefined ||
                 motion.startTopH !== undefined || motion.startBottomH !== undefined)
                  ? 'bg-green-600/20 border-green-500/50 text-green-300'
                  : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-500 hover:text-gray-300 hover:border-[#444]'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="12" y1="3" x2="12" y2="21" />
                <line x1="3" y1="12" x2="21" y2="12" />
              </svg>
              4면 개별 스케일
            </button>

            {/* 4면 입력 필드 */}
            {(motion.startLeftW !== undefined || motion.startRightW !== undefined ||
              motion.startTopH !== undefined || motion.startBottomH !== undefined) && (
              <div className="flex flex-col gap-1 pl-1 border-l-2 border-green-600/30">
                <p className="text-[9px] text-gray-500 mb-0.5">
                  센터 기준 반쪽 크기 (최종: {(selectedElement.width / 2).toFixed(1)} × {(selectedElement.height / 2).toFixed(1)})
                </p>
                <div className="grid grid-cols-2 gap-1">
                  <NumField
                    label="좌"
                    value={motion.startLeftW}
                    onChange={(v) => updateMotion({ startLeftW: v })}
                    onClear={() => clearMotionProp('startLeftW')}
                    placeholder={(selectedElement.width / 2).toFixed(1)}
                    unit="%"
                    min={0}
                    max={100}
                    step={0.5}
                  />
                  <NumField
                    label="우"
                    value={motion.startRightW}
                    onChange={(v) => updateMotion({ startRightW: v })}
                    onClear={() => clearMotionProp('startRightW')}
                    placeholder={(selectedElement.width / 2).toFixed(1)}
                    unit="%"
                    min={0}
                    max={100}
                    step={0.5}
                  />
                  <NumField
                    label="상"
                    value={motion.startTopH}
                    onChange={(v) => updateMotion({ startTopH: v })}
                    onClear={() => clearMotionProp('startTopH')}
                    placeholder={(selectedElement.height / 2).toFixed(1)}
                    unit="%"
                    min={0}
                    max={100}
                    step={0.5}
                  />
                  <NumField
                    label="하"
                    value={motion.startBottomH}
                    onChange={(v) => updateMotion({ startBottomH: v })}
                    onClear={() => clearMotionProp('startBottomH')}
                    placeholder={(selectedElement.height / 2).toFixed(1)}
                    unit="%"
                    min={0}
                    max={100}
                    step={0.5}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 3. 색상 (Color) — 텍스트/도형만 ── */}
      {isTextOrShape && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-pink-400">3. 색상 (Color)</p>
            <span className="text-[9px] text-gray-600">
              최종: {selectedElement.type === 'text' ? selectedElement.color : selectedElement.type === 'shape' ? selectedElement.fill : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 w-8 flex-shrink-0">시작</span>
            <input
              type="color"
              value={motion.startColor ?? (selectedElement.type === 'text' ? selectedElement.color : selectedElement.type === 'shape' ? selectedElement.fill : '#ffffff')}
              onChange={(e) => updateMotion({ startColor: e.target.value }, true)}
              className="w-8 h-7 rounded border border-[#333] bg-transparent cursor-pointer"
            />
            {motion.startColor !== undefined && (
              <>
                <span className="text-[10px] text-gray-400 flex-1">{motion.startColor}</span>
                <span className="text-[10px] text-gray-600">→</span>
                <span className="text-[10px] text-white">
                  {selectedElement.type === 'text' ? selectedElement.color : selectedElement.type === 'shape' ? selectedElement.fill : ''}
                </span>
                <button
                  onClick={() => clearMotionProp('startColor')}
                  className="text-[10px] text-gray-600 hover:text-red-400"
                  title="초기화"
                >
                  ✕
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 4. 회전 (Rotation) ── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-orange-400">4. 회전 (Rotation)</p>
          <span className="text-[9px] text-gray-600">
            최종: {selectedElement.rotation}°
          </span>
        </div>
        <NumField
          label="각도"
          value={motion.startRotation}
          onChange={(v) => updateMotion({ startRotation: v })}
          onClear={() => clearMotionProp('startRotation')}
          placeholder={String(selectedElement.rotation)}
          unit="°"
          min={-720}
          max={720}
          step={5}
        />
      </div>

      {/* ── 5. 투명도 (Opacity) ── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-sky-400">5. 투명도 (Opacity)</p>
          <span className="text-[9px] text-gray-600">
            최종: {Math.round(selectedElement.opacity * 100)}%
          </span>
        </div>
        <NumField
          label="시작"
          value={motion.startOpacity !== undefined ? Math.round(motion.startOpacity * 100) : undefined}
          onChange={(v) => updateMotion({ startOpacity: Math.max(0, Math.min(1, v / 100)) })}
          onClear={() => clearMotionProp('startOpacity')}
          placeholder={String(Math.round(selectedElement.opacity * 100))}
          unit="%"
          min={0}
          max={100}
          step={5}
        />
      </div>

      {/* ── 6. 가감속 (Easing) ── */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold text-purple-400">6. 가감속 (Easing)</p>
        <div className="grid grid-cols-1 gap-1">
          {EASING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateMotion({ easing: opt.value }, true)}
              className={`px-2 py-1.5 rounded text-[11px] text-left transition-colors border ${
                motion.easing === opt.value
                  ? 'bg-purple-600/30 border-purple-500 text-purple-300'
                  : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:border-[#444] hover:text-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 모션 초기화 버튼 ── */}
      {(activeCount > 0 || seqNum > 0) && (
        <button
          onClick={() => {
            if (!currentSetlistId || !activeItemId || !activeSectionId || !selectedElementId) return;
            undoManager.pushState(allElements);
            updateElement(currentSetlistId, activeItemId, activeSectionId, selectedElementId, {
              motion: { ...DEFAULT_MOTION },
            } as Partial<CanvasElement>);
            // 초기화 후 같은 요소를 다시 클릭하면 시퀀스가 재부여되도록 기준 해제
            prevSelectedRef.current = null;
          }}
          className="mt-1 px-3 py-2 rounded-lg bg-red-900/30 border border-red-800/40
                     text-red-400 text-xs hover:bg-red-800/40 transition-colors"
        >
          이 요소 모션 초기화
        </button>
      )}

      {/* 안내 */}
      <div className="mt-1 px-2 py-2 bg-[#0d0d0d] rounded border border-[#1a1a1a]">
        <p className="text-[9px] text-gray-600 leading-relaxed">
          요소를 클릭하는 순서대로 시퀀스 번호가 부여됩니다.
          시작시간/종료시간으로 각 요소의 애니메이션 구간을 지정하세요.
          시간이 겹치면 동시에, 이어지면 순차적으로 재생됩니다.
        </p>
      </div>
    </div>
  );
}
