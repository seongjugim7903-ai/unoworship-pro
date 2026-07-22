/**
 * lib/imageProcessing/eraser.ts
 * 포토샵급 소프트 브러시 지우개 엔진
 *
 * 원리:
 *   - 요소별 마스크 캔버스 관리 (흰색 = 보임, 투명 = 지워짐)
 *   - 소프트 브러시: 방사형 그라데이션으로 부드러운 가장자리
 *   - 포인터 보간: 빠른 스트로크에서도 끊김 없는 연속 도트
 *   - 결과를 data URL 로 export → 요소의 eraserMask 에 저장
 *
 * 마스크 해상도:
 *   긴 변 기준 1024px, 요소 비율 유지 → 출력 품질과 저장 크기 균형
 */

/** 마스크 긴 변 해상도 */
const MASK_LONG_EDGE = 1024;

// ── 마스크 생성 / 로드 ───────────────────────────────────────────────────────

/**
 * 새 마스크 캔버스를 생성하거나 기존 마스크를 로드합니다.
 * @param aspectRatio  요소의 width/height 비율 (% 기준, 16:9 보정 포함)
 * @param existingMask 기존 마스크 data URL (있으면 로드)
 */
export async function createMaskCanvas(
  aspectRatio: number,
  existingMask?: string,
): Promise<HTMLCanvasElement> {
  let w: number, h: number;
  if (aspectRatio >= 1) {
    w = MASK_LONG_EDGE;
    h = Math.round(MASK_LONG_EDGE / aspectRatio);
  } else {
    h = MASK_LONG_EDGE;
    w = Math.round(MASK_LONG_EDGE * aspectRatio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  if (existingMask) {
    // 기존 마스크 로드
    const img = await loadImageFromUrl(existingMask);
    ctx.drawImage(img, 0, 0, w, h);
  } else {
    // 새 마스크: 전체 흰색 (모두 보임)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }

  return canvas;
}

/** 마스크 초기화 (전체 보임) */
export function clearMask(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/** 마스크를 WebP data URL 로 export */
export function exportMask(canvas: HTMLCanvasElement): string {
  let url = canvas.toDataURL('image/webp', 0.85);
  if (!url.startsWith('data:image/webp')) {
    url = canvas.toDataURL('image/png');
  }
  return url;
}

// ── 소프트 브러시 페인팅 ─────────────────────────────────────────────────────

/**
 * 소프트 브러시 한 점(dab)을 마스크에 찍습니다.
 *
 * @param ctx       마스크 캔버스 컨텍스트
 * @param nx        정규화 X 좌표 (0–1, 요소 좌측=0 우측=1)
 * @param ny        정규화 Y 좌표 (0–1, 요소 상단=0 하단=1)
 * @param brushSize 브러시 크기 (0–1, 마스크 짧은변 기준 비율)
 * @param hardness  경도 (0–100, 0=매우 부드러움, 100=딱딱한 가장자리)
 */
export function paintDab(
  ctx: CanvasRenderingContext2D,
  nx: number,
  ny: number,
  brushSize: number,
  hardness: number,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const shortEdge = Math.min(w, h);
  const radius = (brushSize * shortEdge) / 2;

  const cx = nx * w;
  const cy = ny * h;

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';

  // 소프트 브러시: 방사형 그라데이션
  const hardnessNorm = Math.max(0, Math.min(100, hardness)) / 100;
  const innerRadius = radius * hardnessNorm;

  const gradient = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, radius);
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 두 점 사이를 보간하여 연속 dab 을 찍습니다.
 * 빠른 마우스 이동에서도 끊김 없는 스트로크를 보장.
 */
export function paintStroke(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  brushSize: number,
  hardness: number,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const shortEdge = Math.min(w, h);
  const radiusPx = (brushSize * shortEdge) / 2;

  // dab 간격: 브러시 반지름의 25% (촘촘할수록 부드러움)
  const spacing = Math.max(1, radiusPx * 0.25);

  const dx = (to.x - from.x) * w;
  const dy = (to.y - from.y) * h;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(dist / spacing));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const nx = from.x + (to.x - from.x) * t;
    const ny = from.y + (to.y - from.y) * t;
    paintDab(ctx, nx, ny, brushSize, hardness);
  }
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('마스크 이미지 로드 실패'));
    img.src = url;
  });
}

/**
 * 요소의 실제 비율 계산 (16:9 캔버스 기준)
 * element.width (%) × 1920 / (element.height (%) × 1080)
 */
export function calcElementAspectRatio(widthPct: number, heightPct: number): number {
  return (widthPct * 1920) / (heightPct * 1080);
}
