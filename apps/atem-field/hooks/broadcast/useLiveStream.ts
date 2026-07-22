'use client';

/**
 * useLiveStream.ts
 * 라이브 스트리밍 훅 — YouTube Live / Twitch / 커스텀 RTMP
 *
 * Phase 1 (완료): store 상태 + 모달 UI
 * Phase 2 (완료): Electron main 의 ffmpeg RTMP push 호출 (window.unolive.live.*)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBroadcastStore } from '@/lib/broadcast/broadcastStore';

/** Electron preload 에서 노출한 window.unolive.live 타입 */
interface LiveBridge {
  checkFfmpeg:  () => Promise<{ installed: boolean; path?: string; version?: string }>;
  start:        (opts: { streamUrl: string; streamKey: string; bitrate?: number }) => Promise<{ ok: boolean; error?: string; pid?: number; rtmpUrl?: string }>;
  pushChunk:    (chunk: ArrayBuffer) => Promise<{ ok: boolean; error?: string }>;
  stop:         () => Promise<{ running: boolean; error?: string }>;
  status:       () => Promise<{ running: boolean; chunksReceived?: number; bytesReceived?: number }>;
  on:           (event: 'started' | 'stopped' | 'stats' | 'error' | 'log', cb: (payload: unknown) => void) => () => void;
}

type LiveTransport = Pick<LiveBridge, 'start' | 'pushChunk' | 'stop' | 'status'>;

const STARTUP_GRACE_MS = 6_000;
const MAX_CHUNK_PUSH_FAILURES = 3;
const DEFAULT_LIVE_VIDEO_BITRATE_KBPS = 8500;

function getLiveBridge(): LiveBridge | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.unolive?.live ?? null;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => null);
  if (payload && typeof payload === 'object') {
    return payload as T;
  }
  return {
    ok: false,
    error: `서버 라이브 브리지 응답 오류: HTTP ${res.status}`,
  } as T;
}

function getServerLiveTransport(): LiveTransport {
  return {
    async start(opts) {
      const res = await fetch('/api/live/server/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
      return parseJsonResponse<Awaited<ReturnType<LiveTransport['start']>>>(res);
    },
    async pushChunk(chunk) {
      const res = await fetch('/api/live/server/chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: chunk,
      });
      return parseJsonResponse<Awaited<ReturnType<LiveTransport['pushChunk']>>>(res);
    },
    async stop() {
      const res = await fetch('/api/live/server/stop', { method: 'POST' });
      return parseJsonResponse<Awaited<ReturnType<LiveTransport['stop']>>>(res);
    },
    async status() {
      const res = await fetch('/api/live/server/status', { method: 'GET' });
      return parseJsonResponse<Awaited<ReturnType<LiveTransport['status']>>>(res);
    },
  };
}

/**
 * PGM MediaStream 은 OutputCanvas.captureStream() 에서 왔으므로 오디오 트랙이 없다.
 * YouTube Live 는 오디오 트랙 필수 → 무음 오디오 트랙을 AudioContext 로 합성해 붙인다.
 * 이미 오디오 트랙이 있으면 그대로 반환.
 */
function ensureAudioTrack(stream: MediaStream): { stream: MediaStream; cleanup?: () => void } {
  if (stream.getAudioTracks().length > 0) return { stream };

  const AudioCtx = (window.AudioContext
    || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  const ac = new AudioCtx();
  const oscillator = ac.createOscillator();
  const gain = ac.createGain();
  gain.gain.value = 0;              // 완전 무음
  const dst = ac.createMediaStreamDestination();
  oscillator.connect(gain).connect(dst);
  oscillator.start();

  const merged = new MediaStream([
    ...stream.getVideoTracks(),
    ...dst.stream.getAudioTracks(),
  ]);
  const cleanup = () => {
    try { oscillator.stop(); } catch { /* ignore */ }
    try { void ac.close(); } catch { /* ignore */ }
  };
  return { stream: merged, cleanup };
}

/** MediaRecorder 가 지원하는 첫 mimeType 을 고른다. */
function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch { /* ignore */ }
  }
  return 'video/webm';
}

export function useLiveStream() {
  const liveStatus = useBroadcastStore((s) => s.liveStatus);
  const liveStartedAt = useBroadcastStore((s) => s.liveStartedAt);
  const liveProvider = useBroadcastStore((s) => s.liveProvider);
  const youtubeConfig = useBroadcastStore((s) => s.youtubeConfig);
  const customConfig = useBroadcastStore((s) => s.customConfig);
  const liveStats = useBroadcastStore((s) => s.liveStats);
  const liveError = useBroadcastStore((s) => s.liveError);

  const startLive = useBroadcastStore((s) => s.startLive);
  const stopLive = useBroadcastStore((s) => s.stopLive);
  const setLiveStatus = useBroadcastStore((s) => s.setLiveStatus);
  const updateYouTubeConfig = useBroadcastStore((s) => s.updateYouTubeConfig);
  const updateCustomConfig = useBroadcastStore((s) => s.updateCustomConfig);
  const isLiveConfigValid = useBroadcastStore((s) => s.isLiveConfigValid);

  // 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 라이브 경과 시간
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (liveStatus !== 'live' || liveStartedAt === null) {
      return;
    }
    const tick = () => {
      setElapsed(Math.floor((Date.now() - liveStartedAt) / 1000));
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [liveStatus, liveStartedAt]);

  // 모달 열기
  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // ── Phase 2 (재설계 2026-04-20): WebM-over-stdin 파이프 ──
  //   렌더러의 MediaStream → MediaRecorder(webm) → IPC push → ffmpeg stdin → RTMP
  //   권한 불필요 (avfoundation 안 씀), 모니터 하드웨어 독립.
  const setLiveError = useBroadcastStore((s) => s.setLiveError);

  // MediaRecorder + 합성 오디오 cleanup 참조 (start 시 생성, stop 시 정리)
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioCleanupRef = useRef<(() => void) | null>(null);
  const startupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushFailureCountRef = useRef(0);
  const liveTransportRef = useRef<LiveTransport | null>(null);

  const clearStartupTimer = useCallback(() => {
    if (!startupTimerRef.current) return;
    clearTimeout(startupTimerRef.current);
    startupTimerRef.current = null;
  }, []);

  const stopLocalRecorder = useCallback(() => {
    clearStartupTimer();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    } else {
      recorderRef.current = null;
      audioCleanupRef.current?.();
      audioCleanupRef.current = null;
    }
  }, [clearStartupTimer]);

  const start = useCallback(
    async (stream: MediaStream | null | undefined, opts?: { bitrate?: number }) => {
      if (!isLiveConfigValid()) {
        setLiveError('스트림 키를 입력해 주세요.');
        return false;
      }
      const bridge = getLiveBridge() ?? getServerLiveTransport();
      if (!stream) {
        setLiveError('PGM 스트림이 아직 도착하지 않았습니다. 잠시 후 다시 시도해 주세요.');
        return false;
      }
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== 'live') {
        setLiveError('PGM 비디오 트랙이 유효하지 않습니다. Output/PGM 미러를 다시 연결해 주세요.');
        return false;
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        setLiveError('이미 송출 인코더가 실행 중입니다.');
        return false;
      }

      // provider 별 URL / 키
      const state = useBroadcastStore.getState();
      const { streamUrl, streamKey } = state.liveProvider === 'youtube'
        ? { streamUrl: state.youtubeConfig.streamUrl, streamKey: state.youtubeConfig.streamKey }
        : { streamUrl: state.customConfig.streamUrl, streamKey: state.customConfig.streamKey };

      startLive(); // status=connecting
      pushFailureCountRef.current = 0;

      // 1. ffmpeg 기동 (stdin 대기 상태로 진입)
      const res = await bridge.start({
        streamUrl, streamKey,
        bitrate: opts?.bitrate ?? DEFAULT_LIVE_VIDEO_BITRATE_KBPS,
      });
      if (!res.ok) {
        setLiveError(res.error ?? 'ffmpeg 기동 실패');
        return false;
      }
      liveTransportRef.current = bridge;

      // 2. YouTube 호환: 오디오 트랙 없으면 무음 트랙 합성
      const { stream: recordingStream, cleanup: audioCleanup } = ensureAudioTrack(stream);
      audioCleanupRef.current = audioCleanup ?? null;

      // 3. MediaRecorder 생성 + 청크마다 IPC push
      const mimeType = pickMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(recordingStream, {
          mimeType,
          videoBitsPerSecond: (opts?.bitrate ?? DEFAULT_LIVE_VIDEO_BITRATE_KBPS) * 1000,
          audioBitsPerSecond: 128_000,
        });
      } catch (err) {
        setLiveError(`MediaRecorder 생성 실패: ${(err as Error).message}`);
        audioCleanup?.();
        audioCleanupRef.current = null;
        await bridge.stop();
        return false;
      }

      recorder.ondataavailable = async (e) => {
        if (!e.data || e.data.size === 0) return;
        const buf = await e.data.arrayBuffer();
        try {
          const pushed = await bridge.pushChunk(buf);
          if (!pushed.ok) {
            pushFailureCountRef.current++;
            if (pushFailureCountRef.current >= MAX_CHUNK_PUSH_FAILURES) {
              setLiveError(pushed.error ?? 'MediaRecorder 청크가 ffmpeg에 전달되지 않았습니다.');
              stopLocalRecorder();
              await bridge.stop();
            }
            return;
          }
          pushFailureCountRef.current = 0;
          const cur = useBroadcastStore.getState().liveStatus;
          if (cur === 'connecting') setLiveStatus('live');
        } catch (err) {
          pushFailureCountRef.current++;
          if (pushFailureCountRef.current >= MAX_CHUNK_PUSH_FAILURES) {
            setLiveError(`청크 전달 실패: ${(err as Error).message}`);
            stopLocalRecorder();
            await bridge.stop();
          }
        }
      };
      recorder.onerror = (e) => {
        console.error('[useLiveStream] MediaRecorder error:', e);
        setLiveError('MediaRecorder 오류로 라이브 송출을 중단했습니다.');
        stopLocalRecorder();
        void bridge.stop();
      };
      recorder.onstop = () => {
        clearStartupTimer();
        recorderRef.current = null;
        audioCleanupRef.current?.();
        audioCleanupRef.current = null;
      };
      recorder.start(200); // 200ms 타임슬라이스 — 지연/안정성 균형
      recorderRef.current = recorder;

      startupTimerRef.current = setTimeout(async () => {
        const current = useBroadcastStore.getState();
        if (current.liveStatus !== 'connecting') return;
        const status = await bridge.status().catch((): Awaited<ReturnType<LiveBridge['status']>> => ({ running: false }));
        if (status.running && (status.chunksReceived ?? 0) > 0) {
          setLiveStatus('live');
          return;
        }
        setLiveError('송출 시작 검증 실패: ffmpeg가 MediaRecorder 청크를 받지 못했습니다.');
        stopLocalRecorder();
        await bridge.stop();
      }, STARTUP_GRACE_MS);
      return true;
    },
    [clearStartupTimer, isLiveConfigValid, setLiveError, setLiveStatus, startLive, stopLocalRecorder]
  );

  const stop = useCallback(async () => {
    // MediaRecorder 먼저 정지 → 마지막 청크 flush → ffmpeg stdin 닫힘
    stopLocalRecorder();
    const bridge = liveTransportRef.current ?? getLiveBridge() ?? getServerLiveTransport();
    await bridge.stop();
    liveTransportRef.current = null;
    stopLive();
  }, [stopLive, stopLocalRecorder]);

  // ── ffmpeg 이벤트 구독 (stats → store.liveStats 갱신) ──
  const updateLiveStats = useBroadcastStore((s) => s.updateLiveStats);
  useEffect(() => {
    const bridge = getLiveBridge();
    if (!bridge) return;
    const offStats = bridge.on('stats', (payload) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = payload as any;
      updateLiveStats({ bitrate: s.bitrate, fps: s.fps });
      // connecting → live 승격
      const cur = useBroadcastStore.getState().liveStatus;
      if (cur === 'connecting') {
        clearStartupTimer();
        setLiveStatus('live');
      }
    });
    const offStopped = bridge.on('stopped', () => {
      clearStartupTimer();
      if (useBroadcastStore.getState().liveStatus !== 'error') {
        stopLive();
      }
    });
    const offError = bridge.on('error', (payload) => {
      clearStartupTimer();
      setLiveError(String(payload));
    });
    return () => { offStats(); offStopped(); offError(); };
  }, [clearStartupTimer, updateLiveStats, setLiveStatus, stopLive, setLiveError]);

  // 버튼 클릭 시: 대기면 모달, 진행 중이면 종료 확인
  const handleButtonClick = useCallback(() => {
    if (liveStatus === 'idle' || liveStatus === 'error') {
      openModal();
    } else {
      // 라이브 중 → 종료 확인
      if (confirm('라이브 송출을 종료하시겠습니까?')) {
        stop();
      }
    }
  }, [liveStatus, openModal, stop]);

  const isLive = liveStatus === 'live';
  const isConnecting = liveStatus === 'connecting' || liveStatus === 'reconnecting';

  return {
    // 상태
    liveStatus,
    isLive,
    isConnecting,
    liveError,
    liveStats,
    elapsed: liveStatus === 'live' ? elapsed : 0,
    elapsedFormatted: formatElapsed(liveStatus === 'live' ? elapsed : 0),

    // 설정
    liveProvider,
    youtubeConfig,
    customConfig,
    updateYouTubeConfig,
    updateCustomConfig,
    isLiveConfigValid,

    // 모달
    isModalOpen,
    openModal,
    closeModal,

    // 액션
    start,
    stop,
    handleButtonClick,
  };
}

/** 초 → HH:MM:SS 또는 MM:SS 포맷 */
function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
