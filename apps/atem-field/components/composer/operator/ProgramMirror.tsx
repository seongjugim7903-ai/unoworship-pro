'use client';

/**
 * ProgramMirror — 우측 오퍼레이터 패널 상단의 "최종 PGM" 미러
 *
 * [경량화 결정 — 2026-04]
 *   이 미러는 WebRTC 스트림만 표시합니다. 유튜브 iframe / 비디오-위 요소
 *   오버레이 / 모션 애니메이션 레이어는 의도적으로 **비활성화** 상태입니다.
 *   섹션 전환 효과도 적용하지 않습니다. Compose 우측 PGM 은 운영자 확인용
 *   저지연 모니터라서 /prompt 처럼 항상 cut 체감으로 표시합니다.
 *
 *   이유:
 *     - 에디터 본창과 미러에 유튜브 iframe 이 동시에 뜨면 composer Chrome 프로필
 *       안에 YouTube 플레이어가 중복 생겨 네트워크/CPU 부하가 크고, 재생 위치
 *       동기화도 지연됩니다.
 *     - 미러는 "지금 송출되고 있는 화면의 대략적 상태" 확인용이면 충분.
 *     - 유튜브 영상과 모션은 강대상 본창 (/output) 에서만 재생되도록 보류.
 *
 *   복구 가이드:
 *     - 아래 [DISABLED: YT_OVERLAY] 블록을 주석 해제하면 YouTube iframe 오버레이 복원
 *     - 아래 [DISABLED: OVERLAY_CANVAS] 블록을 주석 해제하면 비디오 위 요소 재렌더 복원
 *     - BroadcastFeedMirror 가 완전판 구현 예시이므로 참고.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { useBroadcastVideoStream } from '@/hooks/useBroadcastVideoStream';
import { useCamerasVideoStream } from '@/hooks/useCamerasVideoStream'; // [FEATURE: PGM_RELAY]

const PGM_CAPTURE_DEVICE_KEY = 'unolive-pgm-capture-device';
// 맥 릴레이 소스 식별자 — 실제 deviceId와 충돌하지 않는 예약값
const PGM_RELAY_SOURCE_ID = '__relay__';
// [DISABLED: YT_OVERLAY] YouTube iframe 오버레이 복원 시 아래 import 들 필요
// import { useMemo } from 'react';
// import { useBroadcastViewer } from '@/hooks/useBroadcastViewer';
// import { getSocket } from '@/lib/socketClient';
// import { SOCKET_EVENTS, type SocketMessage } from '@/lib/socketEvents';
// import { renderElements } from '@/lib/canvasRenderer';
// import { getEmbedUrl } from '@/lib/youtube';
// import type { VideoElement, CanvasElement } from '@/lib/canvasTypes';

// [DISABLED: OVERLAY_CANVAS] 비디오 위 요소 오버레이 복원 시 필요
// const CANVAS_WIDTH = 1920;
// const CANVAS_HEIGHT = 1080;

export default function ProgramMirror() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const broadcastSection = useStore((s) => s.broadcastSection);
  const isBlackout = useStore((s) => s.isBlackout);

  const { stream, connected, connectionState } = useBroadcastVideoStream({ lowLatency: true });

  // PGM 소스: 빈 문자열 = 내부 합성(WebRTC), '__relay__' = 맥 릴레이(최종영상).
  // [2026-07-08] 브라우저 직접 캡처(웹캠아웃 장치 선택) 경로는 제거 — 최종영상은
  // 맥의 카메라릴레이가 발행하는 스트림 하나로 통일 (카메라 1~4 그리드와 같은 소스).
  // 과거에 장치 id를 저장해 둔 브라우저는 자동으로 릴레이로 마이그레이션.
  const [captureDeviceId, setCaptureDeviceId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem(PGM_CAPTURE_DEVICE_KEY) || null;
    if (saved && saved !== PGM_RELAY_SOURCE_ID) return PGM_RELAY_SOURCE_ID; // 구 장치 id → 릴레이
    return saved;
  });

  // [FEATURE: PGM_RELAY] 맥 릴레이 — 카메라릴레이(/cameras-source)가 발행하는 스트림을
  // 풀화면으로 수신. 어느 컴포저(노트북/iPad/맥)에서든 동일하게 최종영상을 본다.
  const usingRelay = captureDeviceId === PGM_RELAY_SOURCE_ID;
  const relay = useCamerasVideoStream();

  const activeStream = usingRelay ? relay.stream : stream;
  const isConnected = usingRelay ? relay.connected : connected;

  const selectSource = useCallback((value: string) => {
    const id = value || null;
    setCaptureDeviceId(id);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem(PGM_CAPTURE_DEVICE_KEY, id);
      else localStorage.removeItem(PGM_CAPTURE_DEVICE_KEY);
    }
  }, []);

  // [DISABLED: YT_OVERLAY] YouTube iframe refs + playing state 추적
  // const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());
  // const playingIdsRef = useRef<Set<string>>(new Set());
  // const viewer = useBroadcastViewer();
  // const videoElements = useMemo<VideoElement[]>(() => {
  //   return viewer.elements.filter(
  //     (el): el is VideoElement => el.type === 'video' && el.visible && !!el.youtubeId,
  //   );
  // }, [viewer.elements]);

  // Compose 우측 PGM 은 "전환 효과 없는 cut-only 저지연 프리뷰"로 고정한다.
  // CSS transition/animation 없이 WebRTC 프레임을 그대로 표시한다.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.disableRemotePlayback = true;
    video.style.transition = 'none';
    video.style.animation = 'none';
    video.style.willChange = 'contents';
  }, []);

  // WebRTC MediaStream 바인딩 — stream 교체 시에도 fade/slide 없이 즉시 cut.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const playNow = () => {
      video.play().catch(() => {});
    };

    if (activeStream && video.srcObject !== activeStream) {
      video.srcObject = activeStream;
      video.onloadedmetadata = playNow;
      video.oncanplay = playNow;
      playNow();
    } else if (!activeStream && video.srcObject) {
      video.srcObject = null;
      video.onloadedmetadata = null;
      video.oncanplay = null;
    }

    return () => {
      video.onloadedmetadata = null;
      video.oncanplay = null;
    };
  }, [activeStream]);

  // [DISABLED: YT_OVERLAY] VIDEO_COMMAND 수신 → YouTube iframe postMessage
  //   미러의 유튜브 재생 활성화 시 복원
  // useEffect(() => {
  //   const socket = getSocket();
  //   if (!socket) return;
  //   const handleBroadcast = (msg: SocketMessage) => {
  //     if (msg.type !== 'VIDEO_COMMAND') return;
  //     const { youtubeId, command, args } = msg.payload;
  //     const sendOnce = () => {
  //       const iframe = iframeRefs.current.get(youtubeId);
  //       if (!iframe?.contentWindow) return false;
  //       iframe.contentWindow.postMessage(
  //         JSON.stringify({ event: 'listening', id: 0 }),
  //         'https://www.youtube.com',
  //       );
  //       iframe.contentWindow.postMessage(
  //         JSON.stringify({ event: 'command', func: command, args: args ?? [] }),
  //         'https://www.youtube.com',
  //       );
  //       return true;
  //     };
  //     if (command === 'playVideo') {
  //       const delays = [0, 500, 1100, 2000, 3200];
  //       for (const delay of delays) {
  //         setTimeout(() => {
  //           if (playingIdsRef.current.has(youtubeId)) return;
  //           sendOnce();
  //         }, delay);
  //       }
  //     } else if (command === 'seekTo') {
  //       const seekDelays = [0, 300, 800, 1500];
  //       for (const delay of seekDelays) setTimeout(() => sendOnce(), delay);
  //     } else {
  //       sendOnce();
  //     }
  //   };
  //   socket.on(SOCKET_EVENTS.BROADCAST, handleBroadcast);
  //   return () => { socket.off(SOCKET_EVENTS.BROADCAST, handleBroadcast); };
  // }, []);

  // [DISABLED: YT_OVERLAY] YouTube onStateChange 수신 → playingIds 갱신
  // useEffect(() => {
  //   const handleYouTubeMessage = (e: MessageEvent) => {
  //     if (e.origin !== 'https://www.youtube.com') return;
  //     try {
  //       const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
  //       if (data?.event !== 'onStateChange' || typeof data.info !== 'number') return;
  //       for (const [id, iframe] of iframeRefs.current.entries()) {
  //         if (iframe.contentWindow === e.source) {
  //           if (data.info === 1) playingIdsRef.current.add(id);
  //           else if (data.info === 0 || data.info === 2) playingIdsRef.current.delete(id);
  //           break;
  //         }
  //       }
  //     } catch { /* ignore */ }
  //   };
  //   window.addEventListener('message', handleYouTubeMessage);
  //   return () => window.removeEventListener('message', handleYouTubeMessage);
  // }, []);

  // [DISABLED: OVERLAY_CANVAS] 비디오 위 요소 오버레이 렌더 루프
  //   canvas stream 에 포함되지 않는 "비디오보다 z-index 높은" 요소들을
  //   미러에서 직접 그려 보완하던 로직. 부하가 커서 보류.
  // useEffect(() => {
  //   const overlay = overlayCanvasRef.current;
  //   if (!overlay) return;
  //   const overlayCtx = overlay.getContext('2d');
  //   if (!overlayCtx) return;
  //   let raf = 0;
  //   const draw = () => {
  //     const { elements, sectionText, blackout } = stateRef.current;
  //     overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  //     if (!blackout && elements.length > 0) {
  //       const vidEls = elements.filter((e) => e.type === 'video' && e.visible);
  //       const maxVidZ = vidEls.length > 0 ? Math.max(...vidEls.map((v) => v.zIndex)) : -1;
  //       if (maxVidZ >= 0) {
  //         renderElements(overlayCtx, elements, sectionText, CANVAS_WIDTH, CANVAS_HEIGHT,
  //           { mode: 'above', videoZIndex: maxVidZ });
  //       }
  //     }
  //     raf = requestAnimationFrame(draw);
  //   };
  //   draw();
  //   return () => cancelAnimationFrame(raf);
  // }, []);

  const source: 'live' | 'idle' = broadcastSection ? 'live' : 'idle';

  return (
    <div className="px-4 py-3 border-b border-[#222222]">
      <div className="flex items-center justify-between mb-2 gap-2">
        <p className="flex-shrink-0 text-xs text-gray-500">PGM · 최종 송출</p>
        <div className="flex min-w-0 items-center gap-1.5">
          <select
            value={captureDeviceId ?? ''}
            onChange={(e) => selectSource(e.target.value)}
            title="PGM 소스 — 맥 릴레이(최종영상) 또는 내부 합성(WebRTC)"
            className="h-6 min-w-0 max-w-[140px] rounded border border-[#333] bg-[#0a0a0a] px-1.5 text-[10px] text-gray-300 outline-none focus:border-blue-500"
          >
            <option value={PGM_RELAY_SOURCE_ID}>맥 릴레이 (최종영상)</option>
            <option value="">내부 합성</option>
          </select>
          <span
            className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${
              isConnected ? 'bg-green-500' :
              (usingRelay ? relay.connectionState === 'connecting' : connectionState === 'connecting') ? 'bg-yellow-500 animate-pulse' :
              'bg-gray-600'
            }`}
            title={usingRelay ? `맥 릴레이: ${relay.connectionState}` : `WebRTC: ${connectionState}`}
          />
        </div>
      </div>

      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-[#222222]">
        {/* ① WebRTC 비디오 (카메라 + 자막 + 도형 + 비디오 하단 요소) */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit: 'contain',
            zIndex: 1,
            pointerEvents: 'none',
            transition: 'none',
            animation: 'none',
            background: '#000000',
          }}
        />

        {/* [DISABLED: YT_OVERLAY] YouTube iframe 레이어 (z-2) — 복원 시 주석 해제 */}
        {/* {videoElements.map((vel) => (
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
            }}
          >
            <iframe
              ref={(el) => {
                if (el && vel.youtubeId) {
                  const prev = iframeRefs.current.get(vel.youtubeId);
                  iframeRefs.current.set(vel.youtubeId, el);
                  if (prev !== el) playingIdsRef.current.delete(vel.youtubeId);
                }
              }}
              src={vel.youtubeId ? getEmbedUrl(vel.youtubeId) : vel.src}
              width="100%"
              height="100%"
              style={{ border: 'none', display: 'block', pointerEvents: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        ))} */}

        {/* [DISABLED: OVERLAY_CANVAS] 비디오 위 요소 오버레이 (z-3) */}
        {/* <canvas
          ref={overlayCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: 'contain', zIndex: 3, pointerEvents: 'none' }}
        /> */}

        {/* 스트림 없을 때 대기 UI */}
        {!isConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-gray-500 text-xs z-20">
            <div className="w-5 h-5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mb-2" />
            <span className="px-4 text-center">
              {usingRelay ? (
                <>
                  {relay.connectionState === 'connecting' ? '맥 릴레이 연결 중...' : '맥 릴레이 대기'}
                  <br />
                  <span className="text-[9px] text-gray-600">
                    맥에서 카메라릴레이 아이콘이 실행 중인지 확인
                  </span>
                </>
              ) : (
                <>
                  {connectionState === 'idle' && '대기 중...'}
                  {connectionState === 'connecting' && '연결 중...'}
                  {connectionState === 'disconnected' && '강대상 연결 끊김'}
                  {connectionState === 'failed' && '연결 실패'}
                  {connectionState === 'closed' && '닫힘'}
                </>
              )}
            </span>
          </div>
        )}

        {/* 블랙아웃 오버레이 */}
        {isBlackout && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/95 z-30">
            <span className="px-3 py-1 rounded bg-red-600/90 text-white text-xs font-bold tracking-wider">
              BLACKOUT
            </span>
          </div>
        )}

        {/* 상태 배지 */}
        {isConnected && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm z-10">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${
              usingRelay ? 'bg-red-500' :
              source === 'live' ? 'bg-red-500 animate-pulse' : 'bg-emerald-400'
            }`} />
            <span className="text-[9px] font-bold text-white tracking-wider">
              {usingRelay ? 'ATEM PGM' : source === 'live' ? 'LIVE' : 'PREVIEW'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
