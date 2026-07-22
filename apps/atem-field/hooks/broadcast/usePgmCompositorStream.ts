'use client';

/**
 * hooks/broadcast/usePgmCompositorStream.ts
 * PGM + Scene 오버레이를 하나의 캔버스에 합성해 MediaStream 으로 반환.
 *
 * [FEATURE: YOUTUBE_LIVE / SCENE_RACK]
 *
 * 배경:
 *   대시보드는 BroadcastFeedMirror (WebRTC PGM) + ProgramMirror 의 SceneOverlay
 *   를 DOM z-index 로 겹쳐서 보여준다. 하지만 RTMP 송출 쪽 MediaRecorder 는
 *   PGM MediaStream 하나만 녹화해서 Scene Take 가 시청자에게 반영되지 않는다.
 *
 * 해결:
 *   1920×1080 offscreen canvas 를 하나 만들고 30fps 루프로 브로드 대시보드의
 *   실제 Program 미러 레이어를 다시 합성한다.
 *     - BroadcastFeedMirror 하단 캔버스
 *     - WebRTC PGM <video>
 *     - BroadcastFeedMirror 상단 오버레이/마스크 캔버스
 *     - programSceneId 가 있으면 해당 scene 의 이미지/영상/검정 override
 *   canvas.captureStream(30) 을 MediaRecorder 에 넘겨 RTMP 송출.
 *
 * 지원 scene kind:
 *   - image        : draw image (object-contain)
 *   - video        : play video element silently, draw frame (object-contain)
 *   - black        : 전체 검정
 *   - 기타         : PGM 그대로 (iframe/canvas/카메라 는 canvas 드로우 불가)
 *
 * 주의:
 *   - 지속성: 이 훅이 언마운트되면 captureStream 이 끊기므로 BroadcastControls
 *     (대시보드 상시 마운트) 레벨에서 한 번만 호출할 것.
 *   - 오디오: 시각 합성만. 오디오 트랙은 useLiveStream.start() 의 AudioContext
 *     무음 트랙으로 대체됨.
 */

import { useEffect, useRef, useState } from 'react';
import { useMediaStore } from '@/lib/media/mediaStore';
import type { SceneCard } from '@/lib/media/mediaTypes';

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const FPS = 30;

export function usePgmCompositorStream() {
  const programSceneId = useMediaStore((s) => s.session.programSceneId);
  const scenes = useMediaStore((s) => s.session.scenes);
  const program = programSceneId
    ? scenes.find((s) => s.id === programSceneId) ?? null
    : null;

  const [stream, setStream] = useState<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pgmBaseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pgmVideoRef = useRef<HTMLVideoElement | null>(null);
  const pgmOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pgmMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneImgRef = useRef<HTMLImageElement | null>(null);
  const sceneVideoRef = useRef<HTMLVideoElement | null>(null);
  const programRef = useRef<SceneCard | null>(null);

  useEffect(() => {
    programRef.current = program;
  }, [program]);

  // ── 1. offscreen canvas + captureStream (생성 1회) ──
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvasRef.current = canvas;
    // 30fps. 0 을 주면 "수동 requestFrame 모드" 지만 여기선 자동.
    const s = canvas.captureStream(FPS);
    let alive = true;
    queueMicrotask(() => {
      if (alive) setStream(s);
    });
    return () => {
      alive = false;
      s.getTracks().forEach((t) => t.stop());
      canvasRef.current = null;
    };
  }, []);

  // ── 2. Program 미러 레이어 찾기 (DOM 스캔) ──
  //    BroadcastFeedMirror 는 상황에 따라 <video> 대신 캔버스 폴백으로 최종
  //    PGM 을 보여준다. 녹화는 "보이는 Program" 을 따라가야 하므로
  //    data-unolive-pgm-* 레이어를 직접 잡아 다시 합성한다.
  useEffect(() => {
    const scan = () => {
      pgmBaseCanvasRef.current = document.querySelector<HTMLCanvasElement>(
        'canvas[data-unolive-pgm-layer="base"]'
      );
      pgmOverlayCanvasRef.current = document.querySelector<HTMLCanvasElement>(
        'canvas[data-unolive-pgm-layer="overlay"]'
      );
      pgmMaskCanvasRef.current = document.querySelector<HTMLCanvasElement>(
        'canvas[data-unolive-pgm-layer="mask"]'
      );
      pgmVideoRef.current = document.querySelector<HTMLVideoElement>(
        'video[data-unolive-pgm-video="true"]'
      );
    };
    scan();
    const id = setInterval(scan, 500);
    return () => clearInterval(id);
  }, []);

  // ── 3. scene 변경 시 img/video 요소 준비 ──
  useEffect(() => {
    const p = program;
    // 이전 scene 정리
    if (sceneVideoRef.current) {
      try { sceneVideoRef.current.pause(); sceneVideoRef.current.src = ''; } catch { /* ignore */ }
      sceneVideoRef.current = null;
    }
    sceneImgRef.current = null;

    if (!p || !p.sourceUrl) return;
    if (p.kind === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = p.sourceUrl;
      sceneImgRef.current = img;
    } else if (p.kind === 'video') {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.src = p.sourceUrl;
      v.autoplay = true;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.play().catch(() => { /* autoplay 차단 대응 */ });
      sceneVideoRef.current = v;
    }
  }, [program]);

  // ── 4. 렌더 루프 (requestAnimationFrame) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let raf = 0;
    let running = true;

    const drawContain = (
      source: CanvasImageSource,
      sw: number,
      sh: number
    ) => {
      if (!sw || !sh) return;
      const scale = Math.min(CANVAS_WIDTH / sw, CANVAS_HEIGHT / sh);
      const w = sw * scale;
      const h = sh * scale;
      const x = (CANVAS_WIDTH - w) / 2;
      const y = (CANVAS_HEIGHT - h) / 2;
      ctx.drawImage(source, x, y, w, h);
    };

    const drawCanvasLayer = (source: HTMLCanvasElement | null) => {
      if (!source || source.width <= 0 || source.height <= 0) return;
      try {
        ctx.drawImage(source, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } catch {
        // Tainted canvas 등은 녹화 합성에서만 건너뛴다.
      }
    };

    const tick = () => {
      if (!running) return;

      // 1. 바닥 클리어 (검정)
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 2. 브로드 대시보드 Program 미러의 실제 레이어 합성
      //    스트림 없는 상태에서는 base canvas 가 최종 폴백 화면이고,
      //    스트림 있는 상태에서는 base canvas 가 투명 + video 가 실제 PGM 이다.
      drawCanvasLayer(pgmBaseCanvasRef.current);

      const pgm = pgmVideoRef.current;
      if (pgm && pgm.readyState >= 2) {
        try {
          drawContain(pgm, pgm.videoWidth, pgm.videoHeight);
        } catch {
          // drawImage(video) 실패 시 base canvas fallback 을 유지.
        }
      }

      drawCanvasLayer(pgmOverlayCanvasRef.current);
      drawCanvasLayer(pgmMaskCanvasRef.current);

      // 3. Scene override (위)
      const p = programRef.current;
      if (p) {
        if (p.kind === 'black') {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        } else if (p.kind === 'image') {
          const img = sceneImgRef.current;
          if (img && img.complete && img.naturalWidth > 0) {
            // 이미지 소스는 검정 배경 위에 object-contain
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            drawContain(img, img.naturalWidth, img.naturalHeight);
          }
        } else if (p.kind === 'video') {
          const v = sceneVideoRef.current;
          if (v && v.readyState >= 2 && v.videoWidth > 0) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            drawContain(v, v.videoWidth, v.videoHeight);
          }
        }
        // iframe(window), canvas, camera, countdown, audio-cover 는 DOM 전용 —
        // canvas 합성 불가 → PGM 유지. Phase 3 에서 getDisplayMedia 등으로 확장 가능.
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  return { stream };
}
