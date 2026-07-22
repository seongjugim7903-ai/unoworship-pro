'use client';

/**
 * LiveSetupModal — 라이브 송출 설정 모달
 *
 * YouTube Live 및 커스텀 RTMP 엔드포인트 설정:
 *  - 제공자 선택 (YouTube / Custom RTMP)
 *  - 스트림 URL (YouTube 기본값 자동 입력)
 *  - 스트림 키 (비밀번호 필드)
 *  - 방송 제목
 *  - 공개 설정 (YouTube만)
 *  - 저지연 모드 (YouTube만)
 *
 * 확인 시 store에 저장 + isLive = true → 모달 닫힘
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLiveStream } from '@/hooks/broadcast/useLiveStream';
import type { LivePrivacy } from '@/lib/broadcast/broadcastTypes';
import { useBroadcastStore } from '@/lib/broadcast/broadcastStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /**
   * [FEATURE: SCENE_RACK] 대시보드 BroadcastControls 에서 usePgmCompositorStream
   * 으로 만든 "PGM + Scene" 합성 MediaStream. 이 스트림을 MediaRecorder 에 넘겨
   * RTMP 송출 → Scene Take 가 시청자에게 반영됨.
   * 없으면 기존 DOM 스캔 방식으로 폴백.
   */
  compositorStream?: MediaStream | null;
}

export default function LiveSetupModal({ isOpen, onClose, compositorStream }: Props) {
  const {
    liveProvider,
    youtubeConfig,
    customConfig,
    liveError,
    updateYouTubeConfig,
    updateCustomConfig,
    isLiveConfigValid,
    start,
  } = useLiveStream();

  const setLiveProvider = useBroadcastStore((s) => s.setLiveProvider);

  const [mounted, setMounted] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // [FEATURE: YOUTUBE_LIVE] ffmpeg 설치 상태 + PGM 스트림
  type LiveBridge = {
    checkFfmpeg: () => Promise<{ installed: boolean; path?: string; version?: string }>;
  };
  const [ffmpegStatus, setFfmpegStatus] = useState<{ installed: boolean; version?: string } | null>(null);
  const [liveBridgeAvailable, setLiveBridgeAvailable] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);

  // PGM 스트림 — 대시보드의 <video srcObject> 에 이미 붙어있는 MediaStream 을 재사용.
  //   useBroadcastVideoStream() 를 또 호출하면 WebRTC peer 가 2개 생겨서
  //   기존 PGM 미러가 끊긴다. 그래서 DOM 에서 직접 가져온다.
  const [pgmStream, setPgmStream] = useState<MediaStream | null>(null);
  const [pgmConnected, setPgmConnected] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // [FEATURE: SCENE_RACK] compositorStream 이 있으면 우선 사용 (PGM + Scene 합성).
    //   없을 때만 기존 DOM 스캔 폴백.
    if (compositorStream && compositorStream.getVideoTracks().length > 0) {
      setPgmStream(compositorStream);
      setPgmConnected(true);
      return;
    }
    let alive = true;
    const poll = () => {
      if (!alive) return;
      const videos = Array.from(document.querySelectorAll('video'));
      const pgmVideo = videos.find((v) => {
        const s = v.srcObject;
        return s instanceof MediaStream && s.getTracks().length > 0;
      });
      if (pgmVideo?.srcObject instanceof MediaStream) {
        const stream = pgmVideo.srcObject;
        setPgmStream(stream);
        setPgmConnected(pgmVideo.readyState >= 2 && !pgmVideo.paused);
      }
    };
    poll();
    const id = setInterval(poll, 500);
    return () => { alive = false; clearInterval(id); };
  }, [isOpen, compositorStream]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setShowKey(false);
    setFfmpegStatus(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bridge = (typeof window !== 'undefined' ? (window as any).unolive?.live : null) as LiveBridge | null;
    setLiveBridgeAvailable(!!bridge);

    let cancelled = false;
    if (!bridge) {
      fetch('/api/live/server/check', { cache: 'no-store' })
        .then((res) => res.json())
        .then((status) => {
          if (!cancelled) setFfmpegStatus(status);
        })
        .catch(() => {
          if (!cancelled) setFfmpegStatus({ installed: false });
        });
      return () => { cancelled = true; };
    }

    bridge
      .checkFfmpeg()
      .then((status) => {
        if (!cancelled) setFfmpegStatus(status);
      })
      .catch(() => {
        if (!cancelled) setFfmpegStatus({ installed: false });
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  const handleStart = useCallback(async () => {
    setStarting(true);
    try {
      const ok = await start(pgmStream);
      if (ok) onClose();
    } finally {
      setStarting(false);
    }
  }, [isLiveConfigValid, start, onClose, pgmStream]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  const isYouTube = liveProvider === 'youtube';
  const canStart = isLiveConfigValid()
    && !starting;

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-[92vw] max-h-[90vh] overflow-y-auto bg-[#111] border border-[#2a2a2a] rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f1f1f]">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 12 12">
              <circle cx="6" cy="6" r="5" fill="#ef4444" />
            </svg>
            <h2 className="text-sm font-semibold text-white">라이브 송출 설정</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#1f1f1f] text-gray-400 hover:text-white transition-colors"
            title="닫기 (ESC)"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 space-y-4">
          {/* 제공자 선택 */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-2">
              송출 대상
            </label>
            <div className="flex gap-2">
              <ProviderChip
                active={isYouTube}
                onClick={() => setLiveProvider('youtube')}
                label="YouTube Live"
              />
              <ProviderChip
                active={!isYouTube}
                onClick={() => {
                  setLiveProvider('custom');
                  // Twitch 프리셋 자동 세팅 (비워져 있을 때만)
                  if (!customConfig.streamUrl) {
                    updateCustomConfig({ streamUrl: 'rtmp://live.twitch.tv/app' });
                  }
                }}
                label="Twitch / 커스텀 RTMP"
              />
            </div>
          </div>

          {/* [FEATURE: YOUTUBE_LIVE] ffmpeg 설치 상태 */}
          {liveBridgeAvailable === false && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <p className="font-semibold mb-1">윈도우 브라우저 송출 모드입니다</p>
              <p>
                이 컴퓨터의 ATEM USB 영상을 브라우저가 캡처하고, 같은 LAN의 맥미니 서버가 ffmpeg로 YouTube/RTMP에 송출합니다.
              </p>
            </div>
          )}

          {ffmpegStatus && !ffmpegStatus.installed && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <p className="font-semibold mb-1">⚠️ ffmpeg 이 설치되지 않았습니다</p>
              <p className="mb-2">송출 서버 역할을 하는 맥미니 터미널에서 설치하세요:</p>
              <code className="block bg-black/40 px-2 py-1 rounded font-mono text-[11px] text-white">
                brew install ffmpeg
              </code>
            </div>
          )}

          {/* [FEATURE: YOUTUBE_LIVE] PGM 스트림 상태 — 대시보드가 받고 있는 최종 영상 */}
          <div className="rounded-md border border-[#2a2a2a] bg-[#0a0a0a]/50 p-3">
            <p className="text-[10px] text-gray-500 font-medium mb-2">송출 소스</p>
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${
                pgmConnected
                  ? 'bg-green-500 animate-pulse'
                  : pgmStream
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`} />
              <span className="text-gray-300">
                {pgmConnected
                  ? 'PGM 스트림 연결됨 · 송출 준비 완료'
                  : pgmStream
                  ? 'PGM 스트림 수신 중 (버퍼링)'
                  : 'PGM 스트림 연결 대기 중 — ATEM USB 입력 또는 PGM 미러를 먼저 연결해 주세요'}
              </span>
            </div>
            <p className="text-[10px] text-gray-600 mt-2">
              대시보드에서 보이는 최종 영상(자막 + 카메라 + 클립 영상)이 그대로 RTMP 송출됩니다.
            </p>
          </div>

          <div className="rounded-md border border-amber-700/30 bg-amber-900/10 p-3 text-[10px] leading-relaxed text-amber-200">
            현재 이 버튼은 YouTube/RTMP 라이브 송출만 시작합니다. 로컬 녹화 파일은 아직 생성하지 않습니다.
          </div>

          {isYouTube && (
            <div className="rounded-md border border-sky-700/40 bg-sky-900/10 p-3 text-[10px] leading-relaxed text-sky-100">
              현재 YouTube 송출은 RTMP 스트림 키 방식입니다. 영상 품질은 UnoLive에서 제어하지만,
              방송 제목, 공개 범위, 저지연 설정은 YouTube Studio의 현재 라이브 설정을 따릅니다.
            </div>
          )}

          {liveError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {liveError}
            </div>
          )}

          {/* YouTube 설정 */}
          {isYouTube ? (
            <>
              <Field label="스트림 URL">
                <input
                  type="text"
                  value={youtubeConfig.streamUrl}
                  onChange={(e) => updateYouTubeConfig({ streamUrl: e.target.value })}
                  className="input"
                  placeholder="rtmp://a.rtmp.youtube.com/live2"
                />
              </Field>

              <Field
                label="스트림 키"
                hint={
                  <a
                    href="https://studio.youtube.com/channel/UC/livestreaming"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    YouTube Studio에서 확인
                  </a>
                }
              >
                <div className="flex gap-2">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={youtubeConfig.streamKey}
                    onChange={(e) => updateYouTubeConfig({ streamKey: e.target.value })}
                    className="input flex-1 font-mono"
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="px-3 bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] rounded text-[11px] text-gray-400 transition-colors"
                  >
                    {showKey ? '숨김' : '표시'}
                  </button>
                </div>
              </Field>

              <Field label="방송 제목 (로컬 표시용)">
                <input
                  type="text"
                  value={youtubeConfig.title}
                  onChange={(e) => updateYouTubeConfig({ title: e.target.value })}
                  className="input"
                  placeholder="2026-04-12 주일낮예배"
                />
                <p className="mt-1 text-[10px] leading-relaxed text-amber-300/80">
                  RTMP 송출만으로는 YouTube 방송 제목이 변경되지 않습니다. 실제 제목은 YouTube Studio에서 먼저 수정하세요.
                </p>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="공개 설정 (Studio 기준)">
                  <select
                    value={youtubeConfig.privacy}
                    onChange={(e) =>
                      updateYouTubeConfig({ privacy: e.target.value as LivePrivacy })
                    }
                    disabled
                    className="input cursor-not-allowed opacity-60"
                  >
                    <option value="public">공개</option>
                    <option value="unlisted">일부 공개</option>
                    <option value="private">비공개</option>
                  </select>
                </Field>

                <Field label="저지연 모드 (Studio 기준)">
                  <label className="flex items-center gap-2 h-[34px] px-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded cursor-not-allowed opacity-60">
                    <input
                      type="checkbox"
                      checked={youtubeConfig.lowLatency}
                      disabled
                      onChange={(e) => updateYouTubeConfig({ lowLatency: e.target.checked })}
                      className="w-4 h-4 accent-red-500"
                    />
                    <span className="text-xs text-gray-300">사용</span>
                  </label>
                </Field>
              </div>
              <p className="-mt-1 text-[10px] leading-relaxed text-amber-300/80">
                일부공개/비공개/공개 상태는 YouTube Studio에서 예약 또는 현재 라이브를 먼저 설정해야 합니다.
                UnoLive에서 자동 변경하려면 이후 YouTube API 연동이 필요합니다.
              </p>
            </>
          ) : (
            <>
              <Field label="RTMP URL">
                <input
                  type="text"
                  value={customConfig.streamUrl}
                  onChange={(e) => updateCustomConfig({ streamUrl: e.target.value })}
                  className="input"
                  placeholder="rtmp://..."
                />
              </Field>

              <Field label="스트림 키">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={customConfig.streamKey}
                  onChange={(e) => updateCustomConfig({ streamKey: e.target.value })}
                  className="input font-mono"
                  autoComplete="off"
                />
              </Field>

              <Field label="방송 제목 (로컬 표시용)">
                <input
                  type="text"
                  value={customConfig.title}
                  onChange={(e) => updateCustomConfig({ title: e.target.value })}
                  className="input"
                />
              </Field>
            </>
          )}

          {/* 스트림 키 보안 경고 */}
          <div className="flex items-start gap-2 px-3 py-2 bg-yellow-900/20 border border-yellow-900/40 rounded text-[10px] text-yellow-300/90">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-[1px]">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>
              스트림 키는 비밀번호와 같습니다. 절대 다른 사람과 공유하지 마세요.
            </span>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#1f1f1f]">
          <button
            onClick={onClose}
            className="px-4 h-9 text-xs text-gray-400 hover:text-white transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleStart}
            disabled={!canStart}
            className={`flex items-center gap-2 px-4 h-9 rounded-md text-xs font-medium transition-colors ${
              canStart
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-[#1a1a1a] border border-[#2a2a2a] text-gray-600 cursor-not-allowed'
            }`}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="4" fill="currentColor" />
            </svg>
            {starting ? '연결 중...' : '라이브 시작'}
          </button>
        </div>
      </div>

      {/* 공통 스타일 (input 클래스) */}
      <style jsx>{`
        :global(.input) {
          width: 100%;
          height: 34px;
          padding: 0 12px;
          background: #0a0a0a;
          border: 1px solid #2a2a2a;
          border-radius: 6px;
          color: #e5e5e5;
          font-size: 12px;
          outline: none;
          transition: border-color 0.15s;
        }
        :global(.input:focus) {
          border-color: #3b82f6;
        }
        :global(.input::placeholder) {
          color: #4a4a4a;
        }
      `}</style>
    </div>
  );

  return createPortal(modal, document.body);
}

/* ── 작은 UI 헬퍼 컴포넌트 ────────────────────── */

function ProviderChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-8 px-3 rounded text-xs font-medium transition-colors border ${
        active
          ? 'bg-red-600/20 border-red-500 text-red-300'
          : 'bg-[#0a0a0a] border-[#2a2a2a] text-gray-500 hover:text-gray-300 hover:border-[#3a3a3a]'
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-medium text-gray-400">{label}</label>
        {hint && <span className="text-[10px]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
