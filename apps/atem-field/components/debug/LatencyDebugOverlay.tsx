'use client';

import type { LatencyDiagnosticEntry } from '@/lib/latencyDiagnostics';
import { formatLatencyMs } from '@/lib/latencyDiagnostics';

interface LatencyDebugOverlayProps {
  enabled: boolean;
  surface: string;
  entries: LatencyDiagnosticEntry[];
}

export default function LatencyDebugOverlay({
  enabled,
  surface,
  entries,
}: LatencyDebugOverlayProps) {
  if (!enabled) return null;

  const latest = entries[0];

  return (
    <div className="pointer-events-none fixed left-3 top-3 z-[999999] w-[330px] rounded-md border border-emerald-400/30 bg-black/78 p-3 font-mono text-[11px] leading-snug text-emerald-50 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
        <span className="text-[12px] font-semibold text-white">UnoLive Latency</span>
        <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-emerald-200">{surface}</span>
      </div>

      {latest ? (
        <>
          <div className="mb-2 grid grid-cols-5 gap-1 text-center">
            <Metric label="전체" value={formatLatencyMs(latest.totalMs)} />
            <Metric label="제어" value={formatLatencyMs(latest.controlPrepMs)} />
            <Metric label="송수신" value={formatLatencyMs(latest.outputWaitMs)} />
            <Metric label="렌더" value={formatLatencyMs(latest.renderMs)} />
            <Metric label="릴레이" value={formatLatencyMs(latest.relayMs)} />
          </div>

          <div className="space-y-0.5 text-emerald-100/80">
            <div>type: {latest.messageType} / {latest.renderMode}</div>
            <div>targets: {latest.targetSummary}</div>
            {typeof latest.elementCount === 'number' && <div>elements: {latest.elementCount}</div>}
            {typeof latest.frameBytes === 'number' && <div>frame: {(latest.frameBytes / 1024).toFixed(0)}KB</div>}
          </div>

          <div className="mt-2 max-h-[122px] overflow-hidden border-t border-white/10 pt-2">
            {entries.slice(0, 5).map((entry) => (
              <div key={entry.localId} className="grid grid-cols-[74px_68px_56px_56px] gap-1 text-emerald-100/70">
                <span className="truncate">{entry.messageType}</span>
                <span className="truncate">{entry.renderMode}</span>
                <span>{formatLatencyMs(entry.totalMs)}</span>
                <span>{formatLatencyMs(entry.renderMs)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-emerald-100/70">송출 메시지를 기다리는 중입니다.</div>
      )}

      <div className="mt-2 border-t border-white/10 pt-2 text-[10px] text-emerald-100/50">
        끄기: URL에 ?debugLatency=0
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/5 px-1.5 py-1">
      <div className="text-[9px] text-emerald-100/45">{label}</div>
      <div className="text-[12px] font-semibold text-white">{value}</div>
    </div>
  );
}
