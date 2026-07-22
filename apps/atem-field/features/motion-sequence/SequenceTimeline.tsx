'use client';

// 시퀀스 타임라인 — 바 드래그(이동/시작/끝 조정) + ↑↓ 순서 교환 + 시퀀스 해제 + 번호 재정렬

import { useRef } from 'react';
import { CanvasElement, MotionConfig } from '@/lib/canvasTypes';
import { seqColorOf } from './sequenceColors';
import { getSequencedElements, compactSequences, swapSequence, MotionUpdate } from './autoStagger';

const MIN_SPAN = 0.1;

type DragMode = 'move' | 'start' | 'end';

interface SequenceTimelineProps {
  /** 섹션의 전체 요소 (시퀀스 필터·정렬은 내부에서) */
  elements: CanvasElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 한 요소의 motion 전체 교체 */
  onUpdateMotion: (id: string, motion: MotionConfig) => void;
  /** 여러 요소 motion 일괄 교체 (순서 교환·재정렬) */
  onBatchUpdate: (updates: MotionUpdate[]) => void;
  /** 드래그/버튼 조작 직전 1회 호출 — 호출부가 undo 스냅샷 저장 */
  onBeforeChange: () => void;
  onResetAll: () => void;
}

export default function SequenceTimeline({
  elements,
  selectedId,
  onSelect,
  onUpdateMotion,
  onBatchUpdate,
  onBeforeChange,
  onResetAll,
}: SequenceTimelineProps) {
  const sequenced = getSequencedElements(elements);

  // 드래그 상태 — 스케일은 드래그 시작 시점에 고정 (드래그 중 재계산 시 바가 미끄러짐)
  const dragRef = useRef<{
    id: string;
    mode: DragMode;
    originX: number;
    origStart: number;
    origEnd: number;
    secPerPx: number;
    motion: MotionConfig;
  } | null>(null);

  if (sequenced.length === 0) return null;

  const maxEnd = sequenced.reduce((max, el) => {
    const end = el.motion?.endTime ?? (el.motion?.startTime ?? 0) + (el.motion?.duration ?? 1);
    return end > max ? end : max;
  }, 2);
  const timelineMax = Math.max(maxEnd, 2);

  const round1 = (v: number) => Math.round(v * 10) / 10;

  const beginDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    el: CanvasElement,
    mode: DragMode,
    trackWidth: number,
  ) => {
    e.stopPropagation();
    const m = el.motion!;
    onBeforeChange();
    dragRef.current = {
      id: el.id,
      mode,
      originX: e.clientX,
      origStart: m.startTime ?? 0,
      origEnd: m.endTime ?? (m.startTime ?? 0) + (m.duration ?? 1),
      secPerPx: timelineMax / Math.max(trackWidth, 1),
      motion: m,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dt = (e.clientX - d.originX) * d.secPerPx;
    let start = d.origStart;
    let end = d.origEnd;

    if (d.mode === 'move') {
      const span = d.origEnd - d.origStart;
      start = Math.max(0, d.origStart + dt);
      end = start + span;
    } else if (d.mode === 'start') {
      start = Math.max(0, Math.min(d.origStart + dt, d.origEnd - MIN_SPAN));
    } else {
      end = Math.max(d.origStart + MIN_SPAN, d.origEnd + dt);
    }

    start = round1(start);
    end = round1(end);
    onUpdateMotion(d.id, { ...d.motion, startTime: start, endTime: end, duration: end - start });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleSwap = (index: number, dir: -1 | 1) => {
    const other = sequenced[index + dir];
    if (!other) return;
    onBeforeChange();
    onBatchUpdate(swapSequence(sequenced[index], other));
  };

  const handleRelease = (el: CanvasElement) => {
    onBeforeChange();
    onUpdateMotion(el.id, { ...el.motion!, sequence: 0 });
  };

  const handleCompact = () => {
    const updates = compactSequences(elements);
    if (updates.length === 0) return;
    onBeforeChange();
    onBatchUpdate(updates);
  };

  const hasGaps = sequenced.some((el, i) => (el.motion!.sequence ?? 0) !== i + 1);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold text-white">시퀀스 타임라인</h3>
        <div className="flex items-center gap-2">
          {hasGaps && (
            <button
              onClick={handleCompact}
              title="비어 있는 번호를 당겨 1부터 다시 매김 (순서 유지)"
              className="text-[9px] text-gray-600 hover:text-yellow-400 transition-colors"
            >
              번호 재정렬
            </button>
          )}
          <button
            onClick={onResetAll}
            title="모든 요소의 시퀀스와 모션 값을 삭제"
            className="text-[9px] text-gray-600 hover:text-red-400 transition-colors"
          >
            전체 초기화
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {sequenced.map((el, i) => {
          const m = el.motion!;
          const seq = m.sequence ?? 0;
          const start = m.startTime ?? 0;
          const end = m.endTime ?? start + (m.duration ?? 1);
          const color = seqColorOf(seq);
          const isActive = el.id === selectedId;
          const typeName =
            el.type === 'text' ? '텍스트' : el.type === 'shape' ? '도형' : el.type === 'image' ? '이미지' : '영상';

          return (
            <div
              key={el.id}
              onClick={() => onSelect(el.id)}
              className={`group flex items-center gap-1.5 px-1.5 py-1 rounded transition-colors cursor-pointer ${
                isActive ? 'bg-white/10 ring-1 ring-blue-500/50' : 'hover:bg-white/5'
              }`}
            >
              {/* 시퀀스 번호 */}
              <span
                className={`${color} text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded flex-shrink-0`}
              >
                {seq}
              </span>

              {/* ↑/↓ 순서 교환 */}
              <span className="flex flex-col flex-shrink-0 -my-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); handleSwap(i, -1); }}
                  disabled={i === 0}
                  title="순서 위로"
                  className="text-[8px] leading-[8px] text-gray-700 hover:text-white disabled:opacity-20 disabled:hover:text-gray-700"
                >
                  ▲
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleSwap(i, 1); }}
                  disabled={i === sequenced.length - 1}
                  title="순서 아래로"
                  className="text-[8px] leading-[8px] text-gray-700 hover:text-white disabled:opacity-20 disabled:hover:text-gray-700"
                >
                  ▼
                </button>
              </span>

              {/* 요소 이름 */}
              <span className="text-[10px] text-gray-400 w-9 flex-shrink-0 truncate">{typeName}</span>

              {/* 타임라인 트랙 — 바 드래그: 가운데 이동, 양끝 시작/종료 조정 */}
              <div className="flex-1 h-4 bg-[#1a1a1a] rounded-sm relative overflow-hidden">
                <div
                  className={`absolute top-0 h-full rounded-sm ${color} opacity-70 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing`}
                  style={{
                    left: `${(start / timelineMax) * 100}%`,
                    width: `${Math.max(((end - start) / timelineMax) * 100, 3)}%`,
                    touchAction: 'none',
                  }}
                  title="드래그: 이동 · 양끝 드래그: 시작/종료 조정"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    const bar = e.currentTarget as HTMLElement;
                    const track = bar.parentElement as HTMLElement;
                    const rect = bar.getBoundingClientRect();
                    const edge = Math.min(10, rect.width / 3);
                    const mode: DragMode =
                      e.clientX - rect.left < edge ? 'start' :
                      rect.right - e.clientX < edge ? 'end' : 'move';
                    beginDrag(e, el, mode, track.clientWidth);
                  }}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  {/* 양끝 핸들 시각 힌트 */}
                  <span className="absolute left-0 top-0 h-full w-[3px] bg-white/40 rounded-l-sm opacity-0 group-hover:opacity-100" />
                  <span className="absolute right-0 top-0 h-full w-[3px] bg-white/40 rounded-r-sm opacity-0 group-hover:opacity-100" />
                </div>
              </div>

              {/* 시간 표시 */}
              <span className="text-[8px] text-gray-600 w-14 flex-shrink-0 text-right tabular-nums">
                {start.toFixed(1)}-{end.toFixed(1)}s
              </span>

              {/* 시퀀스만 해제 (모션 값 보존) */}
              <button
                onClick={(e) => { e.stopPropagation(); handleRelease(el); }}
                title="시퀀스만 해제 (모션 시작값·타이밍은 보존)"
                className="flex-shrink-0 text-[9px] text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
