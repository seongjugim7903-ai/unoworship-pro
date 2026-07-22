'use client';

/**
 * RecordingPanel — 라이브와 독립적으로 동작하는 로컬 녹화 제어.
 */

import { useMediaStore } from '@/lib/media/mediaStore';
import { useLocalRecording } from '@/hooks/recording/useLocalRecording';
import { useClipMarkerRecording } from '@/hooks/recording/useClipMarkerRecording';
import { ConsolePanel, formatBytes } from './_common';
import { CheckCircle2, FolderOpen } from 'lucide-react';

interface Props {
  compositorStream: MediaStream | null;
}

export default function RecordingPanel({ compositorStream }: Props) {
  const recording = useMediaStore((s) => s.session.recording);
  useClipMarkerRecording({ stream: compositorStream });
  const {
    isAvailable,
    unavailableReason,
    isStarting,
    isRecording,
    elapsedFormatted,
    error,
    audioWarning,
    canRevealOutput,
    start,
    stop,
    revealOutput,
  } = useLocalRecording({ stream: compositorStream });

  const fileSize = formatBytes(recording.fileSize);
  const buttonDisabled = isStarting || (!isRecording && !isAvailable);
  const buttonLabel = isRecording ? '녹화 종료' : isStarting ? '준비 중' : '녹화 시작';
  const uploadReady = !recording.active
    && recording.fileSize > 0
    && !!recording.fileName
    && !recording.lastError;

  return (
    <ConsolePanel
      title="Recording"
      hint="라이브와 별도 · PGM 로컬 녹화"
      tone={recording.active ? 'rec' : 'neutral'}
      action={
        <span
          className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider ${
            recording.active ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400'
          }`}
        >
          {recording.active ? '● REC' : '준비중'}
        </span>
      }
    >
      <div>
        <p className="text-[9px] font-semibold tracking-wider text-gray-500 uppercase">
          경과 시간
        </p>
        <p
          className={`text-xl font-bold tabular-nums leading-tight ${
            recording.active ? 'text-red-400' : 'text-gray-500'
          }`}
        >
          {elapsedFormatted}
        </p>
      </div>

      <div className="mt-2 space-y-1">
        <Stat label="용량" value={fileSize} />
        <Stat label="품질" value={recording.quality.toUpperCase()} />
        <Stat label="파일명" value={recording.fileName ?? '대기'} />
      </div>

      <button
        onClick={() => {
          void (isRecording ? stop() : start());
        }}
        disabled={buttonDisabled}
        className={`mt-3 w-full h-9 rounded text-[11px] font-bold transition-colors ${
          isRecording
            ? 'bg-red-600 hover:bg-red-500 text-white'
            : 'bg-gray-100 hover:bg-white text-gray-950 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed'
        }`}
        title={unavailableReason ?? buttonLabel}
      >
        {buttonLabel}
      </button>

      {uploadReady && (
        <div className="mt-2 rounded border border-emerald-700/40 bg-emerald-950/30 px-2 py-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-300" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-emerald-100">
                유튜브 업로드용 체크 완료
              </p>
              <p className="mt-0.5 text-[9px] leading-relaxed text-emerald-200/70">
                파일 생성과 용량 검증이 완료되었습니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {canRevealOutput && (
        <button
          type="button"
          onClick={() => { void revealOutput(); }}
          className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded border border-gray-700 bg-[#15171e] text-[10px] font-bold text-gray-200 transition-colors hover:bg-[#1d2029]"
        >
          <FolderOpen size={14} />
          녹화 파일 위치 열기
        </button>
      )}

      {recording.outputPath && (
        <p className="mt-2 truncate text-[9px] text-gray-500" title={recording.outputPath}>
          {recording.outputPath}
        </p>
      )}

      {!recording.active && unavailableReason && (
        <p className="mt-2 rounded border border-amber-700/30 bg-amber-900/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-200">
          {unavailableReason}
        </p>
      )}

      {audioWarning && (
        <p className="mt-2 rounded border border-amber-700/30 bg-amber-900/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-200">
          {audioWarning}
        </p>
      )}

      {error && (
        <p className="mt-2 rounded border border-red-700/30 bg-red-900/10 px-2 py-1.5 text-[10px] leading-relaxed text-red-200">
          {error}
        </p>
      )}
    </ConsolePanel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded bg-[#15171e] border border-gray-800 px-2 py-1">
      <p className="text-[8px] font-semibold tracking-wider text-gray-500 uppercase">{label}</p>
      <p className="text-[10px] font-bold text-gray-200 tabular-nums truncate ml-2">{value}</p>
    </div>
  );
}
