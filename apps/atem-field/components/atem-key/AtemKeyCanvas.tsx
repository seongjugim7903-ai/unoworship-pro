'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocketReceiver } from '@/hooks/useSocketReceiver';
import { useCamerasVideoStream } from '@/hooks/useCamerasVideoStream'; // [FEATURE: SUB_PGM]
import {
  CanvasElement,
  CanvasRenderTarget,
  ImageElement,
  ShapeElement,
  TextElement,
  VideoElement,
  isElementVisibleOn,
} from '@/lib/canvasTypes';
import { getEmbedUrl } from '@/lib/youtube'; // [FEATURE: VIDEO_FILLKEY]
import { getSocket } from '@/lib/socketClient';
import { hasMotion, interpolateElements } from '@/lib/motionEngine';
import { SOCKET_EVENTS, SocketMessage, isSocketMessageTargetedTo } from '@/lib/socketEvents';
import { DEFAULT_SUBTITLE_STYLE, PromptLayoutType, SubtitleStyle } from '@/lib/types';
import { preloadImages, renderElements } from '@/lib/canvasRenderer';
import { renderSubtitle } from '@/lib/subtitleRenderer';
import { renderPromptLayout } from '@/components/prompt/promptLayoutRenderer';
import { scriptureTargetScrollY } from '@/components/prompt/choir/choirPromptLayoutRenderer'; // [FEATURE: SCRIPTURE_PMT]
import SectionTransitionOverlay from '@/components/scenes/SectionTransitionOverlay';
import type { SectionTransitionSnapshot } from '@/components/scenes/SectionTransitionOverlay';

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const KEY_MASK_NOISE_FLOOR = 2;
// [FEATURE: SCRIPTURE_PMT] 말씀본문 연속 스크롤 튜닝 파라미터 (무대에서 조정 가능)
const SCRIPTURE_ENTER_OFFSET_RATIO = 0.18; // 첫 진입 시작점: 첫 섹션이 센터보다 이만큼 아래에서 올라옴
const SCRIPTURE_FOLLOW_K = 6;              // 센터 추종 강도(초당) — 클수록 빠르게 수렴(부드러운 지수 접근)
const SCRIPTURE_MAX_SPEED_RATIO = 1.1;     // 초당 최대 이동(화면높이 배수) — "확 안 빨라짐" 속도 상한
const SCRIPTURE_SETTLE_PX = 0.5;           // 이 이하로 남으면 정착으로 간주(루프 정지)
type AtemSignalMode = 'luma' | 'fill' | 'key';
type AtemTransitionType = 'fade' | 'slide' | 'dip-to-black';

interface AtemKeyCanvasProps {
  target?: CanvasRenderTarget;
  label?: string;
  signalMode?: AtemSignalMode;
}

function resolveAtemSignalModeFromLocation(fallback: AtemSignalMode): AtemSignalMode {
  if (typeof window === 'undefined') return fallback;

  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode') ?? params.get('signalMode');
  if (mode === 'fill' || mode === 'key' || mode === 'luma') return mode;

  const pathname = window.location.pathname.toLowerCase();
  if (pathname.includes('/key')) return 'key';
  if (pathname.includes('/fill')) return 'fill';

  return fallback;
}

function isAtemKeyElement(el: CanvasElement, target: CanvasRenderTarget): boolean {
  if (!el.visible || !isElementVisibleOn(el, target)) return false;
  if (el.type === 'video') return false;
  if (isAtemFieldGuideText(el)) return false;
  if (el.layerRole === 'background') return false;
  if (el.layerRole === 'live-video') return false;
  if (el.layerRole === 'mask') return false;
  return true;
}

function applyAtemLumaDefaults(el: CanvasElement): CanvasElement {
  return el;
}

function applyAtemFillDefaults(el: CanvasElement): CanvasElement {
  if (el.type === 'image' && (el as ImageElement).keyMode === 'luma-invert') {
    return { ...(el as ImageElement), keyMode: 'none' };
  }
  return el;
}

function applyAtemKeyMaskDefaults(el: CanvasElement): CanvasElement {
  if (el.type === 'image' && (el as ImageElement).keyMode === 'luma-invert') {
    return el;
  }

  if (el.type === 'image') {
    const image = el as ImageElement;
    return {
      ...image,
      blendMode: undefined,
      stroke: 'transparent',
      strokeWidth: 0,
      useShadow: false,
      shadow: undefined,
      useGlow: false,
      glow: undefined,
    };
  }

  if (el.type === 'text') {
    const text = el as TextElement;
    return {
      ...text,
      color: '#ffffff',
      strokeColor: '#ffffff',
      useGradient: false,
      useShadow: false,
      shadow: undefined,
    };
  }

  if (el.type === 'shape') {
    const shape = el as ShapeElement;
    return {
      ...shape,
      fill: '#ffffff',
      stroke: shape.strokeWidth > 0 ? '#ffffff' : shape.stroke,
      // [FIX: GRADIENT_TRANSPARENT_KEY] 그라디언트를 완전히 버리지 않고 흰색으로 치환하되
      //   스탑별 알파(투명 토글)는 보존한다. 예전엔 useGradient:false 로 통째로 지워서
      //   그라디언트의 "투명" 구간까지 키 신호에서 100% 불투명(흰색)으로 나가버렸고,
      //   Fill 창은 그 구간이 검정 배경(투명→검정 합성)이라 ATEM 합성 결과가 검게 보였다.
      gradient: shape.useGradient && shape.gradient
        ? {
            ...shape.gradient,
            stops: shape.gradient.stops.map((s) => ({
              ...s,
              color: whitenGradientStopKeepAlpha(s.color),
            })),
          }
        : shape.gradient,
      imageFill: undefined,
      useShadow: false,
      shadow: undefined,
      useGlow: false,
    };
  }

  return el;
}

/** 그라디언트 스탑 색을 흰색으로 치환하되 알파(투명도)는 보존 — 키 신호는 색상 무관, 밝기·알파만 의미 있음 */
function whitenGradientStopKeepAlpha(color: string): string {
  const m8 = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(color);
  if (m8) return `#ffffff${m8[2]}`;
  return '#ffffff';
}

function isDarkTextColor(color: string): boolean {
  const normalized = color.trim().toLowerCase();
  return (
    normalized === 'black' ||
    normalized === '#000' ||
    normalized === '#000000' ||
    normalized.startsWith('rgb(0, 0, 0') ||
    normalized.startsWith('rgba(0, 0, 0')
  );
}

function isAtemFieldGuideText(el: CanvasElement): boolean {
  if (el.type !== 'text') return false;
  const content = el.content.replace(/\s+/g, ' ').trim();
  if (!content) return false;
  if (/카메라.*(신호|대기)|신호.*대기/.test(content)) return true;
  return content.toUpperCase() === 'LIVE' && isDarkTextColor(el.color);
}

function applyAtemSignalDefaults(el: CanvasElement, signalMode: AtemSignalMode): CanvasElement {
  if (signalMode === 'fill') return applyAtemFillDefaults(el);
  if (signalMode === 'key') return applyAtemKeyMaskDefaults(el);
  return applyAtemLumaDefaults(el);
}

function getAtemSignalElements(
  elements: CanvasElement[],
  target: CanvasRenderTarget,
  signalMode: AtemSignalMode,
): CanvasElement[] {
  return elements
    .filter((element) => isAtemKeyElement(element, target))
    .map((element) => applyAtemSignalDefaults(element, signalMode));
}

function getAtemSignalSubtitleStyle(style: SubtitleStyle, signalMode: AtemSignalMode): SubtitleStyle {
  if (signalMode !== 'key') return style;
  return {
    ...style,
    color: '#ffffff',
    strokeColor: '#ffffff',
    backgroundBarColor: '#ffffff',
  };
}

function normalizeAtemKeyMaskFrame(
  sourceCtx: CanvasRenderingContext2D,
  targetCtx: CanvasRenderingContext2D,
): void {
  const imageData = sourceCtx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    const luma = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
    const keyStrength = luma * (alpha / 255);
    const value = keyStrength <= KEY_MASK_NOISE_FLOOR ? 0 : Math.max(0, Math.min(255, Math.round(keyStrength)));
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  targetCtx.putImageData(imageData, 0, 0);
}

export default function AtemKeyCanvas({
  target = 'output',
  label = 'MAIN / 강대상',
  signalMode = 'luma',
}: AtemKeyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keyMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [resolvedSignalMode] = useState<AtemSignalMode>(() => resolveAtemSignalModeFromLocation(signalMode));
  const [diagnosticMode] = useState(() => {
    if (typeof window === 'undefined') return { debug: false, test: false };
    const params = new URLSearchParams(window.location.search);
    return {
      debug: params.get('debug') === '1',
      test: params.get('test') === '1',
    };
  });
  const [subtitleText, setSubtitleText] = useState('');
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [sectionText, setSectionText] = useState('');
  const [promptLayout, setPromptLayout] = useState<PromptLayoutType>('none');
  const [nextSectionText, setNextSectionText] = useState('');
  // [FEATURE: BIBLE_PMT] 프로그램 전체 절 목록 (bible 레이아웃 전체 보기용)
  const [promptVerses, setPromptVerses] = useState<string[] | null>(null);
  const [promptCurrentIndex, setPromptCurrentIndex] = useState(0);
  // [FEATURE: SCRIPTURE_PMT] 말씀본문 전체 구간(예 "마 5:4-25") — 서브 상단 고정 헤더
  const [scripturePassage, setScripturePassage] = useState<string | null>(null);
  // [FEATURE: VIDEO_FILLKEY] 영상 요소 — fill 창은 DOM 오버레이 재생, key 창은 흰 마스크.
  //   output 타깃 창에서만 채워짐 (/atem-sub 등 prompt 창은 항상 빈 배열 = 기존 동작 무변화)
  const [videoElements, setVideoElements] = useState<VideoElement[]>([]);
  const [isBlackout, setIsBlackout] = useState(false);
  const [renderVersion, setRenderVersion] = useState(0);
  const [socketStatus, setSocketStatus] = useState('connecting');
  const [roomStatus, setRoomStatus] = useState('pending');
  const [lastMessage, setLastMessage] = useState('none');
  const motionStartRef = useRef(0);
  const messageSequenceRef = useRef(0);
  // [FEATURE: SCRIPTURE_PMT] 말씀본문 연속 스크롤 상태 — y=현재 스크롤 오프셋(문서 좌표),
  //   targetInited=첫 진입 시작점 설정 여부, startAt=첫 진입 시각(400ms 슬라이드업), lastAt=직전 프레임(dt)
  const scriptureScrollRef = useRef({ y: 0, targetInited: false, startAt: 0, lastAt: 0, settled: true });
  const [sectionTransition, setSectionTransition] = useState<null | {
    snapshot: SectionTransitionSnapshot;
    type: AtemTransitionType;
    duration: number;
  }>(null);

  const stateRef = useRef({
    subtitleText: '',
    subtitleStyle: DEFAULT_SUBTITLE_STYLE,
    elements: [] as CanvasElement[],
    sectionText: '',
    promptLayout: 'none' as PromptLayoutType,
    nextSectionText: '',
    isBlackout: false,
    promptVerses: null as string[] | null,
    promptCurrentIndex: 0,
    scripturePassage: null as string | null,
    videoElements: [] as VideoElement[],
  });

  useEffect(() => {
    stateRef.current = {
      subtitleText,
      subtitleStyle,
      elements,
      sectionText,
      promptLayout,
      nextSectionText,
      isBlackout,
      promptVerses,
      promptCurrentIndex,
      scripturePassage,
      videoElements,
    };
  }, [subtitleText, subtitleStyle, elements, sectionText, promptLayout, nextSectionText, isBlackout, promptVerses, promptCurrentIndex, scripturePassage, videoElements]);

  const triggerTransition = useCallback((transition: { type: string; duration: number } | undefined) => {
    if (!transition || transition.type === 'cut' || transition.duration <= 0) return;
    if (transition.type !== 'fade' && transition.type !== 'slide' && transition.type !== 'dip-to-black') return;
    // [FIX 번쩍임] 필앤키는 Fill 창·Key 창 두 개를 ATEM이 실시간 합성한다.
    //   두 창이 각자 페이드하면 진행률이 프레임 단위로 어긋나 합성 알파가 틀어지고 "번쩍"인다(텍스트 특히 심함).
    //   → 스플릿 신호(fill/key)에서는 전환을 항상 컷으로 강제한다. (루마 단일창은 자체 페이드라 문제없어 유지)
    if (resolvedSignalMode === 'fill' || resolvedSignalMode === 'key') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const snapshot = document.createElement('canvas');
      snapshot.width = CANVAS_WIDTH;
      snapshot.height = CANVAS_HEIGHT;
      const ctx = snapshot.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(canvas, 0, 0);
      setSectionTransition({
        snapshot,
        type: transition.type,
        duration: transition.duration,
      });
    } catch {
      // Snapshot can fail if a browser marks the canvas as tainted.
    }
  }, [resolvedSignalMode]);

  const handleMessage = useCallback((msg: SocketMessage) => {
    if (!isSocketMessageTargetedTo(msg, target)) return;
    setLastMessage(msg.type);

    switch (msg.type) {
      case 'SUBTITLE_UPDATE': {
        messageSequenceRef.current += 1;
        // [FEATURE: SCRIPTURE_PMT] 말씀본문이면 자체 스크롤 애니메이션 → 전환 오버레이 억제(이중 애니 방지).
        //   프로그램에 처음 진입할 때만 스크롤 시작점 리셋(첫 섹션 센터로 400ms 슬라이드업).
        //   같은 프로그램 내 섹션 이동은 유지 → 현재 섹션 센터로 부드럽게 이어서 스크롤한다.
        const isScriptureSub = target === 'prompt' && (msg.payload.promptLayout ?? 'none') === 'scripture';
        if (isScriptureSub && stateRef.current.promptLayout !== 'scripture') {
          scriptureScrollRef.current.targetInited = false;
        }
        if (!isScriptureSub) triggerTransition(msg.payload.transition);
        setElements([]);
        setSectionText('');
        setSubtitleText(msg.payload.text);
        setSubtitleStyle(msg.payload.style);
        setPromptLayout(msg.payload.promptLayout ?? 'none');
        setNextSectionText(msg.payload.nextSectionText ?? '');
        setPromptVerses(msg.payload.promptVerses ?? null);
        setPromptCurrentIndex(msg.payload.promptCurrentIndex ?? 0);
        setScripturePassage(msg.payload.scripturePassage ?? null);
        setVideoElements([]); // [FEATURE: VIDEO_FILLKEY] 자막 섹션 = 영상 없음
        motionStartRef.current = 0;
        break;
      }
      case 'ELEMENTS_UPDATE': {
        const sequence = messageSequenceRef.current + 1;
        messageSequenceRef.current = sequence;
        const keyElements = getAtemSignalElements(msg.payload.elements, target, resolvedSignalMode);
        // [FEATURE: VIDEO_FILLKEY] output 타깃 창(fill/key)에서만 영상 요소 추출.
        //   캔버스 필터(isAtemKeyElement)는 video를 계속 제외하므로 기존 캔버스 렌더 무변화.
        const videoEls = target === 'output'
          ? msg.payload.elements.filter(
              (el): el is VideoElement =>
                el.type === 'video' && el.visible !== false && isElementVisibleOn(el, 'output'),
            )
          : [];
        // [FEATURE: SCRIPTURE_PMT] 말씀본문 진입 여부(수신 시점 캡처) — 처음 진입이면 스크롤 시작점 리셋.
        const isScriptureSub = target === 'prompt' && (msg.payload.promptLayout ?? 'none') === 'scripture';
        const enteringScripture = isScriptureSub && stateRef.current.promptLayout !== 'scripture';
        const applyUpdate = () => {
          if (messageSequenceRef.current !== sequence) return;
          if (enteringScripture) scriptureScrollRef.current.targetInited = false;
          if (!isScriptureSub) triggerTransition(msg.payload.transition); // scripture는 자체 스크롤
          setElements(keyElements);
          setSectionText(msg.payload.sectionText);
          setSubtitleText('');
          setPromptLayout(msg.payload.promptLayout ?? 'none');
          setNextSectionText(msg.payload.nextSectionText ?? '');
          setPromptVerses(msg.payload.promptVerses ?? null);
          setPromptCurrentIndex(msg.payload.promptCurrentIndex ?? 0);
          setScripturePassage(msg.payload.scripturePassage ?? null);
          setVideoElements(videoEls);
          motionStartRef.current = hasMotion(keyElements) ? performance.now() / 1000 : 0;
        };

        if (keyElements.length > 0) {
          void preloadImages(keyElements).then(applyUpdate);
        } else {
          applyUpdate();
        }
        break;
      }
      case 'BLACKOUT':
        messageSequenceRef.current += 1;
        setIsBlackout(msg.payload.active);
        break;
      case 'CLEAR_TEXT':
        messageSequenceRef.current += 1;
        setElements([]);
        setSectionText('');
        setSubtitleText('');
        setPromptLayout('none');
        setNextSectionText('');
        setPromptVerses(null);
        setPromptCurrentIndex(0);
        setScripturePassage(null);
        setVideoElements([]); // [FEATURE: VIDEO_FILLKEY] 오버레이 제거·재생 종료
        setIsBlackout(false);
        motionStartRef.current = 0;
        break;
      case 'FRAME_UPDATE':
      case 'FRAME_CACHE':
      case 'FRAME_SHOW':
      case 'CAMERA_SOURCE':
      case 'VIDEO_COMMAND':
      case 'PING':
      case 'PONG':
        break;
    }
  }, [resolvedSignalMode, target, triggerTransition]);

  useSocketReceiver(handleMessage);

  useEffect(() => {
    if (!diagnosticMode.debug) return;
    const socket = getSocket();
    if (!socket) return;

    const handleConnect = () => setSocketStatus(`connected:${socket.id ?? ''}`);
    const handleDisconnect = (reason: string) => setSocketStatus(`disconnected:${reason}`);
    const handleConnectError = (error: Error) => setSocketStatus(`error:${error.message}`);
    const handleJoinRoomResult = (result: { room: string; ok: boolean; reason?: string }) => {
      if (result.room === 'output') {
        setRoomStatus(result.ok ? `${label}:output-room:ok` : `${label}:output-room:${result.reason ?? 'failed'}`);
      }
    };

    if (socket.connected) handleConnect();
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on(SOCKET_EVENTS.JOIN_ROOM_RESULT, handleJoinRoomResult);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off(SOCKET_EVENTS.JOIN_ROOM_RESULT, handleJoinRoomResult);
    };
  }, [diagnosticMode.debug, label]);

  useEffect(() => {
    if (elements.length === 0) return;
    let cancelled = false;

    preloadImages(elements).then(() => {
      if (!cancelled) setRenderVersion((version) => version + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [elements]);

  function getKeyMaskContext(): CanvasRenderingContext2D | null {
    if (!keyMaskCanvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      keyMaskCanvasRef.current = canvas;
    }

    return keyMaskCanvasRef.current.getContext('2d', { willReadFrequently: true });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const drawingContext = ctx;

    let animationId: number | null = null;
    let stopped = false;

    function renderLoop() {
      if (stopped) return;
      // 프레임 1개의 실패가 루프를 죽이지 않도록 격리 — 실패 프레임만 스킵하고 계속 간다
      try {
        renderFrame();
      } catch (err) {
        console.error('[AtemKeyCanvas] 렌더 프레임 실패(스킵):', err);
      } finally {
        try {
          const { isBlackout: blackout, elements: rawElements, promptLayout: curLayout } = stateRef.current;
          // [FEATURE: SCRIPTURE_PMT] 말씀본문 스크롤이 목표(센터)에 아직 도달 안 했으면 루프 유지(서브만).
          //   renderFrame 의 advanceScriptureScroll 이 settled 를 갱신 → 정착하면 정적 프레임으로 복귀.
          const scriptureScrolling =
            target === 'prompt' && curLayout === 'scripture' && !scriptureScrollRef.current.settled;
          const shouldContinue =
            !blackout && ((motionStartRef.current > 0 && hasMotion(rawElements)) || scriptureScrolling);
          animationId = shouldContinue && !stopped ? requestAnimationFrame(renderLoop) : null;
        } catch {
          animationId = null;
        }
      }
    }

    function renderFrame() {
      const {
        subtitleText: text,
        subtitleStyle: style,
        elements: rawElements,
        sectionText: textForElements,
        promptLayout: layout,
        nextSectionText: nextText,
        isBlackout: blackout,
        promptVerses: verses,
        promptCurrentIndex: verseIndex,
        scripturePassage: passage,
      } = stateRef.current;

      const motionStart = motionStartRef.current;
      const elapsed = motionStart > 0 ? performance.now() / 1000 - motionStart : 999;
      const visibleElements = motionStart > 0
        ? interpolateElements(rawElements, elapsed)
        : rawElements;
      const renderContent = (renderContext: CanvasRenderingContext2D) => {
        if (blackout) return;

        // [FEATURE: VIDEO_FILLKEY] key 창 — 영상 영역을 흰 사각형으로 마스크
        //   (선형 키: 흰 곳만큼 Fill이 불투명 → 영상이 카메라를 100% 덮음. 검정 빠짐 없음)
        //   fill/luma 창은 DOM 오버레이가 재생을 담당하므로 캔버스에는 그리지 않는다.
        if (resolvedSignalMode === 'key' && stateRef.current.videoElements.length > 0) {
          renderContext.fillStyle = '#ffffff';
          for (const vel of stateRef.current.videoElements) {
            renderContext.fillRect(
              (vel.x / 100) * CANVAS_WIDTH,
              (vel.y / 100) * CANVAS_HEIGHT,
              (vel.width / 100) * CANVAS_WIDTH,
              (vel.height / 100) * CANVAS_HEIGHT,
            );
          }
        }

        const promptText = text || textForElements;
        if (target === 'prompt' && layout !== 'none') {
          // [FEATURE: SCRIPTURE_PMT] 말씀본문 연속 스크롤 — 현재 섹션이 센터로 오도록 scrollY 를 부드럽게 추종.
          //   첫 진입은 센터 아래에서 400ms 슬라이드업, 이후는 속도 상한을 둔 지수 접근(컷·급가속 없음).
          let scriptureScrollY: number | undefined;
          if (layout === 'scripture' && verses && verses.length > 0) {
            const s = scriptureScrollRef.current;
            const targetY = scriptureTargetScrollY(renderContext, verses, verseIndex, CANVAS_WIDTH, CANVAS_HEIGHT);
            const now = performance.now();
            if (!s.targetInited) {
              // 첫 진입: 첫 섹션이 센터 아래에서 시작 → 위로 올라오며 정착
              s.y = targetY + CANVAS_HEIGHT * SCRIPTURE_ENTER_OFFSET_RATIO;
              s.targetInited = true;
              s.startAt = now;
              s.lastAt = now;
              s.settled = false;
            }
            const dt = Math.min(0.05, Math.max(0, (now - s.lastAt) / 1000)); // 초, 상한 50ms(탭 비활성 튐 방지)
            s.lastAt = now;
            const dy = targetY - s.y;
            if (Math.abs(dy) <= SCRIPTURE_SETTLE_PX) {
              s.y = targetY;
              s.settled = true;
            } else {
              s.settled = false;
              let step = dy * (1 - Math.exp(-SCRIPTURE_FOLLOW_K * dt)); // 프레임레이트 독립 지수 접근
              const maxStep = CANVAS_HEIGHT * SCRIPTURE_MAX_SPEED_RATIO * dt; // 속도 상한
              if (step > maxStep) step = maxStep;
              else if (step < -maxStep) step = -maxStep;
              s.y += step;
            }
            scriptureScrollY = s.y;
          }
          const handled = renderPromptLayout(
            renderContext,
            layout,
            promptText,
            nextText,
            CANVAS_WIDTH,
            CANVAS_HEIGHT,
            verses && verses.length > 0
              ? { verses, currentIndex: verseIndex, passage: passage ?? undefined }
              : undefined,
            scriptureScrollY,
          );
          if (handled) return;
        }

        if (visibleElements.length > 0) {
          renderElements(renderContext, visibleElements, textForElements, CANVAS_WIDTH, CANVAS_HEIGHT, {
            target,
            atemKeyMode: resolvedSignalMode === 'key',
          });
        }

        if (text) {
          renderSubtitle(
            renderContext,
            text,
            getAtemSignalSubtitleStyle(style, resolvedSignalMode),
            CANVAS_WIDTH,
            CANVAS_HEIGHT,
          );
        }
      };

      if (resolvedSignalMode === 'key') {
        const keyMaskContext = getKeyMaskContext();
        if (keyMaskContext) {
          keyMaskContext.fillStyle = '#000000';
          keyMaskContext.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          renderContent(keyMaskContext);
          normalizeAtemKeyMaskFrame(keyMaskContext, drawingContext);
        }
      } else {
        // [FEATURE: VIDEO_FILLKEY] 영상 재생 중에는 캔버스 배경을 투명으로 —
        //   캔버스(텍스트·요소)가 영상 오버레이 위(z2)에 있으므로, 투명 배경이어야
        //   "영상 + 그 위 자막"이 화면(=ATEM Fill 신호)에 함께 나간다.
        //   영상이 없거나 블랙아웃이면 기존처럼 검정 배경 (기존 동작 무변화).
        // [FEATURE: SUB_PGM] 서브(prompt) 모니터는 PGM 을 항상 바닥에 깐다 → 캔버스 기본 배경을 투명으로.
        //   화면을 다 가리는 레이아웃(black-white/bible)은 렌더 함수가 자체 검정을 채워 PGM 을 덮고,
        //   안 가리는 경우(none/투명 디자인)는 PGM 이 비쳐 보인다. 블랙아웃이면 검정.
        const subPgmBase = target === 'prompt';
        if ((stateRef.current.videoElements.length > 0 || subPgmBase) && !blackout) {
          drawingContext.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        } else {
          drawingContext.fillStyle = '#000000';
          drawingContext.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
        renderContent(drawingContext);
      }
    }

    renderLoop();

    return () => {
      stopped = true;
      if (animationId !== null) cancelAnimationFrame(animationId);
    };
  }, [
    diagnosticMode.test,
    elements,
    isBlackout,
    nextSectionText,
    promptLayout,
    renderVersion,
    resolvedSignalMode,
    sectionText,
    subtitleStyle,
    subtitleText,
    target,
    videoElements,
  ]);

  // [FEATURE: SUB_PGM] 서브(prompt) 모니터는 맥 릴레이(ATEM 최종영상) WebRTC 를 항상 바닥에 깐다.
  //   캔버스(z2)는 투명 처리되어 영상이 비쳐 보이고, 화면을 다 가리는 레이아웃만 그 위를 덮는다.
  //   블랙아웃이 항상 우선(영상 숨김). 릴레이 미연결 시 오버레이 자체 검정 → 기존과 동일.
  const subShowsPgm = target === 'prompt' && !isBlackout;

  return (
    <>
      <div className="relative h-full w-full overflow-hidden bg-black">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="relative block h-full w-full"
          style={{
            objectFit: 'contain',
            // [FEATURE: VIDEO_FILLKEY] 캔버스(자막)를 영상 오버레이(z1) 위에 —
            // 영상 재생 중에만 CSS 배경도 투명 (평시엔 기존과 동일한 검정)
            zIndex: 2,
            backgroundColor:
              (videoElements.length > 0 || subShowsPgm) && !isBlackout && resolvedSignalMode !== 'key'
                ? 'transparent'
                : '#000000',
          }}
        />
        {/* [FEATURE: SUB_PGM] 서브 PGM 오버레이 — prompt 창에 상시 마운트(사전 연결), 블랙아웃 아닐 때 표시 */}
        {target === 'prompt' && <PgmRelayOverlay active={subShowsPgm} />}
        {/* [FEATURE: VIDEO_FILLKEY] fill/luma 창 영상 오버레이 — OutputCanvas 패턴 재사용.
            key 창은 캔버스 흰 마스크만 그리고 실제 영상은 표시하지 않는다.
            블랙아웃 중에는 key 마스크가 꺼지므로 오버레이도 함께 숨겨 모니터링 혼동을 막는다. */}
        {resolvedSignalMode !== 'key' && !isBlackout && videoElements.map((vel) => (
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
            }}
          >
            {vel.youtubeId ? (
              <iframe
                src={getEmbedUrl(vel.youtubeId, { autoplay: true, muted: vel.muted })}
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
        {sectionTransition ? (
          <SectionTransitionOverlay
            snapshot={sectionTransition.snapshot}
            type={sectionTransition.type}
            duration={sectionTransition.duration}
            onComplete={() => setSectionTransition(null)}
          />
        ) : null}
      </div>
      {diagnosticMode.debug ? (
        <div className="pointer-events-none fixed bottom-3 left-3 rounded bg-black/80 px-3 py-2 font-mono text-xs leading-5 text-white">
          <div>socket: {socketStatus}</div>
          <div>room: {roomStatus}</div>
          <div>mode: {resolvedSignalMode}</div>
          <div>last: {lastMessage}</div>
        </div>
      ) : null}
    </>
  );
}

// [FEATURE: SUB_PGM] 서브(무대) PGM 영상 오버레이 — 맥 릴레이(/cameras-source, ATEM 최종영상)
//   WebRTC 스트림을 구독해 전체화면으로 표시. prompt 창에 상시 마운트되어 미리 연결해 두고
//   (즉시 전환), active 일 때만 보인다. 릴레이 미연결 시에는 검정 유지 — 방송 화면이므로
//   진단 문구를 그리지 않는다.
function PgmRelayOverlay({ active }: { active: boolean }) {
  const { stream } = useCamerasVideoStream();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    video.play().catch(() => {
      // autoplay 정책 등으로 실패해도 kiosk(--autoplay-policy=no-user-gesture-required)에선 발생하지 않음
    });
  }, [stream, active]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        background: '#000000',
        zIndex: 1,
        pointerEvents: 'none',
        display: active ? 'block' : 'none',
      }}
    />
  );
}
