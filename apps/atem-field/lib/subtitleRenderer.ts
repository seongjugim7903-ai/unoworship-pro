import { SubtitleStyle } from './types';

/**
 * Canvas 텍스트 자동 줄바꿈 (단어 경계 우선, CSS word-break:keep-all + break-word 와 일치).
 *   - 공백 기준 토큰으로 분할 → 토큰 단위로 줄 쌓음
 *   - 한 토큰이 maxWidth 초과하면 그 토큰만 char-by-char 로 쪼갬
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const result: string[] = [];

  const wrapLong = (word: string): string[] => {
    const out: string[] = [];
    let cur = '';
    for (const ch of word) {
      if (cur && ctx.measureText(cur + ch).width > maxWidth) {
        out.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    if (cur) out.push(cur);
    return out;
  };

  for (const para of text.split('\n')) {
    if (!para.trim()) { result.push(''); continue; }
    const tokens = para.split(/(\s+)/).filter((t) => t.length > 0);

    let cur = '';
    for (const tok of tokens) {
      const candidate = cur + tok;
      if (ctx.measureText(candidate).width <= maxWidth) {
        cur = candidate;
        continue;
      }
      if (cur) {
        result.push(cur.replace(/\s+$/, ''));
        cur = '';
      }
      if (ctx.measureText(tok).width > maxWidth) {
        const chunks = wrapLong(tok);
        for (let i = 0; i < chunks.length - 1; i++) result.push(chunks[i]);
        cur = chunks[chunks.length - 1] ?? '';
      } else {
        cur = tok.replace(/^\s+/, '');
      }
    }
    if (cur) result.push(cur);
  }
  return result;
}

/**
 * Canvas에 자막 텍스트를 렌더링한다.
 *
 * 지원 속성:
 *   fontFamily, fontSize, fontWeight, fontStyle, textAlign
 *   color, strokeColor, strokeWidth
 *   lineHeight, letterSpacing
 *   positionX, positionY
 *   backgroundBar, backgroundBarColor, backgroundOpacity
 *   opacity
 */
export function renderSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: SubtitleStyle,
  canvasWidth: number,
  canvasHeight: number
): void {
  if (!text) return;

  /* ── 전체 투명도 ── */
  ctx.save();
  ctx.globalAlpha = style.opacity ?? 1.0;

  /* ── 폰트 기본 ── */
  const weight = style.fontWeight  ?? 'bold';
  const fStyle = style.fontStyle   ?? 'normal';

  /* ── 자간 (letterSpacing) ── */
  ctx.letterSpacing = `${style.letterSpacing ?? 0}px`;

  /* ── 텍스트 정렬 ── */
  const align = style.textAlign ?? 'center';
  ctx.textAlign    = align;
  ctx.textBaseline = 'middle';

  /* ── 위치 계산 ── */
  const anchorX  = canvasWidth  * (style.positionX ?? 0.5);
  const anchorY  = canvasHeight * (style.positionY ?? 0.75);

  /* ── [FEATURE: PRESERVE_LINE_BREAKS] 사용자 \n 유지, 자동 wrap 없음 ── */
  ctx.font = `${fStyle} ${weight} ${style.fontSize}px "${style.fontFamily}", sans-serif`;
  const lines     = text.split('\n');
  const lh        = style.fontSize * (style.lineHeight ?? 1.3);
  const totalH    = lines.length * lh;
  const startY    = anchorY - totalH / 2 + lh / 2;

  /* ── 배경 바 ── */
  if (style.backgroundBar) {
    const pad = 20;
    ctx.fillStyle = hexToRgba(
      style.backgroundBarColor ?? '#000000',
      style.backgroundOpacity ?? 0.5
    );
    ctx.fillRect(
      0,
      startY - lh / 2 - pad,
      canvasWidth,
      totalH + pad * 2
    );
  }

  /* ── 텍스트 렌더 (stroke → fill) ── */
  lines.forEach((line, i) => {
    const ly = startY + i * lh;
    if ((style.strokeWidth ?? 0) > 0) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth   = style.strokeWidth;
      ctx.lineJoin    = 'round';
      ctx.strokeText(line, anchorX, ly);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(line, anchorX, ly);
  });

  ctx.restore();
}

/** hex 색상 + alpha → rgba 문자열 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function renderBlackout(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
}

export function renderNoCamera(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  // 배경 — 완전한 검정 (방송 대기 상태)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  // UnoLive 로고 텍스트
  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  // 메인 로고
  ctx.font         = 'bold 96px "Pretendard", "Apple SD Gothic Neo", sans-serif';
  ctx.fillStyle    = 'rgba(255,255,255,0.12)';
  ctx.fillText('UNO LIVE', w / 2, h / 2 - 20);

  // 부제
  ctx.font         = '32px "Pretendard", "Apple SD Gothic Neo", sans-serif';
  ctx.fillStyle    = 'rgba(255,255,255,0.06)';
  ctx.fillText('카메라 신호 대기 중', w / 2, h / 2 + 70);

  ctx.restore();
}
