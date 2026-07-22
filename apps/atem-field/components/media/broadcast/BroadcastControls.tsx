'use client';

/**
 * BroadcastControls — 웹 대시보드의 원클릭 라이브 방송 제어
 *
 * ─── 설계 철학 ─────────────────────────────────────────
 * 웹 대시보드는 "별도 담당자가 있는 교회의 OBS 대체"입니다.
 * 원맨 방송이라면 UnoLive 데스크탑에서 직접 제어하지만,
 * 담당자가 별도로 있는 교회라면 이 웹 대시보드에서 방송 전체
 * 라이프사이클을 제어할 수 있습니다.
 *
 * 웹 대시보드의 범위는 사소하고 강력합니다:
 *   1) 라이브 송출 시작/종료 (원클릭)
 *   2) 라이브 도중 섹션 마커 찍기 (특별연주/찬양대/설교 …)
 *   3) 세션 종료 후 라이브러리에서 편집 + 업로드
 *
 * 자막 전환, 카메라 프리셋, 오디오 믹싱, 하단3분할 같은
 * 송출 런타임 제어는 여전히 UnoLive 데스크탑이 담당합니다.
 * ──────────────────────────────────────────────────────
 *
 * 게이트:
 *   - ATEM field copy: login/session auth is bypassed for live venue testing.
 *   - session.syncStatus is not used as a gate because the broadcast PC can
 *     receive final PGM directly from ATEM USB Out.
 *
 * 안전장치:
 *   - 시작: 2단계 확인 (확인 → 시작)
 *   - 종료: 2단계 확인 (확인 → 종료) · 활성 클립이 있으면 함께 종료됨을 경고
 */

import { useEffect, useState } from 'react';
import { useMediaStore } from '@/lib/media/mediaStore';
import { ConsolePanel, formatDuration } from './_common';
import { useLiveStream } from '@/hooks/broadcast/useLiveStream';
import LiveSetupModal from '@/components/composer/broadcast/LiveSetupModal';

type ConfirmState = null | 'start' | 'stop';

interface Props {
  compositorStream: MediaStream | null;
}

export default function BroadcastControls({ compositorStream }: Props) {
  const session = useMediaStore((s) => s.session);
  const setSessionSyncStatus = useMediaStore((s) => s.setSessionSyncStatus);
  const canControl = true;
  // [FEATURE: YOUTUBE_LIVE / TWITCH_LIVE]
  //   mock 세션 플래그(session.live.active) 는 UI 상태 표시용으로만 유지하고,
  //   실제 송출은 useLiveStream 경로 (ffmpeg RTMP). 둘을 동기화한다.
  const startLiveMock = useMediaStore((s) => s.startLiveSession);
  const endLiveMock = useMediaStore((s) => s.endLiveSession);

  const {
    liveStatus,
    liveError,
    isModalOpen,
    openModal,
    closeModal,
    stop: stopReal,
  } = useLiveStream();

  const isRealLive = liveStatus === 'live';

  // 실제 ffmpeg 송출 상태를 mock 세션에도 반영 → MiniBadge 등 기존 UI 동작 유지
  useEffect(() => {
    if (isRealLive && !session.live.active) {
      setSessionSyncStatus('connected');
      startLiveMock();
    } else if (!isRealLive && session.live.active) {
      endLiveMock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealLive]);

  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const isOn = session.live.active;
  const disabled = !canControl;
  const duration = isOn
    ? formatDuration(session.live.startedAt, now)
    : '--:--:--';

  const gateReason = !canControl
    ? '권한 없음 — 현장 운영 권한이 필요합니다'
    : null;

  // 시작: LiveSetupModal 을 열어 스트림 키/장치 선택 → 모달에서 실제 ffmpeg 기동
  const handleStart = () => {
    if (disabled) return;
    setConfirm(null);
    openModal();
  };
  // 종료: 실제 ffmpeg 종료 + mock 세션도 종료 (useEffect 로 동기화되지만 명시 호출)
  const handleStop = async () => {
    if (disabled) return;
    await stopReal();
    endLiveMock();
    setConfirm(null);
  };

  return (
    <>
    <ConsolePanel
      title="Live Broadcast Control"
      hint="원클릭 · YouTube/RTMP 라이브 송출"
      tone={isOn ? 'live' : 'neutral'}
      action={
        <span
          className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider ${
            isOn
              ? 'bg-rose-600 text-white animate-pulse'
              : 'bg-gray-800 text-gray-400'
          }`}
        >
          {isOn ? '● ON AIR' : 'OFF'}
        </span>
      }
    >
      {/* ── 타이머 + 상태 라벨 (컴팩트) ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold tracking-wider text-gray-500 uppercase">
            방송 경과
          </p>
          <p
            className={`text-2xl font-bold tabular-nums leading-tight ${
              isOn ? 'text-rose-400' : 'text-gray-500'
            }`}
          >
            {duration}
          </p>
        </div>

        {/* 미니 인디케이터 */}
        <div className="flex flex-col gap-1 shrink-0">
          <MiniBadge on={session.recording.active} label="REC" tone="rec" />
          <MiniBadge on={session.live.active} label="LIVE" tone="live" />
        </div>
      </div>

      {/* ── 게이트 경고 (권한/연결) ── */}
      {gateReason && (
        <div className="mt-3 rounded border border-amber-700/40 bg-amber-900/20 px-3 py-2 flex items-start gap-2">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-amber-400 mt-0.5 shrink-0"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="text-[10px] text-amber-200 leading-relaxed">
            {gateReason}
          </p>
        </div>
      )}

      {/* ── 주요 CTA ── */}
      <div className="mt-2">
        {!isOn && confirm !== 'start' && (
          <button
            onClick={() => setConfirm('start')}
            disabled={disabled}
            className="w-full h-10 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white text-[12px] font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white" />
            라이브 방송 시작
          </button>
        )}

        {!isOn && confirm === 'start' && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-900/20 p-3">
            <p className="text-[11px] font-semibold text-rose-200">
              라이브 방송을 시작하시겠습니까?
            </p>
            <p className="mt-1 text-[10px] text-gray-400 leading-relaxed">
              설정된 YouTube 스트림 키로 송출이 연결됩니다.
              로컬 녹화는 우측 Recording 패널에서 별도로 시작합니다.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleStart}
                className="flex-1 h-9 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition-colors"
              >
                예, 시작합니다
              </button>
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 h-9 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {isOn && confirm !== 'stop' && (
          <button
            onClick={() => setConfirm('stop')}
            disabled={disabled}
            className="w-full h-10 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white text-[12px] font-bold flex items-center justify-center gap-2 border border-rose-500/40 transition-colors"
          >
            <span className="w-3 h-3 rounded-sm bg-rose-500" />
            라이브 방송 종료
          </button>
        )}

        {isOn && confirm === 'stop' && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-900/20 p-3">
            <p className="text-[11px] font-semibold text-rose-200">
              라이브 방송을 종료하시겠습니까?
            </p>
            <p className="mt-1 text-[10px] text-gray-400 leading-relaxed">
              YouTube 라이브 송출이 종료됩니다.
              별도로 진행 중인 로컬 녹화는 자동 종료되지 않습니다.
              예배순서 마킹도 좌측 패널에서 별도로 종료합니다.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleStop}
                className="flex-1 h-9 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition-colors"
              >
                예, 종료합니다
              </button>
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 h-9 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>

    </ConsolePanel>
    {/* [FEATURE: YOUTUBE_LIVE] 실제 라이브 설정 모달 */}
    {isModalOpen && (
      <LiveSetupModal
        isOpen={isModalOpen}
        onClose={closeModal}
        compositorStream={compositorStream}
      />
    )}
    {liveError && (
      <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
        ⚠ {liveError}
      </div>
    )}
    {/* [FEATURE: YOUTUBE_LIVE] 송출 실시간 지표는 우측 AnalyticsPanel 에 통합됨 */}
    </>
  );
}

function MiniBadge({
  on,
  label,
  tone,
}: {
  on: boolean;
  label: string;
  tone: 'rec' | 'live';
}) {
  const color = on
    ? tone === 'rec'
      ? 'bg-red-600 text-white'
      : 'bg-rose-600 text-white animate-pulse'
    : 'bg-gray-800 text-gray-500';
  return (
    <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider text-center ${color}`}>
      {on ? `● ${label}` : label}
    </span>
  );
}
