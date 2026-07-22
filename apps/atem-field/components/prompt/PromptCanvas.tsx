'use client';

/**
 * components/prompt/PromptCanvas.tsx
 * 프롬프트 모니터 캔버스 (무대 찬양팀용 최종 PGM 미러)
 *
 * [FEATURE: PROMPT_MONITOR]
 *
 * OutputCanvas 와 동일한 렌더 파이프라인을 사용합니다:
 *   ① 하단 캔버스  — 카메라 + 비디오 아래 요소
 *   ② YouTube iframe 레이어
 *   ③ 상단 오버레이 캔버스 — 비디오 위 요소 (텍스트/도형)
 *
 * OutputCanvas 와의 차이:
 *   - useBroadcastPublisher 미사용 (Output 한 곳에서만 WebRTC 송출)
 *   - 좌상단에 "PROMPT" 배지 (무대에서 모니터 식별용, 나중에 숨기거나 제거 가능)
 *
 * Output 과 동일한 Socket.io 룸(OUTPUT) 에 참여하므로 모든 PGM 업데이트
 * (SUBTITLE/ELEMENTS/BLACKOUT/CAMERA_SOURCE/VIDEO_COMMAND/CLEAR_TEXT/PING) 를
 * 동일하게 수신해 1:1 로 렌더합니다.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useCamera } from '@/hooks/useCamera';
import { useAutoCamera } from '@/hooks/useAutoCamera'; // [FEATURE: AUTO_CAMERA]
import { useSocketReceiver } from '@/hooks/useSocketReceiver'; // [FEATURE: SOCKET_IO]
import { SubtitleStyle, DEFAULT_SUBTITLE_STYLE, PromptLayoutType } from '@/lib/types';
import { CanvasElement, VideoElement, isElementVisibleOn } from '@/lib/canvasTypes';
import { SocketMessage, isSocketMessageTargetedTo, type SectionKind } from '@/lib/socketEvents'; // [FEATURE: SOCKET_IO]
import { renderSubtitle, renderBlackout, renderNoCamera } from '@/lib/subtitleRenderer';
import { isElementForcedAboveVideo, renderElements, renderScreenMasks } from '@/lib/canvasRenderer';
import { getClipMaskStyleFor } from '@/lib/clipMaskStyle'; // [FEATURE: SHAPE_YOUTUBE_CLIP]
import { getEmbedUrl } from '@/lib/youtube';
import { interpolateElements, hasMotion } from '@/lib/motionEngine';
import { renderPromptLayout } from '@/components/prompt/promptLayoutRenderer';
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

interface PromptCustomLayoutTemplate {
  defaultElements: CanvasElement[];
  coverElements: CanvasElement[];
}

interface StoredPromptLayout {
  id: string;
  sections?: {
    default?: { elements?: CanvasElement[] };
    cover?: { elements?: CanvasElement[] };
  };
}

interface StoredProgramDesign {
  prompt?: {
    default?: { elements?: CanvasElement[] };
    cover?: { elements?: CanvasElement[] };
  };
  promptLayouts?: StoredPromptLayout[];
}

function isCustomPromptLayout(layout: PromptLayoutType): layout is `prompt-${string}` {
  return layout.startsWith('prompt-');
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

export default function PromptCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);       // 하단 캔버스
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null); // 상단 오버레이 캔버스
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

  // [FEATURE: PROMPT_LAYOUT] 프롬프트 전용 레이아웃 오버라이드
  const [promptLayout, setPromptLayout] = useState<PromptLayoutType>('none');
  const [nextSectionText, setNextSectionText] = useState('');

  // [FIX: PROMPT_TEXT] 프롬프트 레이아웃용 텍스트를 소켓 핸들러에서 즉시 업데이트하는 ref.
  // useState + useEffect + stateRef 경로는 React 비동기 렌더 사이클 때문에
  // rAF 루프에서 읽을 때 빈 문자열이 될 수 있음 → 별도 ref 로 동기 업데이트.
  const promptTextRef = useRef({
    current: '',
    next: '',
    layout: 'none' as PromptLayoutType,
    sectionKind: 'default' as SectionKind,
  });

  // YouTube iframe refs (youtubeId → iframe)
  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());

  // [FEATURE: YT_STANDBY] 각 YouTube 플레이어의 재생 상태 추적.
  // receiver 가 VIDEO_COMMAND (playVideo) 를 받을 때 이미 재생 중(state=1)이면
  // 중복 명령을 스킵해서 "다다다다" 스터터를 방지.
  const playingIdsRef = useRef<Set<string>>(new Set());

  // [FEATURE: YT_TIMELINE] 대기 중인 seek 대상 시각 (youtubeId → seconds).
  //   VIDEO_COMMAND 로 seekTo 가 왔을 때 저장 → 해당 iframe 이 실제로 playing
  //   상태 (state=1) 에 진입하는 순간 "최종 seek" 을 한 번 더 강제하여
  //   iframe 로드 타이밍 지연으로 0:00 부터 재생되는 문제를 방지.
  const pendingSeekRef = useRef<Map<string, number>>(new Map());

  // 모션 애니메이션 시작 시각 (ELEMENTS_UPDATE 수신 시 설정)
  const motionStartRef = useRef<number>(0);

  // [FEATURE: FRAME_PRERENDER] 컴포저에서 프리렌더링된 완성 프레임
  const preRenderedFrameRef = useRef<HTMLImageElement | null>(null);
  const preRenderedFrameOpaqueRef = useRef(false);
  const frameOpacityCacheRef = useRef<WeakMap<HTMLImageElement, boolean>>(new WeakMap());
  const [frameRevision, setFrameRevision] = useState(0);
  const renderGenerationRef = useRef(0);

  // [FEATURE: FRAME_CACHE] 출력 모니터 로컬 프레임 캐시 (sectionId → Image)
  const outputFrameCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const pendingFrameShowRef = useRef<null | {
    sectionId: string;
    sectionText: string;
    hasMotion: boolean;
    promptLayout: PromptLayoutType | undefined;
    nextSectionText: string | undefined;
    sectionKind: SectionKind | undefined;
    latencyEntry: LatencyDiagnosticEntry | null;
  }>(null);
  const youtubeCommandTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const customPromptLayoutsRef = useRef<Map<string, PromptCustomLayoutTemplate>>(new Map());

  const bumpRenderGeneration = useCallback(() => {
    renderGenerationRef.current += 1;
    return renderGenerationRef.current;
  }, []);

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

  // [FEATURE: AUTO_CAMERA] 자동 카메라 연결 — Output 과 같은 localStorage 키를 공유
  const {
    deviceId: cameraDeviceId,
    selectCamera,
    openSelector: handleDoubleClick,
  } = useAutoCamera();

  const { videoRef } = useCamera(cameraDeviceId);

  useEffect(() => {
    const enabled = isLatencyDebugEnabled();
    latencyDebugEnabledRef.current = enabled;
    const timer = window.setTimeout(() => setLatencyDebugEnabled(enabled), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const recordLatencyReceive = useCallback((msg: SocketMessage) => {
    if (!msg.trace) return null;
    const entry = createLatencyEntry(msg, 'prompt');
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

    bumpRenderGeneration();
    const opaque = activatePreRenderedFrame(img, { triggerRender: false });

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

    setLatencyDetails(latencyEntry, {
      prePaintWaitMs: latencyEntry ? paintStart - latencyEntry.receivedPerfAt : undefined,
      paintPath: 'immediate-frame',
      paintBasePath: basePath,
      paintOpaque: opaque,
      paintHadReadableCamera: hasReadableCamera,
      paintBaseMs: baseEnd - baseStart,
      paintFrameMs: frameEnd - frameStart,
      paintOverlayClearMs: overlayEnd - overlayStart,
      paintMaskClearMs: maskEnd - maskStart,
      paintTotalMs: performance.now() - paintStart,
    });

    if (latencyEntry) {
      pendingLatencyPaintRef.current = latencyEntry;
      markLatencyPainted();
    }

    return true;
  }, [activatePreRenderedFrame, bumpRenderGeneration, markLatencyPainted, videoRef]);

  const paintPromptLayoutNow = useCallback((options: {
    layout: PromptLayoutType | undefined;
    currentText: string;
    nextText: string | undefined;
    sectionKind: SectionKind | undefined;
    elements: CanvasElement[];
    latencyEntry: LatencyDiagnosticEntry | null;
  }) => {
    const paintStart = performance.now();
    const layout = options.layout ?? 'none';
    if (layout === 'none') return false;

    const canvas = canvasRef.current;
    if (!canvas) return false;

    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const overlayCtx = overlayCanvasRef.current?.getContext('2d') ?? null;
    const maskCtx = maskCanvasRef.current?.getContext('2d') ?? null;
    const fixedPromptElements = options.elements.filter((el) => (
      el.fixedLayer === true &&
      el.visible &&
      isElementVisibleOn(el, 'prompt')
    ));

    let handled = false;
    const lowerStart = performance.now();

    if (isCustomPromptLayout(layout)) {
      const customLayout = customPromptLayoutsRef.current.get(layout);
      const customElements = options.sectionKind === 'cover' && customLayout?.coverElements.length
        ? customLayout.coverElements
        : customLayout?.defaultElements.length
          ? customLayout.defaultElements
          : customLayout?.coverElements;

      if (customElements?.length) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        renderElements(ctx, customElements, options.currentText, CANVAS_WIDTH, CANVAS_HEIGHT, { target: 'prompt' });
        handled = true;
      }
    }

    if (!handled) {
      handled = renderPromptLayout(
        ctx,
        layout,
        options.currentText,
        options.nextText ?? '',
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
      );
    }

    if (!handled) return false;

    bumpRenderGeneration();

    if (fixedPromptElements.length > 0) {
      renderElements(ctx, fixedPromptElements, '', CANVAS_WIDTH, CANVAS_HEIGHT, { target: 'prompt' });
    }
    const lowerEnd = performance.now();

    const overlayStart = performance.now();
    if (overlayCtx) overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const overlayEnd = performance.now();

    const maskStart = performance.now();
    if (maskCtx) {
      renderScreenMasks(maskCtx, options.elements, CANVAS_WIDTH, CANVAS_HEIGHT, 'prompt');
    }
    const maskEnd = performance.now();

    setLatencyDetails(options.latencyEntry, {
      prePaintWaitMs: options.latencyEntry ? paintStart - options.latencyEntry.receivedPerfAt : undefined,
      paintPath: 'immediate-prompt-layout',
      renderLoopLowerMs: lowerEnd - lowerStart,
      renderLoopOverlayMs: overlayEnd - overlayStart,
      renderLoopMaskMs: maskEnd - maskStart,
      paintTotalMs: performance.now() - paintStart,
      renderLoopContinue: false,
    });

    if (options.latencyEntry) {
      pendingLatencyPaintRef.current = options.latencyEntry;
      markLatencyPainted();
    }

    return true;
  }, [bumpRenderGeneration, markLatencyPainted]);

  // 애니메이션 루프용 state ref
  const stateRef = useRef({
    subtitleText: '',
    subtitleStyle: DEFAULT_SUBTITLE_STYLE,
    elements: [] as CanvasElement[],
    sectionText: '',
    isBlackout: false,
    promptLayout: 'none' as PromptLayoutType,
    nextSectionText: '',
  });

  useEffect(() => {
    stateRef.current = { subtitleText, subtitleStyle, elements, sectionText, isBlackout, promptLayout, nextSectionText };
  }, [subtitleText, subtitleStyle, elements, sectionText, isBlackout, promptLayout, nextSectionText]);

  // 영상 요소 추출: YouTube iframe + 서버에 업로드된 로컬 영상 파일
  const videoElements = useMemo(() => {
    return elements.filter(
      (el): el is VideoElement =>
        el.type === 'video' && el.visible && isElementVisibleOn(el, 'prompt') && (!!el.youtubeId || !!el.src)
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

  const triggerPromptTransition = useCallback((
    _transition: { type: string; duration: number } | undefined,
    latencyEntry: LatencyDiagnosticEntry | null,
  ) => {
    const transitionStart = performance.now();
    // 프롬프트 모니터는 찬양팀/강대상 확인용이라 모든 전환을 cut 정책으로 처리한다.
    // fade/slide 스냅샷 인코딩을 하지 않아 화면 변경 대기와 CPU spike를 피한다.
    setLatencyDetails(latencyEntry, {
      transitionMs: performance.now() - transitionStart,
    });
  }, []);

  const scheduleYouTubeCommand = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      const index = youtubeCommandTimersRef.current.indexOf(timer);
      if (index >= 0) youtubeCommandTimersRef.current.splice(index, 1);
      callback();
    }, delay);
    youtubeCommandTimersRef.current.push(timer);
  }, []);

  const loadCustomPromptLayouts = useCallback(async () => {
    try {
      const res = await fetch('/api/designs');
      if (!res.ok) return;
      const { designs }: { designs?: Record<string, StoredProgramDesign> } = await res.json();
      const nextMap = new Map<string, PromptCustomLayoutTemplate>();

      for (const [programType, programDesign] of Object.entries(designs ?? {})) {
        const promptDefault = programDesign.prompt?.default?.elements ?? [];
        const promptCover = programDesign.prompt?.cover?.elements ?? [];
        if (promptDefault.length || promptCover.length) {
          nextMap.set(`prompt-base-${programType}`, {
            defaultElements: promptDefault,
            coverElements: promptCover,
          });
        }

        for (const layout of programDesign.promptLayouts ?? []) {
          if (!layout.id.startsWith('prompt-')) continue;
          nextMap.set(layout.id, {
            defaultElements: layout.sections?.default?.elements ?? [],
            coverElements: layout.sections?.cover?.elements ?? [],
          });
        }
      }

      customPromptLayoutsRef.current = nextMap;
      setFrameRevision((current) => current + 1);
    } catch {
      /* 디자인 등록 데이터 로드 실패 시 기본 렌더로 폴백 */
    }
  }, []);

  useEffect(() => {
    void loadCustomPromptLayouts();
  }, [loadCustomPromptLayouts]);

  const applyPromptLayoutState = useCallback((
    layout: PromptLayoutType | undefined,
    nextText: string | undefined,
    sectionKind: SectionKind | undefined,
  ) => {
    const nextLayout = layout ?? 'none';
    const next = nextText ?? '';

    setPromptLayout(nextLayout);
    setNextSectionText(next);
    promptTextRef.current.layout = nextLayout;
    promptTextRef.current.next = next;
    promptTextRef.current.sectionKind = sectionKind ?? 'default';

    if (isCustomPromptLayout(nextLayout) && !customPromptLayoutsRef.current.has(nextLayout)) {
      void loadCustomPromptLayouts();
    }
  }, [loadCustomPromptLayouts]);

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
    if (!isSocketMessageTargetedTo(msg, 'prompt')) return;
    const latencyEntry = recordLatencyReceive(msg);

    switch (msg.type) {
      case 'SUBTITLE_UPDATE': {
        triggerPromptTransition(msg.payload.transition, latencyEntry);
        setSubtitleText(msg.payload.text);
        setSubtitleStyle(msg.payload.style);
        // [FEATURE: PROMPT_LAYOUT]
        applyPromptLayoutState(msg.payload.promptLayout, msg.payload.nextSectionText, msg.payload.sectionKind);
        // [FIX: PROMPT_TEXT] 동기 ref 업데이트 — rAF 루프가 즉시 최신 텍스트를 읽을 수 있도록
        // SUBTITLE_UPDATE 는 subtitleText 를 제공 → sectionText 가 비어있으면 이걸 사용
        promptTextRef.current.current = msg.payload.text;
        const paintedImmediately = paintPromptLayoutNow({
          layout: msg.payload.promptLayout,
          currentText: msg.payload.text,
          nextText: msg.payload.nextSectionText,
          sectionKind: msg.payload.sectionKind,
          elements: stateRef.current.elements,
          latencyEntry,
        });
        if (!paintedImmediately) queueLatencyPaint(latencyEntry);
        break;
      }
      case 'ELEMENTS_UPDATE': {
        // 모션 섹션용 — 요소 데이터로 실시간 보간 렌더링
        const els = msg.payload.elements;
        const txt = msg.payload.sectionText;
        // PMT 레이아웃은 전역 레이어/분리출력과 독립된 찬양대 전용 기능이다.
        // 요소의 OUT/PMT/BRD 라우팅이 있어도 디자인 등록 PMT는 기존처럼 적용한다.
        const promptLayoutForSection: PromptLayoutType | undefined = msg.payload.promptLayout;

        triggerPromptTransition(msg.payload.transition, latencyEntry);
        pendingFrameShowRef.current = null;
        clearPreRenderedFrame(); // 모션 전환 시 프리렌더 프레임 해제
        setSubtitleText('');
        setElements(els);
        setSectionText(txt);
        applyPromptLayoutState(promptLayoutForSection, msg.payload.nextSectionText, msg.payload.sectionKind);
        promptTextRef.current.current = txt;
        if (hasMotion(els)) {
          motionStartRef.current = performance.now() / 1000;
        } else {
          motionStartRef.current = 0;
        }
        const paintedImmediately = paintPromptLayoutNow({
          layout: promptLayoutForSection,
          currentText: txt,
          nextText: msg.payload.nextSectionText,
          sectionKind: msg.payload.sectionKind,
          elements: els,
          latencyEntry,
        });
        if (!paintedImmediately) queueLatencyPaint(latencyEntry);
        break;
      }
      case 'FRAME_UPDATE': {
        triggerPromptTransition(msg.payload.transition, latencyEntry);
        pendingFrameShowRef.current = null;
        setSubtitleText('');
        setSectionText(msg.payload.sectionText);
        applyPromptLayoutState(msg.payload.promptLayout, msg.payload.nextSectionText, msg.payload.sectionKind);
        promptTextRef.current.current = msg.payload.sectionText;
        if (!msg.payload.hasMotion) {
          setElements([]);
          motionStartRef.current = 0;
        }

        if ((msg.payload.promptLayout ?? 'none') !== 'none') {
          const paintedImmediately = paintPromptLayoutNow({
            layout: msg.payload.promptLayout,
            currentText: msg.payload.sectionText,
            nextText: msg.payload.nextSectionText,
            sectionKind: msg.payload.sectionKind,
            elements: stateRef.current.elements,
            latencyEntry,
          });
          if (!paintedImmediately) queueLatencyPaint(latencyEntry);
          break;
        }

        // 캐시 미스 시 — 프레임 데이터 포함 수신
        const img = new Image();
        img.onload = () => {
          if (!paintPreRenderedFrameNow(img, latencyEntry)) {
            activatePreRenderedFrame(img);
            queueLatencyPaint(latencyEntry);
          }
        };
        img.src = msg.payload.frame;
        break;
      }
      case 'FRAME_CACHE': {
        // [FEATURE: FRAME_CACHE] 백그라운드 프리캐시
        const cacheImg = new Image();
        cacheImg.onload = () => {
          setOutputFrameCacheEntry(outputFrameCacheRef.current, msg.payload.sectionId, cacheImg);
          const pendingShow = pendingFrameShowRef.current;
          if (pendingShow?.sectionId === msg.payload.sectionId) {
            pendingFrameShowRef.current = null;
            let paintedImmediately = false;
            if ((pendingShow.promptLayout ?? 'none') === 'none') {
              paintedImmediately = paintPreRenderedFrameNow(cacheImg, pendingShow.latencyEntry);
              if (!paintedImmediately) {
                activatePreRenderedFrame(cacheImg);
              }
            } else {
              paintedImmediately = paintPromptLayoutNow({
                layout: pendingShow.promptLayout,
                currentText: pendingShow.sectionText,
                nextText: pendingShow.nextSectionText,
                sectionKind: pendingShow.sectionKind,
                elements: stateRef.current.elements,
                latencyEntry: pendingShow.latencyEntry,
              });
              if (!paintedImmediately) activatePreRenderedFrame(cacheImg);
            }
            setSubtitleText('');
            setSectionText(pendingShow.sectionText);
            applyPromptLayoutState(pendingShow.promptLayout, pendingShow.nextSectionText, pendingShow.sectionKind);
            promptTextRef.current.current = pendingShow.sectionText;
            if (!pendingShow.hasMotion) {
              setElements([]);
              motionStartRef.current = 0;
            }
            if (!paintedImmediately) queueLatencyPaint(pendingShow.latencyEntry);
          }
        };
        cacheImg.src = msg.payload.frame;
        break;
      }
      case 'FRAME_SHOW': {
        triggerPromptTransition(msg.payload.transition, latencyEntry);
        let paintedImmediately = false;
        setSubtitleText('');
        setSectionText(msg.payload.sectionText);
        applyPromptLayoutState(msg.payload.promptLayout, msg.payload.nextSectionText, msg.payload.sectionKind);
        promptTextRef.current.current = msg.payload.sectionText;
        if (!msg.payload.hasMotion) {
          setElements([]);
          motionStartRef.current = 0;
        }

        if ((msg.payload.promptLayout ?? 'none') !== 'none') {
          pendingFrameShowRef.current = null;
          paintedImmediately = paintPromptLayoutNow({
            layout: msg.payload.promptLayout,
            currentText: msg.payload.sectionText,
            nextText: msg.payload.nextSectionText,
            sectionKind: msg.payload.sectionKind,
            elements: stateRef.current.elements,
            latencyEntry,
          });
        } else {
          // [FEATURE: FRAME_SHOW] sectionId만 수신 → 로컬 캐시에서 즉시 표시
          const cachedImg = outputFrameCacheRef.current.get(msg.payload.sectionId);
          if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
            pendingFrameShowRef.current = null;
            setOutputFrameCacheEntry(outputFrameCacheRef.current, msg.payload.sectionId, cachedImg);
            paintedImmediately = paintPreRenderedFrameNow(cachedImg, latencyEntry);
            if (!paintedImmediately) {
              activatePreRenderedFrame(cachedImg);
            }
          } else {
            pendingFrameShowRef.current = {
              sectionId: msg.payload.sectionId,
              sectionText: msg.payload.sectionText,
              hasMotion: msg.payload.hasMotion,
              promptLayout: msg.payload.promptLayout,
              nextSectionText: msg.payload.nextSectionText,
              sectionKind: msg.payload.sectionKind,
              latencyEntry,
            };
          }
        }
        if (!paintedImmediately) queueLatencyPaint(latencyEntry);
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
        // [FIX: PROMPT_TEXT]
        promptTextRef.current.current = '';
        promptTextRef.current.next = '';
        queueLatencyPaint(latencyEntry);
        break;
      case 'CAMERA_SOURCE':
        selectCamera(msg.payload.deviceId);
        break;
      case 'VIDEO_COMMAND': {
        const { youtubeId, command, args } = msg.payload;
        const sendOnce = () => {
          const iframe = iframeRefs.current.get(youtubeId);
          if (!iframe?.contentWindow) return false;
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'listening', id: 0 }),
            'https://www.youtube.com'
          );
          // 프롬프트는 모니터링 화면이므로 출력 오디오와 중복되지 않게
          // unMute 명령은 무시하고, 재생은 항상 음소거 상태로 유지한다.
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
          // state=1 이 확인되는 즉시 재시도 중단 → 스터터 방지
          const delays = [0, 500, 1100, 2000, 3200];
          for (const delay of delays) {
            scheduleYouTubeCommand(() => {
              if (playingIdsRef.current.has(youtubeId)) return;
              sendOnce();
            }, delay);
          }
        } else if (command === 'seekTo') {
          // iframe 로딩 대기 — 재시도로 안정성 확보 (OutputCanvas 와 동일)
          const seekDelays = [0, 300, 800, 1500];
          for (const delay of seekDelays) {
            scheduleYouTubeCommand(() => sendOnce(), delay);
          }
          // pending seek 저장: state=1 진입 시 최종 seek 한 번 더 적용
          if (typeof args?.[0] === 'number') {
            pendingSeekRef.current.set(youtubeId, args[0] as number);
          }
        } else {
          // unMute / pause 등은 1회 전송
          sendOnce();
        }
        break;
      }
      case 'PING':
        break;
    }
  }, [
    activatePreRenderedFrame,
    applyPromptLayoutState,
    clearPreRenderedFrame,
    paintPromptLayoutNow,
    paintPreRenderedFrameNow,
    queueLatencyPaint,
    recordLatencyReceive,
    scheduleYouTubeCommand,
    selectCamera,
    triggerPromptTransition,
  ]);

  const { send, reportLatency } = useSocketReceiver(handleMessage);

  useEffect(() => {
    latencyReporterRef.current = reportLatency;
    return () => {
      latencyReporterRef.current = () => undefined;
    };
  }, [reportLatency]);

  useEffect(() => {
    const interval = setInterval(() => {
      send({ type: 'PONG' });
    }, 3000);
    return () => clearInterval(interval);
  }, [send]);

  // [FEATURE: YT_STANDBY] YouTube 플레이어 state 추적 (onStateChange 수신).
  // VIDEO_COMMAND 핸들러의 smart-retry 가 참조하는 playingIdsRef 를 갱신.
  useEffect(() => {
    const handleYouTubeMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube.com') return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data?.event !== 'onStateChange' || typeof data.info !== 'number') return;
        for (const [id, iframe] of iframeRefs.current.entries()) {
          if (iframe.contentWindow === e.source) {
            if (data.info === 1) {
              playingIdsRef.current.add(id);
              // [FEATURE: YT_TIMELINE] playing 진입 직후 pending seek 재적용
              //   — iframe 이 초기 재생에 진입하는 순간에 한 번 더 seekTo 를
              //     강제하여 타임라인이 0:00 부터 재생되는 케이스 보강.
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

  // ⚠️ 프롬프트 모니터는 WebRTC 퍼블리셔를 **사용하지 않습니다**.
  //     Output 한 곳에서만 /media/broadcast 뷰어들에게 송출합니다.
  //     useBroadcastPublisher 제거가 OutputCanvas 와의 유일한 구조적 차이.

  // Canvas render loop — 프롬프트는 cut 중심이라 정적 화면에서는 루프를 멈춘다.
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
    const loopGeneration = renderGenerationRef.current;

    function renderLoop() {
      if (!ctx || !canvas || stopped || loopGeneration !== renderGenerationRef.current) return;
      const renderStart = performance.now();
      let renderLoopBaseMs = 0;
      let renderLoopLowerMs = 0;
      let renderLoopSubtitleMs = 0;
      let renderLoopOverlayMs = 0;
      let renderLoopMaskMs = 0;

      const finishFrame = (continueRendering: boolean) => {
        if (loopGeneration !== renderGenerationRef.current) return;
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
        animationId = continueRendering && !stopped && loopGeneration === renderGenerationRef.current
          ? requestAnimationFrame(renderLoop)
          : null;
      };
      // 프레임 1개의 실패가 루프를 죽이지 않도록 격리 — 실패 시 해당 프레임만 스킵
      try {
        renderFrameBody(ctx, canvas);
      } catch (err) {
        console.error('[PromptCanvas] 렌더 프레임 실패(스킵):', err);
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
        promptLayout: layout,
        nextSectionText: nextText,
      } = stateRef.current;
      const motionStart = motionStartRef.current;
      const elapsed = motionStart > 0 ? (performance.now() / 1000) - motionStart : 999;
      const els = motionStart > 0 ? interpolateElements(rawEls, elapsed) : rawEls;
      const hasReadableCamera = !!video && video.readyState >= 2;
      const hasAnimatedCanvasElements = els.length > 0 && (motionStart > 0 || hasMotion(els));

      // ── [FEATURE: PROMPT_LAYOUT] 레이아웃 오버라이드 분기 ──
      // 프롬프트 레이아웃이 활성일 때: 전용 렌더러가 캔버스 전체를 그림.
      // 카메라/요소/자막/블랙아웃 모두 무시 — 찬양팀에겐 가사가 항상 보여야 함.
      //
      // [FIX: PROMPT_TEXT] promptTextRef 에서 동기적으로 읽음.
      // stateRef 는 React useEffect 경유라 rAF 루프 시점에 아직 빈 문자열일 수 있음.
      const promptData = promptTextRef.current;
      const activeLayout = promptData.layout !== 'none' ? promptData.layout : layout;
      const drawMasksFor = (maskElements: CanvasElement[]) => {
        const maskStart = performance.now();
        if (maskCtx && maskCanvas) {
          renderScreenMasks(maskCtx, maskElements, CANVAS_WIDTH, CANVAS_HEIGHT, 'prompt');
        }
        return performance.now() - maskStart;
      };
      if (activeLayout !== 'none') {
        // 동기 ref 우선, fallback 으로 stateRef 값 사용
        const currentText = promptData.current || secText || text;
        const nextTextFinal = promptData.next || nextText;
        const fixedPromptElements = els.filter(
          (el) => el.fixedLayer === true && el.visible && isElementVisibleOn(el, 'prompt')
        );

        // 텍스트가 비어있을 때 — 평시엔 검정 유지(무대 모니터에 그대로 나가는 화면이므로
        // 진단 문구 노출 금지), ?debug=1일 때만 데이터 소스 진단 표시
        if (!currentText) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          if (typeof window !== 'undefined' && window.location.search.includes('debug=1')) {
            ctx.font = 'normal 20px monospace, sans-serif';
            ctx.fillStyle = '#ff4444';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const lines = [
              `=== PROMPT DEBUG (텍스트 비어있음) ===`,
              `promptTextRef.current = "${promptData.current.slice(0, 60)}"`,
              `stateRef.sectionText  = "${secText.slice(0, 60)}"`,
              `stateRef.subtitleText = "${text.slice(0, 60)}"`,
              `activeLayout = "${activeLayout}"`,
              `promptData.layout = "${promptData.layout}"`,
              `stateRef.promptLayout = "${layout}"`,
              `--- 3가지 텍스트 소스 모두 비어있습니다 ---`,
              `섹션 송출 후에도 이 화면이면 OperatorPanel 송신 확인 필요`,
            ];
            lines.forEach((line, i) => {
              ctx.fillText(line, 40, 40 + i * 30);
            });
          }
          renderLoopMaskMs = drawMasksFor(els);
          finishFrame(hasAnimatedCanvasElements);
          return;
        }

        if (isCustomPromptLayout(activeLayout)) {
          const customLayout = customPromptLayoutsRef.current.get(activeLayout);
          const customElements = promptData.sectionKind === 'cover' && customLayout?.coverElements.length
            ? customLayout.coverElements
            : customLayout?.defaultElements.length
              ? customLayout.defaultElements
              : customLayout?.coverElements;

          if (customElements?.length) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            renderElements(ctx, customElements, currentText, CANVAS_WIDTH, CANVAS_HEIGHT, { target: 'prompt' });
            if (fixedPromptElements.length > 0) {
              renderElements(ctx, fixedPromptElements, '', CANVAS_WIDTH, CANVAS_HEIGHT, { target: 'prompt' });
            }

            if (overlayCtx && overlayCanvas) {
              const overlayStart = performance.now();
              overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
              renderLoopOverlayMs = performance.now() - overlayStart;
            }
            renderLoopMaskMs = drawMasksFor(els);
            finishFrame(hasAnimatedCanvasElements);
            return;
          }
        }

        const handled = renderPromptLayout(ctx, activeLayout, currentText, nextTextFinal, CANVAS_WIDTH, CANVAS_HEIGHT);
        if (handled) {
          const lowerStart = performance.now();
          if (fixedPromptElements.length > 0) {
            renderElements(ctx, fixedPromptElements, '', CANVAS_WIDTH, CANVAS_HEIGHT, { target: 'prompt' });
          }
          renderLoopLowerMs = performance.now() - lowerStart;
          // 오버레이 캔버스 클리어 (레이아웃이 하단 캔버스만 사용)
          if (overlayCtx && overlayCanvas) {
            const overlayStart = performance.now();
            overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            renderLoopOverlayMs = performance.now() - overlayStart;
          }
          renderLoopMaskMs = drawMasksFor(els);
          finishFrame(hasAnimatedCanvasElements);
          return;
        }
      }

      const drawMasks = () => drawMasksFor(els);

      // ── 하단 캔버스: 카메라 배경 + 비디오 아래 요소 ──
      const preFrame = preRenderedFrameRef.current;
      const hasPreFrame = !!(preFrame && preFrame.complete && preFrame.naturalWidth > 0);
      const preFrameCoversBase = hasPreFrame && preRenderedFrameOpaqueRef.current && els.length === 0;
      const shouldDrawCameraBase = !preFrameCoversBase;
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
        finishFrame(false);
        return;
      }

      // 비디오 요소가 있으면 → 하단에는 비디오 z-index 미만만 렌더
      const vidEls = els.filter((e) => e.type === 'video' && e.visible && isElementVisibleOn(e, 'prompt'));
      const maxVidZ = vidEls.length > 0 ? Math.max(...vidEls.map((v) => v.zIndex)) : -1;
      const hasAbove =
        maxVidZ >= 0 && els.some(
          (e) => (
            e.type !== 'video' &&
            e.visible &&
            isElementVisibleOn(e, 'prompt') &&
            (e.zIndex > maxVidZ || isElementForcedAboveVideo(e))
          )
        );

      // [FEATURE: FRAME_PRERENDER] 프리렌더 프레임이 있으면 즉시 표시
      const lowerStart = performance.now();
      if (hasPreFrame && preFrame && els.length === 0) {
        ctx.drawImage(preFrame, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else if (els.length > 0) {
        if (maxVidZ >= 0) {
          renderElements(ctx, els, secText, CANVAS_WIDTH, CANVAS_HEIGHT, {
            mode: 'below',
            videoZIndex: maxVidZ,
            target: 'prompt',
          });
        } else {
          renderElements(ctx, els, secText, CANVAS_WIDTH, CANVAS_HEIGHT, { target: 'prompt' });
        }
      }
      renderLoopLowerMs = performance.now() - lowerStart;

      if (text && !hasPreFrame) {
        const subtitleStart = performance.now();
        renderSubtitle(ctx, text, style, CANVAS_WIDTH, CANVAS_HEIGHT);
        renderLoopSubtitleMs = performance.now() - subtitleStart;
      }

      // ── 상단 오버레이 캔버스: 비디오 위 요소 ──
      const overlayStart = performance.now();
      if (overlayCtx && overlayCanvas) {
        overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        if (hasAbove && els.length > 0) {
          renderElements(overlayCtx, els, secText, CANVAS_WIDTH, CANVAS_HEIGHT, {
            mode: 'above',
            videoZIndex: maxVidZ,
            target: 'prompt',
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
    nextSectionText,
    promptLayout,
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

      {/* ② 영상 오버레이 — YouTube iframe 또는 로컬 video. 프롬프트 모니터는 항상 음소거 */}
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

      {/* ④ 스크린 마스크: 프롬프트 최종 화면 위에 얹는 안전 가림막 */}
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

      {/* ⑤ 모니터 식별 배지 — 좌상단 (나중에 숨김 처리 가능) */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          color: 'rgba(255,255,255,0.55)',
          background: 'rgba(0,0,0,0.45)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 4,
          pointerEvents: 'none',
          zIndex: 10,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        PROMPT
      </div>

      <LatencyDebugOverlay
        enabled={latencyDebugEnabled}
        surface="PROMPT"
        entries={latencyEntries}
      />
    </div>
  );
}
