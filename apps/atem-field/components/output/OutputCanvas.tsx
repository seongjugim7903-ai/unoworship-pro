'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useCamera } from '@/hooks/useCamera';
import { useAutoCamera } from '@/hooks/useAutoCamera'; // [FEATURE: AUTO_CAMERA]
import { useSocketReceiver } from '@/hooks/useSocketReceiver'; // [FEATURE: SOCKET_IO]
import { useBroadcastPublisher } from '@/hooks/useBroadcastPublisher'; // [FEATURE: BROADCAST_VIEWER / WEBRTC]
import { SubtitleStyle, DEFAULT_SUBTITLE_STYLE } from '@/lib/types';
import { CanvasElement, VideoElement, isElementVisibleOn } from '@/lib/canvasTypes';
import { SocketMessage, isSocketMessageTargetedTo } from '@/lib/socketEvents'; // [FEATURE: SOCKET_IO]
import { renderSubtitle, renderBlackout, renderNoCamera } from '@/lib/subtitleRenderer';
import { isElementForcedAboveVideo, preloadImages, renderElements, renderScreenMasks } from '@/lib/canvasRenderer';
import { getClipMaskStyleFor } from '@/lib/clipMaskStyle'; // [FEATURE: SHAPE_YOUTUBE_CLIP]
import { getEmbedUrl } from '@/lib/youtube';
import { interpolateElements, hasMotion } from '@/lib/motionEngine';
import SectionTransitionOverlay from '@/components/scenes/SectionTransitionOverlay';
import type { SectionTransitionSnapshot } from '@/components/scenes/SectionTransitionOverlay';
import LatencyDebugOverlay from '@/components/debug/LatencyDebugOverlay';
import {
  completeLatencyEntry,
  createLatencyEntry,
  isLatencyDebugEnabled,
  upsertLatencyEntry,
  type LatencyDiagnosticEntry,
} from '@/lib/latencyDiagnostics';

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const MAX_OUTPUT_FRAME_CACHE_ENTRIES = 40;

type OutputStaticLayerCache = {
  enabled: boolean;
  baseCanvas: HTMLCanvasElement | null;
  overlayCanvas: HTMLCanvasElement | null;
  maskCanvas: HTMLCanvasElement | null;
  hasBaseLayer: boolean;
  hasOverlayLayer: boolean;
  hasMaskLayer: boolean;
  maxVideoZIndex: number;
};

function createEmptyStaticLayerCache(): OutputStaticLayerCache {
  return {
    enabled: false,
    baseCanvas: null,
    overlayCanvas: null,
    maskCanvas: null,
    hasBaseLayer: false,
    hasOverlayLayer: false,
    hasMaskLayer: false,
    maxVideoZIndex: -1,
  };
}

function createLayerCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  return canvas;
}

function buildStaticLayerCache(
  elements: CanvasElement[],
  sectionText: string,
): OutputStaticLayerCache {
  if (elements.length === 0 || hasMotion(elements)) {
    return createEmptyStaticLayerCache();
  }

  const visibleOutputElements = elements.filter((el) => (
    el.visible &&
    isElementVisibleOn(el, 'output') &&
    el.layerRole !== 'mask'
  ));
  const videoElements = visibleOutputElements.filter((el) => el.type === 'video');
  const maxVideoZIndex = videoElements.length > 0
    ? Math.max(...videoElements.map((el) => el.zIndex))
    : -1;

  const hasBaseLayer = visibleOutputElements.some((el) => {
    if (maxVideoZIndex < 0) return true;
    return !isElementForcedAboveVideo(el) && el.zIndex < maxVideoZIndex;
  });
  const hasOverlayLayer = maxVideoZIndex >= 0 && visibleOutputElements.some((el) => (
    el.type !== 'video' &&
    (el.zIndex > maxVideoZIndex || isElementForcedAboveVideo(el))
  ));
  const hasMaskLayer = elements.some((el) => (
    el.visible &&
    el.layerRole === 'mask' &&
    isElementVisibleOn(el, 'output')
  ));

  const baseCanvas = hasBaseLayer ? createLayerCanvas() : null;
  const baseCtx = baseCanvas?.getContext('2d') ?? null;
  if (baseCtx) {
    if (maxVideoZIndex >= 0) {
      renderElements(baseCtx, elements, sectionText, CANVAS_WIDTH, CANVAS_HEIGHT, {
        mode: 'below',
        videoZIndex: maxVideoZIndex,
        target: 'output',
      });
    } else {
      renderElements(baseCtx, elements, sectionText, CANVAS_WIDTH, CANVAS_HEIGHT, { target: 'output' });
    }
  }

  const overlayCanvas = hasOverlayLayer ? createLayerCanvas() : null;
  const overlayCtx = overlayCanvas?.getContext('2d') ?? null;
  if (overlayCtx) {
    renderElements(overlayCtx, elements, sectionText, CANVAS_WIDTH, CANVAS_HEIGHT, {
      mode: 'above',
      videoZIndex: maxVideoZIndex,
      target: 'output',
    });
  }

  const maskCanvas = hasMaskLayer ? createLayerCanvas() : null;
  const maskCtx = maskCanvas?.getContext('2d') ?? null;
  if (maskCtx) {
    renderScreenMasks(maskCtx, elements, CANVAS_WIDTH, CANVAS_HEIGHT, 'output');
  }

  return {
    enabled: true,
    baseCanvas,
    overlayCanvas,
    maskCanvas,
    hasBaseLayer,
    hasOverlayLayer,
    hasMaskLayer,
    maxVideoZIndex,
  };
}

function trimOutputFrameCache(cache: Map<string, HTMLImageElement>): void {
  while (cache.size > MAX_OUTPUT_FRAME_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) return;
    cache.delete(oldestKey);
  }
}

function setOutputFrameCacheEntry(
  cache: Map<string, HTMLImageElement>,
  sectionId: string,
  img: HTMLImageElement,
): void {
  cache.delete(sectionId);
  cache.set(sectionId, img);
  trimOutputFrameCache(cache);
}

function isImageMostlyOpaque(img: HTMLImageElement): boolean {
  if (typeof document === 'undefined' || !img.complete || img.naturalWidth <= 0) return false;

  try {
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 32;
    sampleCanvas.height = 18;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!sampleCtx) return false;
    sampleCtx.drawImage(img, 0, 0, sampleCanvas.width, sampleCanvas.height);
    const data = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 248) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function setLatencyDetails(
  entry: LatencyDiagnosticEntry | null,
  details: Partial<LatencyDiagnosticEntry>,
): void {
  if (!entry) return;
  Object.assign(entry, details);
}

export default function OutputCanvas({ isMirror = false }: { isMirror?: boolean } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);       // 하단 캔버스 (배경 + 비디오 아래 요소)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null); // 상단 캔버스 (비디오 위 요소)
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);    // 최상단 스크린 마스크
  const containerRef = useRef<HTMLDivElement>(null);
  const [subtitleText,  setSubtitleText]  = useState('');
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
  const [elements,      setElements]      = useState<CanvasElement[]>([]);
  const [sectionText,   setSectionText]   = useState('');
  const [isBlackout,    setIsBlackout]    = useState(false);
  const [latencyDebugEnabled, setLatencyDebugEnabled] = useState(false);
  const latencyDebugEnabledRef = useRef(false);
  const [latencyEntries, setLatencyEntries] = useState<LatencyDiagnosticEntry[]>([]);
  const pendingLatencyPaintRef = useRef<LatencyDiagnosticEntry | null>(null);
  const latencyReporterRef = useRef<(entry: LatencyDiagnosticEntry) => void>(() => undefined);

  // YouTube iframe refs (youtubeId → iframe)
  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());

  // [FEATURE: YT_STANDBY] 각 YouTube 플레이어의 재생 상태 추적.
  // receiver 가 VIDEO_COMMAND (playVideo) 를 받을 때 이미 재생 중(state=1)이면
  // 중복 명령을 스킵해서 "다다다다" 스터터를 방지.
  // onStateChange 이벤트를 구독하여 갱신 (1=playing, 2=paused, 0=ended, ...).
  const playingIdsRef = useRef<Set<string>>(new Set());

  // [FEATURE: YT_TIMELINE] 대기 중인 seek 대상 시각 (youtubeId → seconds).
  //   state=1 진입 순간 한 번 더 seekTo 를 강제하여 0:00 부터 재생되는 문제 방지.
  const pendingSeekRef = useRef<Map<string, number>>(new Map());

  // 모션 애니메이션 시작 시각 (ELEMENTS_UPDATE 수신 시 설정)
  const motionStartRef = useRef<number>(0);

  // [FEATURE: FRAME_PRERENDER] 컴포저에서 프리렌더링된 완성 프레임
  const preRenderedFrameRef = useRef<HTMLImageElement | null>(null);
  const preRenderedFrameOpaqueRef = useRef(false);
  const frameOpacityCacheRef = useRef<WeakMap<HTMLImageElement, boolean>>(new WeakMap());
  const staticLayerCacheRef = useRef<OutputStaticLayerCache>(createEmptyStaticLayerCache());
  const [frameRevision, setFrameRevision] = useState(0);

  // [FEATURE: FRAME_CACHE] 출력 모니터 로컬 프레임 캐시 (sectionId → Image)
  const outputFrameCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const pendingFrameShowRef = useRef<null | {
    sectionId: string;
    sectionText: string;
    hasMotion: boolean;
    latencyEntry: LatencyDiagnosticEntry | null;
  }>(null);
  const youtubeCommandTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const activatePreRenderedFrame = useCallback((img: HTMLImageElement, options?: { triggerRender?: boolean }) => {
    let opaque = frameOpacityCacheRef.current.get(img);
    if (opaque === undefined) {
      opaque = isImageMostlyOpaque(img);
      frameOpacityCacheRef.current.set(img, opaque);
    }
    preRenderedFrameRef.current = img;
    preRenderedFrameOpaqueRef.current = opaque;
    if (options?.triggerRender !== false) {
      setFrameRevision((current) => current + 1);
    }
    return opaque;
  }, []);

  const clearPreRenderedFrame = useCallback(() => {
    preRenderedFrameRef.current = null;
    preRenderedFrameOpaqueRef.current = false;
    setFrameRevision((current) => current + 1);
  }, []);

  // [FEATURE: SECTION_TRANSITION] 진행 중인 섹션 전환 (이전 프레임 스냅샷 + 타입)
  const [sectionTransition, setSectionTransition] = useState<null | {
    snapshot: SectionTransitionSnapshot;
    type: 'fade' | 'slide' | 'dip-to-black';
    duration: number;
  }>(null);

  // [FEATURE: AUTO_CAMERA] 자동 카메라 연결
  //   iframe 미러에서는 카메라 권한이 부모 창 정책에 종속되어 불안정 →
  //   권한 에러를 피하기 위해 미러 모드에서는 카메라 스킵.
  //   대신 BroadcastFeedMirror(/media/broadcast) 처럼 향후 WebRTC 스트림
  //   수신 방식으로 변경 가능.
  const {
    deviceId: cameraDeviceId,
    selectCamera,
    openSelector: handleDoubleClick,
  } = useAutoCamera({ skip: isMirror });

  const { videoRef } = useCamera(cameraDeviceId, { skip: isMirror });

  useEffect(() => {
    const enabled = isLatencyDebugEnabled();
    latencyDebugEnabledRef.current = enabled;
    const timer = window.setTimeout(() => setLatencyDebugEnabled(enabled), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const recordLatencyReceive = useCallback((msg: SocketMessage) => {
    if (!msg.trace) return null;
    const entry = createLatencyEntry(msg, 'output');
    if (!entry) return null;
    if (latencyDebugEnabledRef.current) {
      setLatencyEntries((current) => upsertLatencyEntry(current, entry));
    }
    return entry;
  }, []);

  const queueLatencyPaint = useCallback((entry: LatencyDiagnosticEntry | null) => {
    if (!entry) return;
    pendingLatencyPaintRef.current = entry;
  }, []);

  const markLatencyPainted = useCallback(() => {
    const entry = pendingLatencyPaintRef.current;
    if (!entry) return;

    pendingLatencyPaintRef.current = null;
    const completed = completeLatencyEntry(entry);
    latencyReporterRef.current(completed);

    if (latencyDebugEnabledRef.current) {
      setLatencyEntries((current) => upsertLatencyEntry(current, completed));
      console.info('[unolive:latency]', completed);
    }
  }, []);

  const paintPreRenderedFrameNow = useCallback((img: HTMLImageElement, latencyEntry: LatencyDiagnosticEntry | null) => {
    const paintStart = performance.now();
    const canvas = canvasRef.current;
    if (!canvas || !img.complete || img.naturalWidth <= 0) return false;

    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const activateStart = performance.now();
    const opaque = activatePreRenderedFrame(img, { triggerRender: false });
    const activateEnd = performance.now();
    const video = videoRef.current;
    const hasReadableCamera = !!video && video.readyState >= 2;
    let basePath: 'clear' | 'camera' | 'no-camera';

    const baseStart = performance.now();
    if (opaque) {
      basePath = 'clear';
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else if (hasReadableCamera && video) {
      basePath = 'camera';
      ctx.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
      basePath = 'no-camera';
      renderNoCamera(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    const baseEnd = performance.now();

    const frameStart = performance.now();
    ctx.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const frameEnd = performance.now();

    const overlayCtx = overlayCanvasRef.current?.getContext('2d') ?? null;
    const overlayStart = performance.now();
    if (overlayCtx) overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const overlayEnd = performance.now();

    const maskCtx = maskCanvasRef.current?.getContext('2d') ?? null;
    const maskStart = performance.now();
    if (maskCtx) maskCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const maskEnd = performance.now();

    if (latencyEntry) {
      setLatencyDetails(latencyEntry, {
        prePaintWaitMs: paintStart - latencyEntry.receivedPerfAt,
        paintPath: 'immediate-frame',
        paintBasePath: basePath,
        paintOpaque: opaque,
        paintHadReadableCamera: hasReadableCamera,
        paintActivateMs: activateEnd - activateStart,
        paintBaseMs: baseEnd - baseStart,
        paintFrameMs: frameEnd - frameStart,
        paintOverlayClearMs: overlayEnd - overlayStart,
        paintMaskClearMs: maskEnd - maskStart,
        paintTotalMs: performance.now() - paintStart,
      });
      pendingLatencyPaintRef.current = latencyEntry;
      markLatencyPainted();
    }

    return true;
  }, [activatePreRenderedFrame, markLatencyPainted, videoRef]);

  // State refs for animation loop
  const stateRef = useRef({
    subtitleText: '',
    subtitleStyle: DEFAULT_SUBTITLE_STYLE,
    elements: [] as CanvasElement[],
    sectionText: '',
    isBlackout: false,
  });

  useEffect(() => {
    stateRef.current = { subtitleText, subtitleStyle, elements, sectionText, isBlackout };
  }, [subtitleText, subtitleStyle, elements, sectionText, isBlackout]);

  // 영상 요소 추출: YouTube iframe + 서버에 업로드된 로컬 영상 파일
  const videoElements = useMemo(() => {
    return elements.filter(
      (el): el is VideoElement =>
        el.type === 'video' && el.visible && isElementVisibleOn(el, 'output') && (!!el.youtubeId || !!el.src)
    );
  }, [elements]);

  useEffect(() => {
    const activeIds = new Set(videoElements.map((video) => video.youtubeId).filter(Boolean));
    for (const youtubeId of iframeRefs.current.keys()) {
      if (activeIds.has(youtubeId)) continue;
      iframeRefs.current.delete(youtubeId);
      playingIdsRef.current.delete(youtubeId);
      pendingSeekRef.current.delete(youtubeId);
    }
  }, [videoElements]);

  // [FEATURE: SECTION_TRANSITION] 전환 시작 — 현재 canvas 스냅샷 캡처 후 overlay state 셋
  const triggerTransition = useCallback((transition: { type: string; duration: number } | undefined) => {
    if (!transition || transition.type === 'cut' || transition.duration <= 0) return;
    const t = transition.type as 'fade' | 'slide' | 'dip-to-black';
    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!canvas) return;

    try {
      const composite = document.createElement('canvas');
      composite.width = CANVAS_WIDTH;
      composite.height = CANVAS_HEIGHT;
      const ctx = composite.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(canvas, 0, 0);
      if (overlay) ctx.drawImage(overlay, 0, 0);
      if (mask) ctx.drawImage(mask, 0, 0);
      flushSync(() => {
        setSectionTransition({ snapshot: composite, type: t, duration: transition.duration });
      });
    } catch {
      /* 스냅샷 실패 시 전환 스킵 (canvas tainted 등) */
    }
  }, []);

  const triggerTransitionWithLatency = useCallback((
    transition: { type: string; duration: number } | undefined,
    latencyEntry: LatencyDiagnosticEntry | null,
  ) => {
    const transitionStart = performance.now();
    triggerTransition(transition);
    setLatencyDetails(latencyEntry, {
      transitionMs: performance.now() - transitionStart,
    });
  }, [triggerTransition]);

  const scheduleYouTubeCommand = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      const index = youtubeCommandTimersRef.current.indexOf(timer);
      if (index >= 0) youtubeCommandTimersRef.current.splice(index, 1);
      callback();
    }, delay);
    youtubeCommandTimersRef.current.push(timer);
  }, []);

  useEffect(() => {
    const timers = youtubeCommandTimersRef.current;
    const frameCache = outputFrameCacheRef.current;
    const iframeMap = iframeRefs.current;
    const playingIds = playingIdsRef.current;
    const pendingSeek = pendingSeekRef.current;

    return () => {
      for (const timer of timers) clearTimeout(timer);
      timers.length = 0;
      frameCache.clear();
      pendingFrameShowRef.current = null;
      iframeMap.clear();
      playingIds.clear();
      pendingSeek.clear();
    };
  }, []);

  const handleMessage = useCallback((msg: SocketMessage) => {
    if (!isSocketMessageTargetedTo(msg, 'output')) return;
    const latencyEntry = recordLatencyReceive(msg);

    switch (msg.type) {
      case 'SUBTITLE_UPDATE':
        triggerTransitionWithLatency(msg.payload.transition, latencyEntry);
        setSubtitleText(msg.payload.text);
        setSubtitleStyle(msg.payload.style);
        queueLatencyPaint(latencyEntry);
        break;
      case 'ELEMENTS_UPDATE': {
        triggerTransitionWithLatency(msg.payload.transition, latencyEntry);
        // 모션 섹션용 — 요소 데이터로 실시간 보간 렌더링
        const els = msg.payload.elements;
        const txt = msg.payload.sectionText;
        pendingFrameShowRef.current = null;
        clearPreRenderedFrame(); // 모션 전환 시 프리렌더 프레임 해제
        staticLayerCacheRef.current = createEmptyStaticLayerCache();
        setSubtitleText('');
        setElements(els);
        setSectionText(txt);
        // 미러 모드: 모션이 있어도 "이미 종료된 상태" 로 고정 표시.
        //   motionStart 를 과거로 설정하면 elapsed 가 충분히 커서
        //   interpolateElements 가 모션 최종 상태(원래 위치·opacity 1) 를 반환.
        //   iframe 연결 타이밍에 따라 초기 상태(invisible/off-screen) 로 고정되는 문제 회피.
        if (hasMotion(els)) {
          motionStartRef.current = isMirror
            ? performance.now() / 1000 - 999  // 999초 과거 → 모션 종료 상태로 고정
            : performance.now() / 1000;
        } else {
          motionStartRef.current = 0;
        }
        queueLatencyPaint(latencyEntry);
        break;
      }
      case 'FRAME_UPDATE': {
        triggerTransitionWithLatency(msg.payload.transition, latencyEntry);
        pendingFrameShowRef.current = null;
        staticLayerCacheRef.current = createEmptyStaticLayerCache();
        // 캐시 미스 시 — 프레임 데이터 포함 수신 (즉시 표시)
        const img = new Image();
        img.onload = () => {
          if (!paintPreRenderedFrameNow(img, latencyEntry)) {
            activatePreRenderedFrame(img);
            queueLatencyPaint(latencyEntry);
          }
        };
        img.src = msg.payload.frame;
        setSubtitleText('');
        setSectionText(msg.payload.sectionText);
        if (!msg.payload.hasMotion) {
          setElements([]);
          motionStartRef.current = 0;
        }
        break;
      }
      case 'FRAME_CACHE': {
        // [FEATURE: FRAME_CACHE] 백그라운드 프리캐시 — 로컬에 미리 저장
        const cacheImg = new Image();
        cacheImg.onload = () => {
          setOutputFrameCacheEntry(outputFrameCacheRef.current, msg.payload.sectionId, cacheImg);
          const pendingShow = pendingFrameShowRef.current;
          if (pendingShow?.sectionId === msg.payload.sectionId) {
            pendingFrameShowRef.current = null;
            const paintedNow = paintPreRenderedFrameNow(cacheImg, pendingShow.latencyEntry);
            if (!paintedNow) activatePreRenderedFrame(cacheImg);
            setSubtitleText('');
            setSectionText(pendingShow.sectionText);
            if (!pendingShow.hasMotion) {
              setElements([]);
              motionStartRef.current = 0;
            }
            queueLatencyPaint(pendingShow.latencyEntry);
          }
        };
        cacheImg.src = msg.payload.frame;
        break;
      }
      case 'FRAME_SHOW': {
        triggerTransitionWithLatency(msg.payload.transition, latencyEntry);
        staticLayerCacheRef.current = createEmptyStaticLayerCache();
        // [FEATURE: FRAME_SHOW] sectionId만 수신 → 로컬 캐시에서 즉시 표시
        const cachedImg = outputFrameCacheRef.current.get(msg.payload.sectionId);
        if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
          pendingFrameShowRef.current = null;
          setOutputFrameCacheEntry(outputFrameCacheRef.current, msg.payload.sectionId, cachedImg);
          if (!paintPreRenderedFrameNow(cachedImg, latencyEntry)) {
            activatePreRenderedFrame(cachedImg);
            queueLatencyPaint(latencyEntry);
          }
        } else {
          pendingFrameShowRef.current = {
            sectionId: msg.payload.sectionId,
            sectionText: msg.payload.sectionText,
            hasMotion: msg.payload.hasMotion,
            latencyEntry,
          };
        }
        setSubtitleText('');
        setSectionText(msg.payload.sectionText);
        if (!msg.payload.hasMotion) {
          setElements([]);
          motionStartRef.current = 0;
        }
        break;
      }
      case 'BLACKOUT':
        pendingFrameShowRef.current = null;
        setIsBlackout(msg.payload.active);
        queueLatencyPaint(latencyEntry);
        break;
      case 'CLEAR_TEXT':
        setSubtitleText('');
        setElements([]);
        setSectionText('');
        pendingFrameShowRef.current = null;
        clearPreRenderedFrame();
        staticLayerCacheRef.current = createEmptyStaticLayerCache();
        queueLatencyPaint(latencyEntry);
        break;
      case 'CAMERA_SOURCE':
        selectCamera(msg.payload.deviceId);
        break;
      case 'VIDEO_COMMAND': {
        const { youtubeId, command, args } = msg.payload;
        // 단일 전송 헬퍼
        const sendOnce = () => {
          const iframe = iframeRefs.current.get(youtubeId);
          if (!iframe?.contentWindow) return false;
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'listening', id: 0 }),
            'https://www.youtube.com'
          );
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: command, args: args ?? [] }),
            'https://www.youtube.com'
          );
          return true;
        };

        if (command === 'playVideo') {
          // state 체크 기반 smart-retry: state=1 이 확인되는 즉시 중단.
          // iframe 또는 플레이어가 아직 준비되지 않은 슬로우 모니터도 따라잡지만
          // 한 번 재생에 들어가면 추가 명령을 보내지 않아 스터터 없음.
          const delays = [0, 500, 1100, 2000, 3200];
          for (const delay of delays) {
            scheduleYouTubeCommand(() => {
              if (playingIdsRef.current.has(youtubeId)) return;
              sendOnce();
            }, delay);
          }
        } else if (command === 'seekTo') {
          // seekTo 도 iframe/player 로딩 대기 — 재시도로 안정성 확보
          const seekDelays = [0, 300, 800, 1500];
          for (const delay of seekDelays) {
            scheduleYouTubeCommand(() => sendOnce(), delay);
          }
          // pending seek 저장: state=1 진입 시 최종 seek 한 번 더 적용
          if (typeof args?.[0] === 'number') {
            pendingSeekRef.current.set(youtubeId, args[0] as number);
          }
        } else {
          // seekTo / unMute / pause 등 나머지는 1회 전송
          sendOnce();
        }
        break;
      }
      case 'PING':
        break;
    }
  }, [
    activatePreRenderedFrame,
    clearPreRenderedFrame,
    isMirror,
    paintPreRenderedFrameNow,
    queueLatencyPaint,
    recordLatencyReceive,
    scheduleYouTubeCommand,
    selectCamera,
    triggerTransitionWithLatency,
  ]);

  const { send, reportLatency } = useSocketReceiver(handleMessage);

  useEffect(() => {
    latencyReporterRef.current = reportLatency;
    return () => {
      latencyReporterRef.current = () => undefined;
    };
  }, [reportLatency]);

  useEffect(() => {
    if (elements.length === 0 || hasMotion(elements)) {
      staticLayerCacheRef.current = createEmptyStaticLayerCache();
      return;
    }

    let cancelled = false;
    const rebuildCache = () => {
      if (cancelled) return;
      staticLayerCacheRef.current = buildStaticLayerCache(elements, sectionText);
      setFrameRevision((current) => current + 1);
    };

    rebuildCache();
    void preloadImages(elements).then(rebuildCache);

    return () => {
      cancelled = true;
    };
  }, [elements, sectionText]);

  useEffect(() => {
    const interval = setInterval(() => {
      send({ type: 'PONG' });
    }, 3000);
    return () => clearInterval(interval);
  }, [send]);

  // [FEATURE: YT_STANDBY] YouTube 플레이어 state 추적 (onStateChange 수신).
  // `listening` 이벤트를 받은 iframe 은 이후 state 변경을 postMessage 로 전송.
  // 우리는 그 메시지를 가로채서 어떤 iframe 이 현재 재생 중인지 playingIdsRef 에
  // 기록. VIDEO_COMMAND 핸들러가 재시도 여부를 결정할 때 이 값을 참조한다.
  useEffect(() => {
    const handleYouTubeMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube.com') return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data?.event !== 'onStateChange' || typeof data.info !== 'number') return;
        // e.source 를 iframeRefs 와 매칭해서 youtubeId 찾기
        for (const [id, iframe] of iframeRefs.current.entries()) {
          if (iframe.contentWindow === e.source) {
            if (data.info === 1) {
              playingIdsRef.current.add(id);
              // [FEATURE: YT_TIMELINE] playing 진입 직후 pending seek 재적용
              const target = pendingSeekRef.current.get(id);
              if (target !== undefined && iframe.contentWindow) {
                iframe.contentWindow.postMessage(
                  JSON.stringify({ event: 'command', func: 'seekTo', args: [target, true] }),
                  'https://www.youtube.com'
                );
                pendingSeekRef.current.delete(id);
              }
            } else if (data.info === 0 || data.info === 2) {
              playingIdsRef.current.delete(id);
            }
            break;
          }
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('message', handleYouTubeMessage);
    return () => window.removeEventListener('message', handleYouTubeMessage);
  }, []);

  // [FEATURE: BROADCAST_VIEWER / WEBRTC] Output 캔버스를 /media/broadcast 뷰어들에게 WebRTC 로 송출
  // 미러 모드에선 WebRTC 퍼블리시 스킵 — 강대상 본창에서만 송출
  useBroadcastPublisher(canvasRef, { enabled: !isMirror });

  // Canvas render loop — 2단 캔버스
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const overlayCtx = overlayCanvas?.getContext('2d') ?? null;
    const maskCtx = maskCanvas?.getContext('2d') ?? null;
    if (!ctx) return;

    let animationId: number | null = null;
    let stopped = false;

    function renderLoop() {
      if (!ctx || !canvas || stopped) return;
      const renderStart = performance.now();
      let renderLoopBaseMs = 0;
      let renderLoopLowerMs = 0;
      let renderLoopSubtitleMs = 0;
      let renderLoopOverlayMs = 0;
      let renderLoopMaskMs = 0;
      const finishFrame = (continueRendering: boolean) => {
        const pendingEntry = pendingLatencyPaintRef.current;
        setLatencyDetails(pendingEntry, {
          prePaintWaitMs: pendingEntry ? renderStart - pendingEntry.receivedPerfAt : undefined,
          paintPath: 'render-loop',
          renderLoopBaseMs,
          renderLoopLowerMs,
          renderLoopSubtitleMs,
          renderLoopOverlayMs,
          renderLoopMaskMs,
          renderLoopTotalMs: performance.now() - renderStart,
          renderLoopContinue: continueRendering,
        });
        markLatencyPainted();
        animationId = continueRendering && !stopped
          ? requestAnimationFrame(renderLoop)
          : null;
      };
      // 프레임 1개의 실패가 루프를 죽이지 않도록 격리 — 실패 시 해당 프레임만 스킵
      try {
        renderFrameBody(ctx, canvas);
      } catch (err) {
        console.error('[OutputCanvas] 렌더 프레임 실패(스킵):', err);
        try {
          const { elements: rawEls } = stateRef.current;
          finishFrame(motionStartRef.current > 0 && hasMotion(rawEls));
        } catch {
          animationId = null;
        }
      }
      return;

      // 파라미터로 받은 ctx/canvas는 위 가드에서 non-null 확정된 값 (TS 내로잉 전달용)
      function renderFrameBody(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
      const {
        subtitleText: text,
        subtitleStyle: style,
        elements: rawEls,
        sectionText: secText,
        isBlackout: blackout,
      } = stateRef.current;

      // ── 모션 보간 적용 ──
      const motionStart = motionStartRef.current;
      const elapsed = motionStart > 0 ? (performance.now() / 1000) - motionStart : 999;
      const els = motionStart > 0 ? interpolateElements(rawEls, elapsed) : rawEls;
      const staticLayerCache = staticLayerCacheRef.current;
      const useStaticLayerCache = (
        motionStart <= 0 &&
        els.length > 0 &&
        staticLayerCache.enabled
      );
      const preFrame = preRenderedFrameRef.current;
      const hasPreFrame = !!(
        preFrame &&
        preFrame.complete &&
        preFrame.naturalWidth > 0
      );
      const preFrameCoversBase = hasPreFrame && preRenderedFrameOpaqueRef.current && els.length === 0;
      const hasReadableCamera = !!video && video.readyState >= 2;
      const hasAnimatedCanvasElements = els.length > 0 && (motionStart > 0 || hasMotion(els));
      const shouldDrawCameraBase = !preFrameCoversBase;
      const drawMasks = () => {
        const maskStart = performance.now();
        if (maskCtx && maskCanvas) {
          maskCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          if (useStaticLayerCache) {
            if (staticLayerCache.hasMaskLayer && staticLayerCache.maskCanvas) {
              maskCtx.drawImage(staticLayerCache.maskCanvas, 0, 0);
            }
          } else {
            renderScreenMasks(maskCtx, els, CANVAS_WIDTH, CANVAS_HEIGHT, 'output');
          }
        }
        return performance.now() - maskStart;
      };

      // ── 하단 캔버스: 배경 + 비디오 아래 요소 ──
      const baseStart = performance.now();
      if (!shouldDrawCameraBase) {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else if (hasReadableCamera) {
        ctx.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else {
        renderNoCamera(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
      renderLoopBaseMs = performance.now() - baseStart;

      if (blackout) {
        renderBlackout(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
        if (overlayCtx && overlayCanvas) {
          const overlayStart = performance.now();
          overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          renderLoopOverlayMs = performance.now() - overlayStart;
        }
        renderLoopMaskMs = drawMasks();
        setLatencyDetails(pendingLatencyPaintRef.current, {
          renderLoopUseStaticCache: useStaticLayerCache,
          renderLoopHasPreFrame: hasPreFrame,
          renderLoopPreFrameCoversBase: preFrameCoversBase,
        });
        finishFrame(false);
        return;
      }

      let maxVidZ = staticLayerCache.maxVideoZIndex;
      let hasAbove = staticLayerCache.hasOverlayLayer;

      if (!useStaticLayerCache) {
        // 비디오 요소가 있으면 → 하단에는 비디오 z-index 미만만 렌더
        const vidEls = els.filter((e) => e.type === 'video' && e.visible && isElementVisibleOn(e, 'output'));
        maxVidZ = vidEls.length > 0 ? Math.max(...vidEls.map((v) => v.zIndex)) : -1;
        hasAbove = maxVidZ >= 0 && els.some(
          (e) => (
            e.type !== 'video' &&
            e.visible &&
            isElementVisibleOn(e, 'output') &&
            (e.zIndex > maxVidZ || isElementForcedAboveVideo(e))
          )
        );
      }

      // [FEATURE: FRAME_PRERENDER] 프리렌더 프레임이 있으면 즉시 표시
      const lowerStart = performance.now();
      if (hasPreFrame && preFrame && els.length === 0) {
        ctx.drawImage(preFrame, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else if (els.length > 0) {
        if (useStaticLayerCache) {
          if (staticLayerCache.hasBaseLayer && staticLayerCache.baseCanvas) {
            ctx.drawImage(staticLayerCache.baseCanvas, 0, 0);
          }
        } else if (maxVidZ >= 0) {
          // 비디오 아래 요소만 하단 캔버스에
          renderElements(ctx, els, secText, CANVAS_WIDTH, CANVAS_HEIGHT, {
            mode: 'below',
            videoZIndex: maxVidZ,
            target: 'output',
          });
        } else {
          // 비디오 없으면 전부 하단 캔버스에
          renderElements(ctx, els, secText, CANVAS_WIDTH, CANVAS_HEIGHT, { target: 'output' });
        }
      }
      renderLoopLowerMs = performance.now() - lowerStart;

      if (text && !preFrame) {
        const subtitleStart = performance.now();
        renderSubtitle(ctx, text, style, CANVAS_WIDTH, CANVAS_HEIGHT);
        renderLoopSubtitleMs = performance.now() - subtitleStart;
      }

      // ── 상단 오버레이 캔버스: 비디오 위 요소 ──
      const overlayStart = performance.now();
      if (overlayCtx && overlayCanvas) {
        overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        if (useStaticLayerCache) {
          if (staticLayerCache.hasOverlayLayer && staticLayerCache.overlayCanvas) {
            overlayCtx.drawImage(staticLayerCache.overlayCanvas, 0, 0);
          }
        } else if (hasAbove && els.length > 0) {
          renderElements(overlayCtx, els, secText, CANVAS_WIDTH, CANVAS_HEIGHT, {
            mode: 'above',
            videoZIndex: maxVidZ,
            target: 'output',
          });
        }
      }
      renderLoopOverlayMs = performance.now() - overlayStart;

      renderLoopMaskMs = drawMasks();
      const continueRendering = (
        !blackout &&
        (
          hasAnimatedCanvasElements ||
          (shouldDrawCameraBase && hasReadableCamera)
        )
      );
      setLatencyDetails(pendingLatencyPaintRef.current, {
        renderLoopUseStaticCache: useStaticLayerCache,
        renderLoopHasPreFrame: hasPreFrame,
        renderLoopPreFrameCoversBase: preFrameCoversBase,
      });
      finishFrame(continueRendering);
      } // renderFrameBody
    }

    renderLoop();

    return () => {
      stopped = true;
      if (animationId !== null) cancelAnimationFrame(animationId);
    };
  }, [
    elements,
    frameRevision,
    isBlackout,
    markLatencyPainted,
    sectionText,
    subtitleStyle,
    subtitleText,
    videoRef,
  ]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-black relative"
      onDoubleClick={handleDoubleClick}
    >
      {/* Hidden video element for camera stream */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />

      {/* ① 하단 캔버스: 배경 + 비디오 아래 요소 */}
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          zIndex: 0,
        }}
      />

      {/* ② 영상 오버레이 — YouTube iframe 또는 로컬 video. clipMaskId 가 있으면 마스크 모양대로 잘림 */}
      {videoElements.map((vel) => (
        <div
          key={vel.id}
          style={{
            position: 'absolute',
            left: `${vel.x}%`,
            top: `${vel.y}%`,
            width: `${vel.width}%`,
            height: `${vel.height}%`,
            opacity: vel.opacity,
            transform: vel.rotation ? `rotate(${vel.rotation}deg)` : undefined,
            transformOrigin: 'center center',
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 1,
            ...getClipMaskStyleFor(vel, elements),
          }}
        >
          {vel.youtubeId ? (
            <iframe
              ref={(el) => {
                if (el && vel.youtubeId) {
                  const prev = iframeRefs.current.get(vel.youtubeId);
                  iframeRefs.current.set(vel.youtubeId, el);
                  // [FEATURE: YT_STANDBY] 새 iframe 이 마운트되면 이전 재생 상태는
                  // 무효 — 새 플레이어가 state=1 을 보낼 때까지는 "재생 안 됨" 으로 취급.
                  if (prev !== el) playingIdsRef.current.delete(vel.youtubeId);
                }
              }}
              src={getEmbedUrl(vel.youtubeId)}
              width="100%"
              height="100%"
              style={{ border: 'none', display: 'block', pointerEvents: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          ) : (
            <video
              src={vel.src}
              autoPlay={vel.autoplay}
              muted={vel.muted}
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

      {/* ③ 상단 오버레이 캔버스: 비디오 위 요소 (텍스트, 도형 등) */}
      <canvas
        ref={overlayCanvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* ④ 스크린 마스크: 최종 출력 위에 얹는 안전 가림막 */}
      <canvas
        ref={maskCanvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          zIndex: 3,
          pointerEvents: 'none',
        }}
      />

      {/* [FEATURE: SECTION_TRANSITION] 이전 화면 스냅샷 overlay (페이드/슬라이드/딥) */}
      {sectionTransition && (
        <SectionTransitionOverlay
          snapshot={sectionTransition.snapshot}
          type={sectionTransition.type}
          duration={sectionTransition.duration}
          onComplete={() => setSectionTransition(null)}
        />
      )}

      <LatencyDebugOverlay
        enabled={latencyDebugEnabled}
        surface="OUTPUT"
        entries={latencyEntries}
      />
    </div>
  );
}
