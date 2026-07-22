'use client';

/**
 * AnalyticsPanel — 라이브 방송 분석 (OBS + YouTube Studio 스타일)
 *
 * Phase 2A.3 목 데이터:
 *   - 동시 접속자 / 최고 동접 / 평균 동접
 *   - 좋아요 / 채팅 속도
 *   - 방송 시간 / 비트레이트 / 연결 건강도
 *
 * Phase 2+ 에서 실제 YouTube Data API & 데스크탑 엔진 통계로 교체.
 */

import { useEffect, useRef, useState } from 'react';
import { useMediaStore } from '@/lib/media/mediaStore';
import { ConsolePanel, formatDuration } from './_common';

const HEALTH_STYLE = {
  good:    { label: '정상', color: 'text-green-400'  },
  warning: { label: '주의', color: 'text-amber-400'  },
  bad:     { label: '불량', color: 'text-red-400'    },
} as const;

// ─────────────────────────────────────────
// [FEATURE: YOUTUBE_LIVE] 실제 ffmpeg/RTMP 상태 폴링
// ─────────────────────────────────────────
interface LiveRuntimeStatus {
  running:        boolean;
  pid?:           number;
  rtmpUrl?:       string;
  chunksReceived?: number;
  bytesReceived?:  number;
  stats?: { frame?: number; fps?: number; bitrate?: number };
  logs?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBridge(): any {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).unolive?.live ?? null;
}

function useLiveRuntime() {
  const [status, setStatus] = useState<LiveRuntimeStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const offRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    const bridge = getBridge();
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try {
        if (bridge) {
          setStatus(await bridge.status());
          return;
        }
        const res = await fetch('/api/live/server/status', { cache: 'no-store' });
        const next = await res.json() as LiveRuntimeStatus;
        if (!alive) return;
        setStatus(next);
        if (Array.isArray(next.logs)) {
          setLogs(next.logs.map(String).slice(-8));
        }
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    offRef.current?.();
    offRef.current = bridge.on('log', (payload: unknown) => {
      const line = String(payload).trim();
      if (!line) return;
      setLogs((prev) => [...prev, line].slice(-8));
    });
    return () => { offRef.current?.(); offRef.current = null; };
  }, []);

  return { status, logs };
}

/**
 * 탭 안에서 래퍼 없이 쓰기 위한 바디.
 */
export function AnalyticsBody() {
  const live = useMediaStore((s) => s.session.live);
  // [FEATURE: YOUTUBE_LIVE] 실제 ffmpeg/RTMP 지표 (Electron 안에서만 값이 들어옴)
  const { status: rtStatus, logs: rtLogs } = useLiveRuntime();

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Phase 2A.3 파생 목 데이터 ──────────────────────────
  const isLive = live.active;
  const currentViewers = isLive ? live.viewers : 0;
  // 목: 현재치의 1.3~1.5 배를 최고, 0.75 배를 평균으로 가정
  const peakViewers = isLive ? Math.round(currentViewers * 1.42) : 0;
  const avgViewers = isLive ? Math.round(currentViewers * 0.78) : 0;
  const likes = isLive ? Math.round(currentViewers * 0.46) : 0;
  const chatPerMin = isLive ? Math.max(1, Math.round(currentViewers / 14)) : 0;
  const avgWatchSec = isLive ? Math.round(formatSecFromStarted(live.startedAt, now) * 0.62) : 0;

  const duration = formatDuration(live.startedAt, now);
  const health = HEALTH_STYLE[live.health];

  return (
    <div className="space-y-2.5">
      {/* 큰 현재 동접 */}
      <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2.5">
        <p className="text-[9px] font-bold tracking-wider text-violet-400 uppercase">
          동시 접속자
        </p>
        <p className="mt-0.5 text-2xl font-bold text-white tabular-nums leading-tight">
          {isLive ? currentViewers.toLocaleString() : '--'}
          <span className="ml-1 text-[10px] font-medium text-gray-500">명</span>
        </p>
      </div>

      {/* 2x2 그리드: 최고/평균/좋아요/채팅 */}
      <div className="grid grid-cols-2 gap-1.5">
        <StatCell label="최고 동접" value={isLive ? peakViewers.toLocaleString() : '--'} unit="명" />
        <StatCell label="평균 동접" value={isLive ? avgViewers.toLocaleString() : '--'} unit="명" />
        <StatCell label="좋아요" value={isLive ? likes.toLocaleString() : '--'} icon="heart" />
        <StatCell label="채팅 속도" value={isLive ? `${chatPerMin}` : '--'} unit="/분" icon="chat" />
      </div>

      {/* 구분선 */}
      <div className="h-px bg-gray-800" />

      {/* 런타임 통계 (방송 시간 · 비트레이트 · 건강도) */}
      <div className="space-y-1">
        <MetaRow label="방송 시간" value={duration} mono />
        <MetaRow
          label="비트레이트"
          value={
            rtStatus?.running && rtStatus?.stats?.bitrate
              ? `${(rtStatus.stats.bitrate / 1000).toFixed(2)} Mbps (실측)`
              : isLive ? `${(live.bitrate / 1000).toFixed(1)} Mbps` : '--'
          }
          mono
        />
        <MetaRow
          label="평균 시청 시간"
          value={isLive ? formatAvgWatch(avgWatchSec) : '--'}
          mono
        />
        <MetaRow
          label="연결 건강도"
          value={`● ${health.label}`}
          valueClass={health.color}
        />
      </div>

      {/* [FEATURE: YOUTUBE_LIVE] RTMP 송출 실시간 로그 — ffmpeg 돌고 있을 때만 표시 */}
      {rtStatus?.running && (
        <>
          <div className="h-px bg-gray-800" />
          <div className="space-y-1">
            <p className="text-[9px] font-bold tracking-wider text-rose-400 uppercase">
              🔴 송출 엔진 (ffmpeg RTMP)
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <StatCell
                label="FPS"
                value={rtStatus.stats?.fps?.toFixed(1) ?? '–'}
              />
              <StatCell
                label="전송량"
                value={
                  rtStatus.bytesReceived != null
                    ? `${(rtStatus.bytesReceived / 1024 / 1024).toFixed(1)}`
                    : '–'
                }
                unit="MB"
              />
              <StatCell
                label="Chunks (IPC)"
                value={String(rtStatus.chunksReceived ?? 0)}
              />
              <StatCell
                label="인코더"
                value="H.264"
              />
            </div>
            {rtLogs.length > 0 && (
              <details className="mt-1 text-[10px]">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-300">
                  ffmpeg 로그 ({rtLogs.length}줄)
                </summary>
                <div className="mt-1 max-h-28 overflow-y-auto rounded bg-black border border-[#1f1f1f] p-2 font-mono">
                  {rtLogs.map((line, i) => (
                    <div key={i} className="text-gray-400 leading-tight whitespace-pre-wrap">
                      {line}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 기본 export: 단독으로도 쓸 수 있게 ConsolePanel 로 감싼 버전.
 */
export default function AnalyticsPanel() {
  return (
    <ConsolePanel title="Analytics" hint="YouTube Live 통계 미러">
      <AnalyticsBody />
    </ConsolePanel>
  );
}

// ─────────────────────────────────────────
// 내부 빌딩블록
// ─────────────────────────────────────────
function StatCell({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: 'heart' | 'chat';
}) {
  return (
    <div className="rounded bg-[#15171e] border border-gray-800 px-2 py-1.5">
      <div className="flex items-center gap-1">
        {icon === 'heart' && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="text-rose-400">
            <path d="M12 21s-8-4.5-8-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-8 11-8 11z" />
          </svg>
        )}
        {icon === 'chat' && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-sky-400">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
        <p className="text-[8px] font-semibold tracking-wider text-gray-500 uppercase">
          {label}
        </p>
      </div>
      <p className="mt-0.5 text-[13px] font-bold text-gray-100 tabular-nums leading-tight">
        {value}
        {unit && <span className="ml-0.5 text-[9px] font-medium text-gray-500">{unit}</span>}
      </p>
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono = false,
  valueClass = 'text-gray-200',
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-[9px] font-semibold tracking-wider text-gray-500 uppercase">
        {label}
      </span>
      <span
        className={`text-[10px] font-bold tabular-nums ${mono ? 'font-mono' : ''} ${valueClass}`}
      >
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────
// 포맷 헬퍼
// ─────────────────────────────────────────
function formatSecFromStarted(startedAt: number | null, now: number): number {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

function formatAvgWatch(sec: number): string {
  if (sec <= 0) return '--';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}분 ${String(s).padStart(2, '0')}초`;
}
