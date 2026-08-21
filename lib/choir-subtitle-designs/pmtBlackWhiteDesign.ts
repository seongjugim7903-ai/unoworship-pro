import { firstMeaningfulLine, fitTextBlock } from './textFit';

export const PMT_BLACK_WHITE_CANVAS = {
  width: 1920,
  height: 1080,
  safeX: 96,
  safeY: 72,
};

/**
 * 제목 슬라이드 오른쪽에 놓는 팀 이름.
 *
 * 지금은 한 팀뿐이라 고정한다. 교회마다 찬양대 이름이 다르므로, 팀 정보가 이 화면에
 * 들어오면 그때 넘겨받는 값으로 바꾼다 — 그래서 입력 항목으로 열어 두었다.
 */
export const DEFAULT_CHOIR_TEAM_NAME = '헵시바 선교단';

export interface PmtBlackWhiteTitleInput {
  songTitle: string;
  teamName: string;
  /** 다음 섹션 미리보기 — 가사 슬라이드와 같은 자리에 같은 모양으로 둔다 */
  nextText: string;
  total: number;
}

export interface PmtBlackWhiteInput {
  composer: string;
  index: number;
  sections: string[];
  serviceDate: string;
  serviceType: string;
  songTitle: string;
  text: string;
}

const FONT_FAMILY = "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";

function drawBackground(ctx: CanvasRenderingContext2D) {
  const { width, height } = PMT_BLACK_WHITE_CANVAS;
  ctx.fillStyle = '#020304';
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width / 2, height * 0.52, 80, width / 2, height * 0.52, 760);
  glow.addColorStop(0, 'rgba(34, 78, 70, .34)');
  glow.addColorStop(0.58, 'rgba(20, 32, 34, .36)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255, 255, 255, .72)';
  ctx.lineWidth = 3;
  ctx.strokeRect(34, 34, width - 68, height - 68);
}

function drawDivider(ctx: CanvasRenderingContext2D, y: number) {
  const centerX = PMT_BLACK_WHITE_CANVAS.width / 2;
  const lineWidth = 720;
  const gradient = ctx.createLinearGradient(centerX - lineWidth / 2, y, centerX + lineWidth / 2, y);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, .72)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - lineWidth / 2, y);
  ctx.lineTo(centerX + lineWidth / 2, y);
  ctx.stroke();
}

function drawMainLyrics(ctx: CanvasRenderingContext2D, text: string) {
  const { width, safeX } = PMT_BLACK_WHITE_CANVAS;
  const fitted = fitTextBlock(ctx, text, {
    fontFamily: FONT_FAMILY,
    fontWeight: 900,
    maxFontSize: 152,
    minFontSize: 82,
    maxLines: 2,
    maxWidth: width - safeX * 2,
  });
  const lineHeight = fitted.fontSize * 1.22;
  const centerY = 470;
  const startY = centerY - ((fitted.lines.length - 1) * lineHeight) / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${fitted.fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(255, 255, 255, .48)';
  ctx.shadowBlur = 18;

  fitted.lines.forEach((line, index) => {
    ctx.fillText(line, width / 2, startY + index * lineHeight);
  });
  ctx.shadowBlur = 0;

  return startY + (fitted.lines.length - 1) * lineHeight + fitted.fontSize * 0.78;
}

function drawNextCue(ctx: CanvasRenderingContext2D, input: PmtBlackWhiteInput, dividerY: number) {
  const nextText = firstMeaningfulLine(input.sections[input.index + 1] ?? '');
  if (!nextText) return;

  const { width, safeX } = PMT_BLACK_WHITE_CANVAS;
  const fitted = fitTextBlock(ctx, nextText, {
    fontFamily: FONT_FAMILY,
    fontWeight: 800,
    maxFontSize: 58,
    minFontSize: 34,
    maxLines: 1,
    maxWidth: width - safeX * 2,
  });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${fitted.fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = 'rgba(255, 255, 255, .86)';
  ctx.shadowColor = 'rgba(255, 255, 255, .22)';
  ctx.shadowBlur = 10;
  ctx.fillText(fitted.lines[0], width / 2, dividerY + 76);
  ctx.shadowBlur = 0;
}

function drawFooter(ctx: CanvasRenderingContext2D, input: PmtBlackWhiteInput) {
  const { width, height, safeX } = PMT_BLACK_WHITE_CANVAS;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255, 255, 255, .34)';
  ctx.font = `600 24px ${FONT_FAMILY}`;
  ctx.fillText(`${String(input.index + 1).padStart(2, '0')} / ${input.sections.length}`, safeX, height - 70);

  ctx.textAlign = 'right';
  ctx.fillText('UnoWorship Pro', width - safeX, height - 70);
  ctx.textAlign = 'left';
}

/**
 * 맨 앞 제목 슬라이드 — 곡명은 왼쪽, 팀 이름은 오른쪽.
 *
 * 가사 슬라이드는 가운데 정렬이라 제목까지 가운데로 두면 무엇이 제목인지 구분이 안 된다.
 * 좌우로 벌려 놓으면 한눈에 '이건 표지'로 읽힌다.
 *
 * 두 글자 크기가 다르므로 가운데선이 아니라 **밑선(baseline)을 맞춘다.** 가운데선을
 * 맞추면 큰 글자가 아래로 처져 보인다.
 */
export function renderPmtBlackWhiteTitle(ctx: CanvasRenderingContext2D, input: PmtBlackWhiteTitleInput) {
  const { width, safeX } = PMT_BLACK_WHITE_CANVAS;
  const baselineY = 520;

  drawBackground(ctx);

  /* 팀 이름을 먼저 재서 곡명이 쓸 수 있는 폭을 남긴다 — 긴 곡명이 팀 이름을 밀지 않게 */
  const teamFontSize = 54;
  ctx.font = `800 ${teamFontSize}px ${FONT_FAMILY}`;
  const teamWidth = ctx.measureText(input.teamName).width;

  const gap = 56;
  const titleMaxWidth = width - safeX * 2 - teamWidth - gap;
  const fitted = fitTextBlock(ctx, input.songTitle, {
    fontFamily: FONT_FAMILY,
    fontWeight: 900,
    maxFontSize: 132,
    minFontSize: 56,
    maxLines: 1,
    maxWidth: titleMaxWidth,
  });

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `900 ${fitted.fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(255, 255, 255, .48)';
  ctx.shadowBlur = 18;
  ctx.fillText(fitted.lines[0] ?? '', safeX, baselineY);
  ctx.shadowBlur = 0;

  ctx.textAlign = 'right';
  ctx.font = `800 ${teamFontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = 'rgba(255, 255, 255, .78)';
  ctx.fillText(input.teamName, width - safeX, baselineY);
  ctx.textAlign = 'left';

  /* 아래쪽은 가사 슬라이드와 똑같이 둔다 — 표지만 따로 노는 화면이 되지 않게 */
  const dividerY = 700;
  drawDivider(ctx, dividerY);

  if (input.nextText) {
    const cue = fitTextBlock(ctx, input.nextText, {
      fontFamily: FONT_FAMILY,
      fontWeight: 800,
      maxFontSize: 58,
      minFontSize: 34,
      maxLines: 1,
      maxWidth: width - safeX * 2,
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${cue.fontSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = 'rgba(255, 255, 255, .86)';
    ctx.shadowColor = 'rgba(255, 255, 255, .22)';
    ctx.shadowBlur = 10;
    ctx.fillText(cue.lines[0], width / 2, dividerY + 76);
    ctx.shadowBlur = 0;
  }

  drawFooter(ctx, { index: 0, sections: new Array(input.total).fill('') } as PmtBlackWhiteInput);
}

export function renderPmtBlackWhiteSection(ctx: CanvasRenderingContext2D, input: PmtBlackWhiteInput) {
  drawBackground(ctx);
  const lyricBottom = drawMainLyrics(ctx, input.text);
  const dividerY = Math.min(760, Math.max(672, lyricBottom + 54));
  drawDivider(ctx, dividerY);
  drawNextCue(ctx, input, dividerY);
  drawFooter(ctx, input);
}
