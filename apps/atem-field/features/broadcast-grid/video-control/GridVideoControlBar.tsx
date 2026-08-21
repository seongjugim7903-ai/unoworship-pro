'use client';

// 송출그리드 — 선택된 영상 섹션 타일 하단에 뜨는 컴팩트 제어바.
//   좌: 재생/일시정지/정지 + 시크바 + 시간, 우: 출력 라우팅(메인/서브/방송) + 송출 버튼.
//   컴포저 VideoControlBar 의 기능을 그대로 쓰되(useGridVideoPlayback), 타일 크기에 맞춘 UI.
//   모든 조작은 stopPropagation — 타일 클릭(선택)/더블클릭(송출) 버블을 막는다.

import { useCallback, useRef } from 'react';
import type { CanvasRenderTarget, VideoElement } from '@/lib/canvasTypes';
import { useStore } from '@/lib/store';
import { undoManager } from '@/lib/undoManager';
import { useGridVideoPlayback } from './useGridVideoPlayback';

const ROUTING: { v: CanvasRenderTarget; label: string }[] = [
  { v: 'output', label: '메인' },
  { v: 'prompt', label: '서브' },
  { v: 'broadcast', label: '방송' },
];

function fmt(sec: number): string {
  if (!sec || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export default function GridVideoControlBar({
  video,
  itemId,
  sectionId,
  allElements,
  index,
  onBroadcast,
}: {
  video: VideoElement;
  itemId: string;
  sectionId: string;
  allElements: unknown[];
  index: number;
  onBroadcast: (index: number) => void;
}) {
  const currentSetlistId = useStore((s) => s.currentSetlistId);
  const updateElement = useStore((s) => s.updateElement);
  const setlistId = currentSetlistId ?? '';

  const pb = useGridVideoPlayback(video, { setlistId, itemId, sectionId, allElements });
  const seekBarRef = useRef<HTMLDivElement>(null);
  const progress = pb.duration > 0 ? (pb.currentTime / pb.duration) * 100 : 0;

  const seekAt = useCallback((clientX: number): number | undefined => {
    if (!seekBarRef.current || pb.duration <= 0) return undefined;
    const rect = seekBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * pb.duration;
  }, [pb.duration]);

  const onSeekDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    pb.seekStart();
    const t0 = seekAt(e.clientX);
    if (t0 !== undefined) pb.seek(t0);
    const move = (ev: MouseEvent) => { const t = seekAt(ev.clientX); if (t !== undefined) pb.seek(t); };
    const up = (ev: MouseEvent) => {
      const t = seekAt(ev.clientX);
      pb.seekEnd(t ?? pb.currentTime);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [pb, seekAt]);

  // 출력 라우팅 토글 — 컴포저 인스펙터와 동일 규약(visibleOn, 비어있으면 전체)
  const routingList: CanvasRenderTarget[] =
    video.visibleOn && video.visibleOn.length > 0 ? video.visibleOn : ROUTING.map((r) => r.v);
  const toggleRoute = useCallback((t: CanvasRenderTarget) => {
    if (!setlistId) return;
    const next = routingList.includes(t)
      ? routingList.filter((x) => x !== t)
      : [...new Set([...routingList, t])];
    undoManager.pushState(allElements as never[]);
    updateElement(setlistId, itemId, sectionId, video.id, { visibleOn: next });
  }, [setlistId, itemId, sectionId, video.id, routingList, allElements, updateElement]);

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-30 flex flex-col gap-1 bg-black/85 px-1.5 py-1 backdrop-blur-sm"
      onClick={stop}
      onDoubleClick={stop}
      onMouseDown={stop}
    >
      {/* 시크바 */}
      <div ref={seekBarRef} className="group relative flex h-3 cursor-pointer items-center" onMouseDown={onSeekDown}>
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-[#333]" />
        <div className="absolute left-0 h-1.5 rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
        <div className="absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-black bg-blue-400 shadow" style={{ left: `${progress}%` }} />
      </div>

      {/* 재생 컨트롤 + 시간 (좁은 타일에서 넘치지 않게 wrap) */}
      <div className="flex flex-wrap items-center gap-1">
        <button onClick={(e) => { stop(e); pb.play(); }} title="재생"
          className={`h-6 w-6 flex-shrink-0 rounded text-[11px] ${pb.isPlaying ? 'bg-blue-600 text-white' : 'bg-[#222] text-gray-300 hover:bg-[#333]'}`}>▶</button>
        <button onClick={(e) => { stop(e); pb.pause(); }} title="일시정지"
          className="h-6 w-6 flex-shrink-0 rounded bg-[#222] text-[11px] text-gray-300 hover:bg-[#333]">❚❚</button>
        <button onClick={(e) => { stop(e); pb.stop(); }} title="정지"
          className="h-6 w-6 flex-shrink-0 rounded bg-[#222] text-[11px] text-gray-300 hover:bg-[#333]">■</button>
        {/* 사운드(음소거) 토글 — 출력 창 소리 + 요소 상태 반영(컴포저 캔버스에도 적용) */}
        <button onClick={(e) => { stop(e); pb.toggleMute(); }} title={pb.muted ? '음소거 해제' : '음소거'}
          className={`h-6 w-6 flex-shrink-0 rounded text-[11px] ${pb.muted ? 'bg-red-600 text-white' : 'bg-[#222] text-gray-300 hover:bg-[#333]'}`}>
          {pb.muted ? '🔇' : '🔊'}
        </button>
        <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-gray-300">
          {fmt(pb.currentTime)}<span className="text-gray-600"> / {fmt(pb.duration)}</span>
        </span>
      </div>

      {/* 출력 라우팅(편집) + 송출 (좁은 타일에서 넘치지 않게 wrap) */}
      <div className="flex flex-wrap items-center gap-1">
        {ROUTING.map((r) => {
          const on = routingList.includes(r.v);
          return (
            <button key={r.v} onClick={(e) => { stop(e); toggleRoute(r.v); }} title={`출력: ${r.label}`}
              className={`h-6 flex-shrink-0 rounded px-1.5 text-[9px] font-semibold ${on ? 'bg-emerald-600 text-white' : 'bg-[#222] text-gray-500 hover:bg-[#333]'}`}>
              {r.label}
            </button>
          );
        })}
        <button onClick={(e) => { stop(e); onBroadcast(index); }} title="이 위치에서 송출 (Enter)"
          className="ml-auto h-6 flex-shrink-0 rounded bg-red-600 px-2 text-[10px] font-bold text-white hover:bg-red-500">
          송출 {index + 1}
        </button>
      </div>
    </div>
  );
}
