'use client';

/**
 * LiveDebugPanel — 라이브 송출 실시간 상태 표시
 *
 * DevTools 를 못 여는 환경에서 ffmpeg / MediaRecorder / RTMP 파이프라인의
 * 상태를 눈으로 확인할 수 있게 대시보드에 인라인으로 띄운다.
 *
 * 표시 항목:
 *   - chunksReceived : MediaRecorder → IPC → ffmpeg stdin 에 도달한 chunk 수
 *   - bytesReceived  : 같은 경로 누적 바이트
 *   - ffmpeg stats   : frame / fps / bitrate (ffmpeg stderr 파싱)
 *   - 마지막 로그     : ffmpeg stderr 최근 5줄
 */

import { useEffect, useRef, useState } from 'react';

interface Status {
  running: boolean;
  pid?: number;
  rtmpUrl?: string;
  stats?: { frame?: number; fps?: number; bitrate?: number };
  chunksReceived?: number;
  bytesReceived?: number;
  logs?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBridge(): any {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).unolive?.live ?? null;
}

export default function LiveDebugPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const offRef = useRef<null | (() => void)>(null);

  // 상태 폴링 (1초)
  useEffect(() => {
    const bridge = getBridge();
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try {
        const s = bridge
          ? await bridge.status()
          : await fetch('/api/live/server/status', { cache: 'no-store' }).then((res) => res.json());
        if (!alive) return;
        setStatus(s);
        if (!bridge && Array.isArray(s.logs)) {
          setLogs(s.logs.map(String).slice(-6));
        }
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // ffmpeg stderr 실시간 수집
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    if (offRef.current) offRef.current();
    offRef.current = bridge.on('log', (payload: unknown) => {
      const line = String(payload).trim();
      if (!line) return;
      setLogs((prev) => {
        const next = [...prev, line];
        return next.slice(-6);
      });
    });
    return () => { offRef.current?.(); offRef.current = null; };
  }, []);

  // 송출 중이 아닐 땐 패널 비표시
  if (!status?.running) return null;

  const { chunksReceived = 0, bytesReceived = 0, stats = {} } = status;
  const mb = (bytesReceived / 1024 / 1024).toFixed(2);

  return (
    <div
      className="rounded-lg border border-[#2a2a2a] bg-[#0a0a0a]/95 backdrop-blur p-3 text-xs space-y-2 shadow-2xl"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: 320,
        zIndex: 9999,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          🔴 라이브 디버그
        </span>
        <span className="text-[10px] text-gray-600 font-mono">
          PID {status.pid}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded bg-[#151515] px-2 py-1.5">
          <div className="text-gray-500 text-[9px] uppercase">Chunks (IPC)</div>
          <div className="text-white font-mono font-bold">{chunksReceived}</div>
        </div>
        <div className="rounded bg-[#151515] px-2 py-1.5">
          <div className="text-gray-500 text-[9px] uppercase">Data 전송량</div>
          <div className="text-white font-mono font-bold">{mb} MB</div>
        </div>
        <div className="rounded bg-[#151515] px-2 py-1.5">
          <div className="text-gray-500 text-[9px] uppercase">ffmpeg FPS</div>
          <div className="text-white font-mono font-bold">{stats.fps?.toFixed(1) ?? '–'}</div>
        </div>
        <div className="rounded bg-[#151515] px-2 py-1.5">
          <div className="text-gray-500 text-[9px] uppercase">Bitrate</div>
          <div className="text-white font-mono font-bold">
            {stats.bitrate ? `${stats.bitrate.toFixed(0)} kb/s` : '–'}
          </div>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="rounded bg-black border border-[#1f1f1f] p-2 max-h-24 overflow-y-auto">
          <div className="text-[9px] text-gray-600 uppercase mb-1">ffmpeg stderr</div>
          {logs.map((line, i) => (
            <div key={i} className="text-[10px] font-mono text-gray-400 leading-tight whitespace-pre-wrap">
              {line}
            </div>
          ))}
        </div>
      )}

      <div className="text-[9px] text-gray-600 leading-tight">
        chunksReceived 증가 + fps ≥ 25 → 정상 송출 중.
        chunks=0 이면 MediaRecorder 문제, chunks &gt; 0 인데 ffmpeg 에러 있으면 아래 로그 참조.
      </div>
    </div>
  );
}
