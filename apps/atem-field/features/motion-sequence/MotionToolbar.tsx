'use client';

// 모션 패널 상단 도구 모음 — ▶ 미리보기 재생 + 순차 자동 배치

import { useState } from 'react';
import { useMotionPreview, startMotionPreview, stopMotionPreview } from './previewStore';

interface MotionToolbarProps {
  /** 시퀀스가 부여된 요소 수 (순차 배치 활성 조건) */
  sequencedCount: number;
  /** 섹션에 재생할 모션이 하나라도 있는지 (미리보기 활성 조건) */
  canPreview: boolean;
  onStagger: (interval: number, duration: number) => void;
}

export default function MotionToolbar({ sequencedCount, canPreview, onStagger }: MotionToolbarProps) {
  const { playing } = useMotionPreview();
  const [interval, setInterval] = useState('0.3');
  const [duration, setDuration] = useState('0.6');

  const parseOr = (raw: string, fallback: number) => {
    const n = parseFloat(raw);
    return isNaN(n) || n < 0 ? fallback : n;
  };

  return (
    <div className="flex flex-col gap-2 pb-3 border-b border-[#222]">
      {/* ▶ 미리보기 */}
      <button
        onClick={() => (playing ? stopMotionPreview() : startMotionPreview())}
        disabled={!canPreview && !playing}
        title={canPreview ? '에디터 캔버스에서 모션을 재생합니다 (송출 없음)' : '재생할 모션이 없습니다'}
        className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
          playing
            ? 'bg-red-600/30 border-red-500 text-red-300 hover:bg-red-600/40'
            : canPreview
              ? 'bg-purple-600/30 border-purple-500 text-purple-300 hover:bg-purple-600/40'
              : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-600 cursor-not-allowed'
        }`}
      >
        {playing ? (
          <>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="5" width="14" height="14" rx="1" />
            </svg>
            정지
          </>
        ) : (
          <>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4l14 8-14 8V4z" />
            </svg>
            미리보기 재생
          </>
        )}
      </button>

      {/* 순차 자동 배치 */}
      {sequencedCount > 1 && (
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1 flex-1 min-w-0">
            <span className="text-[9px] text-gray-500 flex-shrink-0">간격</span>
            <input
              type="number"
              value={interval}
              min={0}
              step={0.1}
              onChange={(e) => setInterval(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="w-full min-w-0 bg-[#1a1a1a] border border-[#333] rounded px-1.5 py-1 text-[11px] text-white
                         focus:outline-none focus:border-yellow-500
                         [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </label>
          <label className="flex items-center gap-1 flex-1 min-w-0">
            <span className="text-[9px] text-gray-500 flex-shrink-0">길이</span>
            <input
              type="number"
              value={duration}
              min={0.1}
              step={0.1}
              onChange={(e) => setDuration(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="w-full min-w-0 bg-[#1a1a1a] border border-[#333] rounded px-1.5 py-1 text-[11px] text-white
                         focus:outline-none focus:border-yellow-500
                         [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </label>
          <button
            onClick={() => onStagger(parseOr(interval, 0.3), parseOr(duration, 0.6))}
            title="시퀀스 순서대로 시작 시간을 간격만큼 어긋나게 자동 배치"
            className="flex-shrink-0 px-2 py-1 rounded text-[10px] font-bold bg-yellow-600/20 border border-yellow-600/50
                       text-yellow-300 hover:bg-yellow-600/30 transition-colors"
          >
            순차 배치
          </button>
        </div>
      )}
    </div>
  );
}
