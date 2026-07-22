'use client';

/**
 * PreviewMonitor — UnoLive 데스크탑 캔버스 프리뷰 미러 플레이스홀더
 *
 * Phase 2A.2: 검은 16:9 박스 + 오버레이 배지
 * Phase 2+:   실제로는 데스크탑에서 보내는 프레임 스트림 (WebRTC/MSE) 렌더
 */

import { useEffect, useState } from 'react';
import { useMediaStore } from '@/lib/media/mediaStore';
import { ConsolePanel, formatDuration } from './_common';
import StandbyMonitor from './StandbyMonitor';
import ProgramMirror from './ProgramMirror';
import AtemStatusBadge from './AtemStatusBadge';

export default function PreviewMonitor() {
  const session = useMediaStore((s) => s.session);
  const programScene = useMediaStore((s) => s.getProgramScene());
  const [now, setNow] = useState(() => Date.now());

  // 1초 틱
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const recDur = formatDuration(session.recording.startedAt, now);
  const liveDur = formatDuration(session.live.startedAt, now);

  return (
    <ConsolePanel title="Program" padded={false}>
      <div className="px-4 pb-4 flex gap-3 items-stretch">
        {/* 좌측 4/5: 16:9 미러 창 */}
        <div
          className={`relative basis-4/5 rounded-lg overflow-hidden border bg-black ${
            programScene ? 'border-rose-500/60' : 'border-gray-800'
          }`}
          style={{ aspectRatio: '16 / 9' }}
        >
          {/* 실제 PGM 렌더링 (scene kind 별) */}
          <ProgramMirror scene={programScene} />

          {/* Scene 오버라이드 중 안내 배지 */}
          {programScene && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-rose-600/80 border border-rose-400/40 backdrop-blur-sm">
              <span className="text-[9px] font-bold tracking-wider text-white uppercase">
                Scene Override
              </span>
            </div>
          )}

          {/* 좌상: 현재 섹션 */}
          {session.currentSectionLabel && (
            <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/60 backdrop-blur-sm border border-white/10">
              <span className="text-[9px] font-bold tracking-wider text-gray-400 uppercase">
                Current
              </span>
              <p className="text-[11px] font-semibold text-white">
                {session.currentSectionLabel}
              </p>
            </div>
          )}

          {/* 우상: 녹화 / 라이브 / ATEM 배지 */}
          <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
            {session.recording.active && (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-600/90 border border-red-400/40">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-[10px] font-bold text-white tabular-nums">
                  REC {recDur}
                </span>
              </span>
            )}
            {session.live.active && (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-rose-600/90 border border-rose-400/40">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-[10px] font-bold text-white tabular-nums">
                  LIVE {liveDur}
                </span>
              </span>
            )}
            {/* ATEM 브릿지 상태 (offline / connecting / connected + DSK) */}
            <AtemStatusBadge />
          </div>

          {/* 우하: 시청자 수 */}
          {session.live.active && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded bg-black/60 backdrop-blur-sm border border-white/10">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span className="text-[11px] font-semibold text-white tabular-nums">
                {session.live.viewers}
              </span>
            </div>
          )}

          {/* 좌하: 해상도 */}
          <div className="absolute bottom-3 left-3 px-2 py-1 rounded bg-black/60 backdrop-blur-sm border border-white/10">
            <span className="text-[10px] font-mono text-gray-400">
              {session.recording.quality.toUpperCase()}
            </span>
          </div>
        </div>

        {/* 우측 1/5: Standby Monitor (내부에 Transition 포함) + 하단 예약 공간 */}
        <div className="basis-1/5 min-h-0 flex flex-col gap-2">
          <StandbyMonitor />

          {/* 액션 버튼(TAKE/SWAP/LIVE) 아래 예약 공간 — 향후 기능용 */}
          <div className="rounded-md border border-dashed border-[#2a2a2a] bg-[#141414] py-4 flex items-center justify-center">
            <span className="text-[9px] text-gray-600 tracking-wider uppercase">
              예약 공간
            </span>
          </div>
        </div>
      </div>
    </ConsolePanel>
  );
}
