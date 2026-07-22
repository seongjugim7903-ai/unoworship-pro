'use client';

/**
 * BroadcastFeedMirror — UnoLive Output 라이브 피드 미러
 *
 * [FEATURE: BROADCAST_VIEWER / WEBRTC]
 *
 * /media/broadcast 대시보드의 Program 미러 창에서
 * UnoLive 의 최종 Program 을 실시간으로 렌더링합니다.
 *
 * OutputCanvas 의 "하단 캔버스 + iframe + 상단 오버레이 캔버스" 3단 구조를
 * 그대로 미러링합니다. WebRTC captureStream 은 Output 의 **하단 캔버스만**
 * 담아오므로 비디오 위 요소(shape/text with zIndex > videoZIndex)는 별도의
 * 상단 오버레이 캔버스를 Viewer 쪽에서 직접 그려 보완해야 합니다.
 *
 * 5개 레이어로 동작:
 *
 *   ① **하단 폴백 캔버스** (z-0, 가장 아래)
 *      - WebRTC 스트림이 없을 때만 요소/자막/블랙아웃 그림
 *      - 스트림이 활성화되면 투명하게 유지
 *
 *   ② **WebRTC <video>** (z-1, 조건부 렌더)
 *      - Output PC 가 `canvas.captureStream(30)` 으로 보낸 하단 캔버스 영상
 *        (카메라 + 비디오 아래 요소)
 *      - 스트림이 있을 때만 DOM 에 붙여 하단 캔버스 위를 덮음
 *
 *   ③ **YouTube <iframe> 레이어** (z-2, 항상)
 *      - `ELEMENTS_UPDATE` 의 video 타입 요소를 OutputCanvas 와 동일하게 개별 렌더
 *      - 각 윈도우가 자기 YouTube 임베드를 독립 재생 (같은 Socket.io 룸이면 동기화)
 *      - `VIDEO_COMMAND` 수신 시 postMessage 로 play/pause/seek 전달
 *
 *   ④ **상단 오버레이 캔버스** (z-3, 항상)
 *      - **비디오 위 요소** (zIndex > maxVideoZIndex) 만 그림
 *      - WebRTC 스트림이 없을 때는 비어 있음 (하단 캔버스가 전부 그림)
 *      - 스트림이 있고 video 요소가 존재할 때만 above-video 요소를 렌더
 *
 * 우선순위:
 *   stream(O) + BROADCAST(O) → WebRTC 비디오 + YouTube iframe + 상단 오버레이
 *   stream(X) + cameras-source(O) → 카메라 릴레이 비디오 + YouTube iframe + 상단 오버레이
 *   stream(X) + BROADCAST(O) → 하단 캔버스 폴백 (전 요소) + YouTube iframe
 *   stream(X) + BROADCAST(X) → "대기 중" 오버레이
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useBroadcastViewer } from '@/hooks/useBroadcastViewer';
import { useBroadcastVideoStream } from '@/hooks/useBroadcastVideoStream';
import { useCamerasVideoStream } from '@/hooks/useCamerasVideoStream';
import { getSocket } from '@/lib/socketClient';
import { SOCKET_EVENTS, isSocketMessageTargetedTo, type SocketMessage } from '@/lib/socketEvents';
import { useMediaStore } from '@/lib/media/mediaStore';
import { isElementForcedAboveVideo, renderElements, renderScreenMasks } from '@/lib/canvasRenderer';
import { getClipMaskStyleFor } from '@/lib/clipMaskStyle'; // [FEATURE: SHAPE_YOUTUBE_CLIP]
import { renderSubtitle, renderBlackout } from '@/lib/subtitleRenderer';
import { getEmbedUrl } from '@/lib/youtube';
import { interpolateElements, hasMotion } from '@/lib/motionEngine';
import type { SubtitleStyle } from '@/lib/types';
import { isElementVisibleOn, type CanvasElement, type VideoElement } from '@/lib/canvasTypes';
import SectionTransitionOverlay from '@/components/scenes/SectionTransitionOverlay';
import type { SectionTransitionSnapshot } from '@/components/scenes/SectionTransitionOverlay';

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

type SecureOriginHelp = {
  origin: string;
  url: string;
  isSecureContext: boolean;
  macCommand: string;
  windowsCommand: string;
};

function isAtemUsbVideoDevice(device: MediaDeviceInfo): boolean {
  return /atem|blackmagic|blackmagic design|ultrastudio|decklink|web presenter|capture|intensity|sdi|hdmi/i.test(
    device.label
  );
}

function sortVideoInputDevices(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  return [...devices].sort((a, b) => {
    const aPreferred = isAtemUsbVideoDevice(a) ? 1 : 0;
    const bPreferred = isAtemUsbVideoDevice(b) ? 1 : 0;
    if (aPreferred !== bPreferred) return bPreferred - aPreferred;
    return a.label.localeCompare(b.label);
  });
}

function buildSecureOriginHelp(): SecureOriginHelp | null {
  if (typeof window === 'undefined') return null;
  const origin = window.location.origin;
  const url = window.location.href;
  const profileName = 'unolive-camera-secure';
  return {
    origin,
    url,
    isSecureContext: window.isSecureContext,
    macCommand: `open -na "Google Chrome" --args --user-data-dir="/tmp/${profileName}" --unsafely-treat-insecure-origin-as-secure="${origin}" "${url}"`,
    windowsCommand: `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir="%TEMP%\\${profileName}" --unsafely-treat-insecure-origin-as-secure="${origin}" "${url}"`,
  };
}

export default function BroadcastFeedMirror() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());
  const lastCompositeSnapshotRef = useRef<HTMLCanvasElement | null>(null);
  const previousCompositeSnapshotRef = useRef<HTMLCanvasElement | null>(null);
  const lastCompositeSnapshotAtRef = useRef(0);
  const transitionActiveRef = useRef(false);
  const motionStartRef = useRef(0);

  // [FEATURE: YT_STANDBY] 각 YouTube 플레이어의 재생 상태 추적.
  // VIDEO_COMMAND (playVideo) smart-retry 에서 state=1 이 확인되면 즉시 중단.
  const playingIdsRef = useRef<Set<string>>(new Set());

  // [FEATURE: SECTION_TRANSITION] 섹션 전환 overlay 상태
  const [sectionTransition, setSectionTransition] = useState<null | {
    snapshot: SectionTransitionSnapshot;
    type: 'fade' | 'slide' | 'dip-to-black';
    duration: number;
  }>(null);

  const viewer = useBroadcastViewer();
  const {
    stream,
    connected: streamConnected,
    connectionState: streamConnectionState,
  } = useBroadcastVideoStream();
  const {
    stream: cameraRelayStream,
    connected: cameraRelayConnected,
    connectionState: cameraRelayConnectionState,
  } = useCamerasVideoStream();
  const recordIncident = useMediaStore((s) => s.recordIncident);
  const [localCaptureStream, setLocalCaptureStream] = useState<MediaStream | null>(null);
  const [localCaptureStatus, setLocalCaptureStatus] = useState<
    'idle' | 'requesting' | 'connected' | 'failed'
  >('idle');
  const [localCaptureError, setLocalCaptureError] = useState('');
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState('');
  const [deviceScanStatus, setDeviceScanStatus] = useState<
    'idle' | 'requesting' | 'ready' | 'failed'
  >('idle');
  const [secureOriginHelp, setSecureOriginHelp] = useState<SecureOriginHelp | null>(null);
  // USB PGM 입력 설정 창 표시 여부 — 닫아도 캡처(localCaptureStream)는 유지되고, 상단 링크로 다시 연다.
  const [showPgmPanel, setShowPgmPanel] = useState(true);
  const [copiedSecureOriginCommand, setCopiedSecureOriginCommand] = useState<
    'windows' | 'mac' | null
  >(null);
  const [manualSecureOriginCommand, setManualSecureOriginCommand] = useState<{
    kind: 'windows' | 'mac';
    command: string;
  } | null>(null);

  const selectedVideoDeviceLabel = useMemo(() => {
    return videoInputDevices.find((device) => device.deviceId === selectedVideoDeviceId)?.label ?? '';
  }, [selectedVideoDeviceId, videoInputDevices]);
  const selectedVideoDeviceIsAtem = useMemo(() => {
    const selected = videoInputDevices.find((device) => device.deviceId === selectedVideoDeviceId);
    return selected ? isAtemUsbVideoDevice(selected) : false;
  }, [selectedVideoDeviceId, videoInputDevices]);

  useEffect(() => {
    setSecureOriginHelp(buildSecureOriginHelp());
  }, []);

  const copySecureOriginCommand = useCallback(async (
    kind: 'windows' | 'mac',
    command: string,
  ) => {
    setManualSecureOriginCommand({ kind, command });
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(command);
      setCopiedSecureOriginCommand(kind);
      window.setTimeout(() => setCopiedSecureOriginCommand(null), 1800);
    } catch {
      setCopiedSecureOriginCommand(null);
      setLocalCaptureError('자동 복사는 브라우저 보안 정책으로 실패했습니다. 아래 명령어 박스 내용을 직접 복사해 실행해 주세요.');
    }
  }, []);

  const loadVideoInputDevices = useCallback(async () => {
    if (!window.isSecureContext) {
      setDeviceScanStatus('failed');
      setLocalCaptureError(
        'Chrome 보안 정책상 IP 주소 페이지에서는 USB 캡처 장치 검색이 막힙니다. 아래 secure-origin 실행 명령으로 다시 열어 주세요.'
      );
      return;
    }

    if (!navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices?.getUserMedia) {
      setDeviceScanStatus('failed');
      setLocalCaptureError('이 브라우저는 USB 캡처 장치 검색을 지원하지 않습니다.');
      return;
    }

    setDeviceScanStatus('requesting');
    setLocalCaptureError('');

    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      let videoDevices = sortVideoInputDevices(
        devices.filter((device) => device.kind === 'videoinput')
      );

      // Chrome hides device labels until the user grants capture permission.
      if (videoDevices.length === 0 || videoDevices.some((device) => !device.label)) {
        const permissionStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        permissionStream.getTracks().forEach((track) => track.stop());
        devices = await navigator.mediaDevices.enumerateDevices();
        videoDevices = sortVideoInputDevices(
          devices.filter((device) => device.kind === 'videoinput')
        );
      }

      setVideoInputDevices(videoDevices);
      const preferred = videoDevices.find(isAtemUsbVideoDevice) ?? videoDevices[0];
      setSelectedVideoDeviceId((current) => {
        if (current && videoDevices.some((device) => device.deviceId === current)) return current;
        return preferred?.deviceId || '';
      });
      setDeviceScanStatus('ready');

      if (videoDevices.length === 0) {
        setLocalCaptureError('이 컴퓨터에서 USB 비디오 입력 장치를 찾지 못했습니다.');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'USB 캡처 장치 검색에 실패했습니다.';
      setDeviceScanStatus('failed');
      setLocalCaptureError(message);
    }
  }, []);

  const startLocalAtemCapture = useCallback(async () => {
    if (!window.isSecureContext) {
      setLocalCaptureStatus('failed');
      setLocalCaptureError(
        'Chrome 보안 정책상 IP 주소 페이지에서는 캡처 장치 접근이 막힙니다. 아래 secure-origin 실행 명령으로 다시 열어 주세요.'
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setLocalCaptureStatus('failed');
      setLocalCaptureError('이 브라우저는 캡처 장치 접근을 지원하지 않습니다.');
      return;
    }

    setLocalCaptureStatus('requesting');
    setLocalCaptureError('');

    try {
      const capture = await navigator.mediaDevices.getUserMedia({
        video: selectedVideoDeviceId
          ? {
              deviceId: { exact: selectedVideoDeviceId },
              width: { ideal: CANVAS_WIDTH },
              height: { ideal: CANVAS_HEIGHT },
              frameRate: { ideal: 60, max: 60 },
            }
          : {
              width: { ideal: CANVAS_WIDTH },
              height: { ideal: CANVAS_HEIGHT },
              frameRate: { ideal: 60, max: 60 },
            },
        audio: false,
      });

      setLocalCaptureStream((current) => {
        current?.getTracks().forEach((track) => track.stop());
        return capture;
      });
      setLocalCaptureStatus('connected');
      useMediaStore.getState().setSessionSyncStatus('connected');
      recordIncident(
        'info',
        `ATEM USB PGM 캡처 시작${selectedVideoDeviceLabel ? `: ${selectedVideoDeviceLabel}` : ''}`,
        'broadcast',
        { actorId: null }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'ATEM USB 캡처 장치 접근에 실패했습니다.';
      setLocalCaptureStatus('failed');
      setLocalCaptureError(message);
      recordIncident('error', `ATEM USB PGM 캡처 실패: ${message}`, 'broadcast', {
        actorId: null,
      });
    }
  }, [recordIncident, selectedVideoDeviceId, selectedVideoDeviceLabel]);

  useEffect(() => {
    return () => {
      localCaptureStream?.getTracks().forEach((track) => track.stop());
    };
  }, [localCaptureStream]);

  // WebRTC stream is the base PGM/camera feed from /output. Keep it visible even
  // when a section contains OUT/PMT/BRD-routed elements; otherwise routed lyrics
  // or prompt-only elements can accidentally blank the camera preview.
  // If /output is not running, fall back to the independent /cameras-source relay.
  // In ATEM field mode, the broadcast PC can receive final PGM directly from
  // ATEM USB Out. Once selected, local capture must win over stale WebRTC.
  const displayStream = localCaptureStream ?? stream ?? cameraRelayStream;
  const displayStreamKind = localCaptureStream
    ? 'atem-usb'
    : stream
    ? 'pgm'
    : cameraRelayStream
    ? 'camera-relay'
    : 'none';
  const hasDisplayStream = !!displayStream;

  useEffect(() => {
    if (streamConnectionState === 'idle') return;
    if (streamConnectionState === 'connected') {
      recordIncident('info', 'PGM WebRTC 수신 시작', 'broadcast', { actorId: null });
    } else if (streamConnectionState === 'disconnected') {
      recordIncident('warn', 'PGM WebRTC 연결 일시 끊김', 'broadcast', { actorId: null });
    } else if (streamConnectionState === 'failed') {
      recordIncident('error', 'PGM WebRTC 연결 실패', 'broadcast', { actorId: null });
    } else if (streamConnectionState === 'closed') {
      recordIncident('warn', 'PGM WebRTC 연결 종료', 'broadcast', { actorId: null });
    }
  }, [recordIncident, streamConnectionState]);

  useEffect(() => {
    if (stream || cameraRelayConnectionState === 'idle') return;
    if (cameraRelayConnectionState === 'connected') {
      recordIncident('info', '카메라 릴레이 수신 시작', 'broadcast', { actorId: null });
    } else if (cameraRelayConnectionState === 'disconnected') {
      recordIncident('warn', '카메라 릴레이 연결 일시 끊김', 'broadcast', { actorId: null });
    } else if (cameraRelayConnectionState === 'failed') {
      recordIncident('error', '카메라 릴레이 연결 실패', 'broadcast', { actorId: null });
    } else if (cameraRelayConnectionState === 'closed') {
      recordIncident('warn', '카메라 릴레이 연결 종료', 'broadcast', { actorId: null });
    }
  }, [cameraRelayConnectionState, recordIncident, stream]);

  const drawCurrentCompositeTo = useCallback((target: HTMLCanvasElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    if (target.width !== CANVAS_WIDTH) target.width = CANVAS_WIDTH;
    if (target.height !== CANVAS_HEIGHT) target.height = CANVAS_HEIGHT;

    const ctx = target.getContext('2d');
    if (!ctx) return false;

    const overlay = overlayCanvasRef.current;
    const mask = maskCanvasRef.current;
    const video = videoRef.current;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.drawImage(canvas, 0, 0);
    if (stateRef.current.hasStream && video && video.readyState >= 2) {
      try {
        ctx.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } catch {
        /* WebRTC video frame may be temporarily unavailable. */
      }
    }
    if (overlay) ctx.drawImage(overlay, 0, 0);
    if (mask) ctx.drawImage(mask, 0, 0);
    return true;
  }, []);

  const cloneCanvasSnapshot = useCallback((source: HTMLCanvasElement | null) => {
    if (!source) return null;
    const clone = document.createElement('canvas');
    clone.width = source.width;
    clone.height = source.height;
    const ctx = clone.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0);
    return clone;
  }, []);

  const updateLastCompositeSnapshot = useCallback((now = performance.now()) => {
    if (now - lastCompositeSnapshotAtRef.current < 50) return;
    const target = previousCompositeSnapshotRef.current ?? document.createElement('canvas');
    if (!drawCurrentCompositeTo(target)) return;
    previousCompositeSnapshotRef.current = lastCompositeSnapshotRef.current;
    lastCompositeSnapshotRef.current = target;
    lastCompositeSnapshotAtRef.current = now;
  }, [drawCurrentCompositeTo]);

  const getTransitionSnapshot = useCallback(() => {
    // WebRTC video can update slightly before the socket transition event.
    // Use one cached frame back to avoid mixing the new PGM frame into the old-screen overlay.
    const cached = cloneCanvasSnapshot(
      previousCompositeSnapshotRef.current ?? lastCompositeSnapshotRef.current
    );
    if (cached) return cached;

    const fallback = document.createElement('canvas');
    return drawCurrentCompositeTo(fallback) ? fallback : null;
  }, [cloneCanvasSnapshot, drawCurrentCompositeTo]);

  // ─── 영상 요소 추출: YouTube iframe + 서버에 업로드된 로컬 영상 파일 ─────
  const videoElements = useMemo<VideoElement[]>(() => {
    return viewer.elements.filter(
      (el): el is VideoElement =>
        el.type === 'video' && el.visible && isElementVisibleOn(el, 'broadcast') && (!!el.youtubeId || !!el.src)
    );
  }, [viewer.elements]);

  // 렌더 루프에서 참조할 최신 상태 (stale closure 방지)
  const stateRef = useRef({
    subtitleText: '',
    subtitleStyle: viewer.subtitleStyle,
    elements: [] as CanvasElement[],
    sectionText: '',
    blackout: false,
    hasStream: false,
    streamKind: 'none' as 'pgm' | 'atem-usb' | 'camera-relay' | 'none',
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    stateRef.current = {
      subtitleText: viewer.subtitleText,
      subtitleStyle: viewer.subtitleStyle,
      elements: viewer.elements,
      sectionText: viewer.sectionText,
      blackout: viewer.blackout,
      hasStream: hasDisplayStream,
      streamKind: displayStreamKind,
    };
  }, [
    viewer.subtitleText,
    viewer.subtitleStyle,
    viewer.elements,
    viewer.sectionText,
    viewer.blackout,
    hasDisplayStream,
    displayStreamKind,
  ]);

  // ─── WebRTC MediaStream 을 <video> 에 바인딩 ──────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (hasDisplayStream && displayStream && video.srcObject !== displayStream) {
      video.srcObject = displayStream;
      video.play().catch(() => {
        /* muted + playsInline 이므로 보통 성공하지만 안전 처리 */
      });
    } else if (!hasDisplayStream && video.srcObject) {
      video.srcObject = null;
    }
  }, [displayStream, hasDisplayStream]);

  // ─── VIDEO_COMMAND 수신 → YouTube iframe postMessage 제어 ──────────────
  // useBroadcastViewer 는 순수 상태 훅이라 명령형 이벤트에는 맞지 않음.
  // 여기서 별도 BROADCAST 리스너를 붙여 VIDEO_COMMAND 만 iframe 에 전달.
  // OutputCanvas 의 VIDEO_COMMAND 처리 로직과 동일 (retry 포함).
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleBroadcast = (msg: SocketMessage) => {
      if (!isSocketMessageTargetedTo(msg, 'broadcast')) return;

      if (msg.type === 'ELEMENTS_UPDATE') {
        motionStartRef.current = hasMotion(msg.payload.elements)
          ? performance.now() / 1000
          : 0;
      } else if (
        (msg.type === 'FRAME_SHOW' || msg.type === 'FRAME_UPDATE') &&
        !msg.payload.hasMotion
      ) {
        motionStartRef.current = 0;
      } else if (msg.type === 'CLEAR_TEXT') {
        motionStartRef.current = 0;
      }

      // [FEATURE: SECTION_TRANSITION] section transition payload 감지
      //   ELEMENTS_UPDATE / FRAME_UPDATE / FRAME_SHOW / SUBTITLE_UPDATE 메시지에
      //   transition 필드가 있으면 현재 화면(하단 캔버스 + video + 상단 캔버스 + iframe)
      //   을 스냅샷으로 캡처하여 overlay 로 애니메이션.
      if (
        (msg.type === 'ELEMENTS_UPDATE' || msg.type === 'FRAME_UPDATE' ||
         msg.type === 'FRAME_SHOW' || msg.type === 'SUBTITLE_UPDATE') &&
        msg.payload.transition &&
        msg.payload.transition.type !== 'cut' &&
        msg.payload.transition.duration > 0
      ) {
        const trans = msg.payload.transition;
        const snapshot = getTransitionSnapshot();
        if (snapshot) {
          transitionActiveRef.current = true;
          flushSync(() => {
            setSectionTransition({
              snapshot,
              type: trans.type as 'fade' | 'slide' | 'dip-to-black',
              duration: trans.duration,
            });
          });
        }
        // fall-through — 실제 상태 업데이트는 useBroadcastViewer 가 담당
      }

      if (msg.type !== 'VIDEO_COMMAND') return;
      const { youtubeId, command, args } = msg.payload;

      const sendOnce = () => {
        const iframe = iframeRefs.current.get(youtubeId);
        if (!iframe?.contentWindow) return false;
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'listening', id: 0 }),
          'https://www.youtube.com'
        );
        // Broadcast 대시보드는 모니터링 화면이므로 실제 출력 오디오와
        // 중복되지 않게 unMute 명령은 무시하고 mute 상태를 유지한다.
        if (command === 'unMute') {
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'mute', args: [] }),
            'https://www.youtube.com'
          );
        } else {
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: command, args: args ?? [] }),
            'https://www.youtube.com'
          );
        }
        return true;
      };

      if (command === 'playVideo') {
        // state=1 이 확인되면 즉시 재시도 중단 → 스터터 방지
        const delays = [0, 500, 1100, 2000, 3200];
        for (const delay of delays) {
          setTimeout(() => {
            if (playingIdsRef.current.has(youtubeId)) return;
            sendOnce();
          }, delay);
        }
      } else if (command === 'seekTo') {
        // seekTo 도 iframe/player 로딩 대기 필요 — 재시도로 안정성 확보
        // (ELEMENTS_UPDATE 와 거의 동시에 도착 시 iframe 미준비 상태 대응)
        const seekDelays = [0, 300, 800, 1500];
        for (const delay of seekDelays) {
          setTimeout(() => sendOnce(), delay);
        }
      } else {
        // unMute / pause 등 나머지는 1회 전송
        sendOnce();
      }
    };

    socket.on(SOCKET_EVENTS.BROADCAST, handleBroadcast);
    return () => {
      socket.off(SOCKET_EVENTS.BROADCAST, handleBroadcast);
    };
  }, [getTransitionSnapshot]);

  // [FEATURE: YT_STANDBY] YouTube 플레이어 state 추적 (onStateChange 수신)
  // VIDEO_COMMAND 핸들러의 smart-retry 가 참조하는 playingIdsRef 를 갱신.
  useEffect(() => {
    const handleYouTubeMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube.com') return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data?.event !== 'onStateChange' || typeof data.info !== 'number') return;
        for (const [id, iframe] of iframeRefs.current.entries()) {
          if (iframe.contentWindow === e.source) {
            if (data.info === 1) playingIdsRef.current.add(id);
            else if (data.info === 0 || data.info === 2) playingIdsRef.current.delete(id);
            break;
          }
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('message', handleYouTubeMessage);
    return () => window.removeEventListener('message', handleYouTubeMessage);
  }, []);

  // ─── 캔버스 렌더 루프 (하단 폴백 + 상단 above-video 오버레이) ─────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const overlayCtx = overlayCanvas?.getContext('2d') ?? null;
    const maskCtx = maskCanvas?.getContext('2d') ?? null;
    if (!ctx) return;

    let raf = 0;

    function draw() {
      if (!ctx || !canvas) return;
      const { subtitleText, subtitleStyle, elements: rawElements, sectionText, blackout, hasStream, streamKind } =
        stateRef.current;
      const isRawCaptureFallback = streamKind === 'camera-relay' || streamKind === 'atem-usb';
      const motionStart = motionStartRef.current;
      const elapsed = motionStart > 0 ? (performance.now() / 1000) - motionStart : 999;
      const elements = motionStart > 0 ? interpolateElements(rawElements, elapsed) : rawElements;

      // ── 비디오 z-index 계산 (OutputCanvas 와 동일한 분할 기준) ──
      const vidEls = elements.filter(
        (e): e is VideoElement => e.type === 'video' && e.visible && isElementVisibleOn(e, 'broadcast')
      );
      const maxVidZ =
        vidEls.length > 0 ? Math.max(...vidEls.map((v) => v.zIndex)) : -1;
      const drawMasks = () => {
        if (maskCtx && maskCanvas) {
          renderScreenMasks(maskCtx, elements, CANVAS_WIDTH, CANVAS_HEIGHT, 'broadcast');
        }
      };

      if (hasStream) {
        // ── 하단 캔버스: 투명 (WebRTC <video> 가 대신 덮음) ──
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // ── 상단 오버레이 ─────────────────────────────────────
        // PGM stream: /output 이 이미 하단 캔버스(카메라 + 하단 요소 + 자막)를
        //   합성해서 보내므로 비디오 위 요소만 보완 렌더.
        // ATEM USB / camera relay fallback: 원본 PGM/카메라만 보내므로
        //   자막/도형/텍스트 전체를 카메라 위에 다시 합성해야 한다.
        // (WebRTC 스트림은 Output 의 하단 캔버스만 담고 있어 above-video 요소가
        //  누락되므로 Viewer 쪽에서 동일 ELEMENTS_UPDATE 로 직접 보완 렌더)
        if (overlayCtx && overlayCanvas) {
          overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

          if (blackout && isRawCaptureFallback) {
            renderBlackout(overlayCtx, CANVAS_WIDTH, CANVAS_HEIGHT);
          } else if (!blackout) {
            const overlayElements = isRawCaptureFallback
              ? elements.filter((el) => (
                  el.visible &&
                  el.type !== 'video' &&
                  isElementVisibleOn(el, 'broadcast')
                ))
              : elements.filter((el) => {
                  if (!el.visible || !isElementVisibleOn(el, 'broadcast')) return false;
                  if (isElementForcedAboveVideo(el)) return true;
                  if (!isElementVisibleOn(el, 'output')) return true;
                  return maxVidZ >= 0 && el.type !== 'video' && el.zIndex > maxVidZ;
                });

            if (overlayElements.length > 0) {
              renderElements(
                overlayCtx,
                overlayElements,
                sectionText,
                CANVAS_WIDTH,
                CANVAS_HEIGHT,
                { target: 'broadcast' }
              );
            }

            if (isRawCaptureFallback && subtitleText) {
              renderSubtitle(
                overlayCtx,
                subtitleText,
                subtitleStyle as SubtitleStyle,
                CANVAS_WIDTH,
                CANVAS_HEIGHT
              );
            }
          }
        }

        drawMasks();
        updateLastCompositeSnapshot();
        raf = requestAnimationFrame(draw);
        return;
      }

      // ── 폴백 (스트림 없음): 검은 배경 + 모든 요소 + 자막 ──
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 상단 오버레이는 폴백 모드에서 비워둠 (하단이 전부 그림)
      if (overlayCtx && overlayCanvas) {
        overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }

      if (blackout) {
        renderBlackout(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
        drawMasks();
        updateLastCompositeSnapshot();
        raf = requestAnimationFrame(draw);
        return;
      }

      if (elements.length > 0) {
        if (maxVidZ >= 0) {
          // 비디오 요소가 있으면 iframe(z-2) 뒤/앞으로 분리해 그림
          //   하단 캔버스(z-0): 비디오 미만 요소
          //   상단 오버레이(z-3): 비디오 초과 요소 (iframe 위)
          renderElements(
            ctx,
            elements,
            sectionText,
            CANVAS_WIDTH,
            CANVAS_HEIGHT,
            { mode: 'below', videoZIndex: maxVidZ, target: 'broadcast' }
          );
          if (overlayCtx && overlayCanvas) {
            renderElements(
              overlayCtx,
              elements,
              sectionText,
              CANVAS_WIDTH,
              CANVAS_HEIGHT,
              { mode: 'above', videoZIndex: maxVidZ, target: 'broadcast' }
            );
          }
        } else {
          // 비디오 없음 → 전부 하단 캔버스에
          renderElements(ctx, elements, sectionText, CANVAS_WIDTH, CANVAS_HEIGHT, { target: 'broadcast' });
        }
      }

      if (subtitleText) {
        renderSubtitle(
          ctx,
          subtitleText,
          subtitleStyle as SubtitleStyle,
          CANVAS_WIDTH,
          CANVAS_HEIGHT
        );
      }

      drawMasks();
      updateLastCompositeSnapshot();
      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, [updateLastCompositeSnapshot]);

  const hasStream = hasDisplayStream;
  const waiting = !hasStream && !viewer.hasReceived && videoElements.length === 0;

  return (
    <>
      {/* 격자 배경 (대기 상태에서만) */}
      {waiting && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      )}

      {/* ① 캔버스 폴백 (z-0, 가장 아래) — 스트림 없을 때만 실질적으로 그림 */}
      <canvas
        ref={canvasRef}
        data-unolive-pgm-layer="base"
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="absolute inset-0 w-full h-full"
        style={{
          objectFit: 'contain',
          display: 'block',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* ② WebRTC <video> (z-1, 조건부) — 스트림 있을 때만 */}
      {hasStream && (
        <video
          ref={videoRef}
          data-unolive-pgm-video="true"
          autoPlay
          muted
          playsInline
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit: 'contain',
            display: 'block',
            background: 'transparent',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* ③ 영상 레이어 (z-2, 항상) — OutputCanvas 와 동일한 % 배치
             clipMaskId 가 있으면 마스크 모양대로 잘림 */}
      {videoElements.map((vel) => (
        <div
          key={vel.id}
          className="absolute"
          style={{
            left: `${vel.x}%`,
            top: `${vel.y}%`,
            width: `${vel.width}%`,
            height: `${vel.height}%`,
            opacity: vel.opacity,
            transform: vel.rotation ? `rotate(${vel.rotation}deg)` : undefined,
            transformOrigin: 'center center',
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 2,
            ...getClipMaskStyleFor(vel, viewer.elements),
          }}
        >
          {vel.youtubeId ? (
            <iframe
              ref={(el) => {
                if (el && vel.youtubeId) {
                  const prev = iframeRefs.current.get(vel.youtubeId);
                  iframeRefs.current.set(vel.youtubeId, el);
                  // [FEATURE: YT_STANDBY] 새 iframe 이 마운트되면 이전 재생 상태는 무효
                  if (prev !== el) playingIdsRef.current.delete(vel.youtubeId);
                }
              }}
              src={getEmbedUrl(vel.youtubeId, { muted: true })}
              width="100%"
              height="100%"
              style={{ border: 'none', display: 'block', pointerEvents: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          ) : (
            <video
              src={vel.src}
              autoPlay={vel.autoplay}
              muted
              loop={vel.loop}
              playsInline
              preload="auto"
              onCanPlay={(e) => {
                if (vel.autoplay) e.currentTarget.play().catch(() => {});
              }}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                display: 'block',
                objectFit: 'cover',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      ))}

      {/* ④ 상단 오버레이 캔버스 (z-3) — 비디오 위 요소 (shape/text zIndex > videoZIndex) */}
      {/*    WebRTC 스트림은 Output 의 하단 캔버스만 담고 있어 above-video 요소가
             누락되므로 Viewer 쪽에서 ELEMENTS_UPDATE 기반으로 직접 보완 렌더합니다. */}
      <canvas
        ref={overlayCanvasRef}
        data-unolive-pgm-layer="overlay"
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="absolute inset-0 w-full h-full"
        style={{
          objectFit: 'contain',
          display: 'block',
          pointerEvents: 'none',
          zIndex: 3,
        }}
      />

      {/* ⑤ 스크린 마스크: 미러 최종 화면 위에 얹는 안전 가림막 */}
      <canvas
        ref={maskCanvasRef}
        data-unolive-pgm-layer="mask"
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="absolute inset-0 w-full h-full"
        style={{
          objectFit: 'contain',
          display: 'block',
          pointerEvents: 'none',
          zIndex: 4,
        }}
      />

      {/* ⑥ 수신 대기 오버레이 (z-5) */}
      {waiting && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 5 }}
        >
          <div className="flex items-center gap-3 text-gray-400">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <line x1="12" y1="6" x2="12" y2="18" />
            </svg>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-rose-400 tracking-wider uppercase flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    viewer.connected ? 'bg-rose-500 animate-pulse' : 'bg-gray-600'
                  }`}
                />
                {viewer.connected ? 'UnoLive 연결됨' : 'Socket.io 대기 중'}
              </span>
              <span className="text-[9px] text-gray-500 tracking-wider uppercase">
                ATEM USB PGM 또는 Output PC 송출 대기
              </span>
              <span className="mt-2 text-[10px] text-gray-400">
                우측 상단 USB PGM 입력 설정 창에서 장치를 선택하세요.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ⑦ USB PGM 입력 설정 창 — 스트림 수신 후에도 계속 유지 (닫기 가능, 상단 링크로 재열기) */}
      {!showPgmPanel && (
        <button
          type="button"
          onClick={() => setShowPgmPanel(true)}
          title="USB PGM 입력 설정 열기"
          className="absolute right-3 top-3 rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-[10px] font-bold text-emerald-300 shadow-lg backdrop-blur-md hover:bg-black/85"
          style={{ zIndex: 7 }}
        >
          USB PGM 입력 ▾
        </button>
      )}
      {showPgmPanel && (
      <div
        className="absolute right-3 top-3 w-[360px] max-w-[calc(100%-24px)] rounded-xl border border-white/15 bg-black/75 p-3 text-white shadow-2xl backdrop-blur-md"
        style={{ zIndex: 7 }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold tracking-wider text-emerald-300 uppercase">
              USB PGM 입력
            </p>
            <p className="mt-0.5 text-[9px] text-gray-400">
              ATEM Extreme USB Out / 캡처 장치 선택
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                localCaptureStatus === 'connected'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : localCaptureStatus === 'failed'
                  ? 'bg-amber-500/20 text-amber-200'
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              {localCaptureStatus === 'connected'
                ? 'USB LIVE'
                : localCaptureStatus === 'requesting'
                ? '연결 중'
                : '대기'}
            </span>
            <button
              type="button"
              onClick={() => setShowPgmPanel(false)}
              title="설정 창 닫기"
              className="flex h-5 w-5 items-center justify-center rounded text-sm leading-none text-gray-400 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadVideoInputDevices}
              disabled={deviceScanStatus === 'requesting'}
              className="rounded bg-gray-800 px-3 py-1.5 text-[11px] font-bold text-gray-100 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-500"
            >
              {deviceScanStatus === 'requesting' ? 'USB 장치 검색 중...' : 'USB 장치 검색'}
            </button>
            <button
              type="button"
              onClick={startLocalAtemCapture}
              disabled={localCaptureStatus === 'requesting'}
              className="rounded bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-400"
            >
              {localCaptureStatus === 'requesting' ? '연결 중...' : '선택 장치 PGM 사용'}
            </button>
          </div>

          {secureOriginHelp && !secureOriginHelp.isSecureContext && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-[10px] leading-relaxed text-amber-100">
              <p className="font-bold text-amber-200">
                IP 주소 접속은 Chrome 카메라 권한이 차단됩니다.
              </p>
              <p className="mt-1 text-amber-100/85">
                아래 명령으로 Chrome을 다시 열면 이 주소를 보안 예외로 인정해서 USB 캡처 권한 요청이 가능합니다.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => copySecureOriginCommand('windows', secureOriginHelp.windowsCommand)}
                  className="rounded bg-amber-300 px-2 py-1 font-bold text-black hover:bg-amber-200"
                >
                  {copiedSecureOriginCommand === 'windows' ? 'Windows 명령 복사됨' : 'Windows 명령 복사'}
                </button>
                <button
                  type="button"
                  onClick={() => copySecureOriginCommand('mac', secureOriginHelp.macCommand)}
                  className="rounded bg-white/15 px-2 py-1 font-bold text-white hover:bg-white/25"
                >
                  {copiedSecureOriginCommand === 'mac' ? 'Mac 명령 복사됨' : 'Mac 명령 복사'}
                </button>
              </div>
              <p className="mt-2 break-all font-mono text-[9px] text-amber-50/80">
                {secureOriginHelp.origin}
              </p>
              {manualSecureOriginCommand && (
                <div className="mt-2 rounded border border-white/15 bg-black/45 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-bold text-amber-100">
                      {manualSecureOriginCommand.kind === 'windows' ? 'Windows 실행 명령' : 'Mac 실행 명령'}
                    </span>
                    <span className="text-[9px] text-amber-50/65">
                      클릭하면 전체 선택
                    </span>
                  </div>
                  <textarea
                    readOnly
                    value={manualSecureOriginCommand.command}
                    onFocus={(event) => event.currentTarget.select()}
                    onClick={(event) => event.currentTarget.select()}
                    className="h-20 w-full resize-none rounded border border-white/10 bg-black/70 p-2 font-mono text-[9px] leading-relaxed text-white outline-none"
                  />
                </div>
              )}
            </div>
          )}

          <select
            value={selectedVideoDeviceId}
            onChange={(event) => setSelectedVideoDeviceId(event.target.value)}
            className="w-full rounded border border-white/15 bg-black/80 px-2 py-1.5 text-[11px] font-semibold text-white outline-none"
          >
            {videoInputDevices.length === 0 ? (
              <option value="">USB 장치 검색을 먼저 누르세요</option>
            ) : (
              videoInputDevices.map((device, index) => (
                <option key={device.deviceId || index} value={device.deviceId}>
                  {device.label || `USB 비디오 입력 ${index + 1}`}
                </option>
              ))
            )}
          </select>

          {selectedVideoDeviceLabel && (
            <p className="text-[10px] text-gray-300">
              선택됨: <span className="font-semibold text-white">{selectedVideoDeviceLabel}</span>
              {selectedVideoDeviceIsAtem ? (
                <span className="ml-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200">
                  ATEM/Blackmagic 후보
                </span>
              ) : null}
            </p>
          )}
          {deviceScanStatus === 'ready' && videoInputDevices.length === 0 && (
            <span className="text-[10px] leading-relaxed text-amber-300">
              이 컴퓨터에서 USB 비디오 입력 장치를 찾지 못했습니다.
            </span>
          )}
          {localCaptureError && (
            <span className="text-[10px] leading-relaxed text-amber-300">
              {localCaptureError}
            </span>
          )}
        </div>
      </div>
      )}

      {/* ⑧ WebRTC 상태 배지 — 좌하단 (스트림 수신 중에만) */}
      {hasStream && (
        <div
          className="absolute bottom-3 left-20 flex items-center gap-1.5 px-2 py-1 rounded bg-black/60 backdrop-blur-sm border border-white/10 pointer-events-none"
          style={{ zIndex: 6 }}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              (displayStreamKind === 'pgm'
                ? streamConnected
                : displayStreamKind === 'atem-usb'
                ? localCaptureStatus === 'connected'
                : cameraRelayConnected)
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-amber-400 animate-pulse'
            }`}
          />
          <span className="text-[9px] font-bold tracking-wider text-white uppercase">
            {displayStreamKind === 'pgm'
              ? `WebRTC ${streamConnected ? 'Live' : 'Negotiating'}`
              : displayStreamKind === 'atem-usb'
              ? `ATEM USB ${localCaptureStatus === 'connected' ? 'Live' : 'Ready'}`
              : `Camera Relay ${cameraRelayConnected ? 'Live' : 'Negotiating'}`}
          </span>
        </div>
      )}

      {/* [FEATURE: SECTION_TRANSITION] 섹션 전환 오버레이 */}
      {sectionTransition && (
        <SectionTransitionOverlay
          snapshot={sectionTransition.snapshot}
          type={sectionTransition.type}
          duration={sectionTransition.duration}
          onComplete={() => {
            transitionActiveRef.current = false;
            setSectionTransition(null);
          }}
        />
      )}
    </>
  );
}
