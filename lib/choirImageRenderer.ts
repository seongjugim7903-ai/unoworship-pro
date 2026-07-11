// 찬양대 가사 섹션을 1920x1080 검정 배경 PNG로 변환하는 브라우저 전용 렌더러

const WIDTH = 1920;
const HEIGHT = 1080;

export interface ChoirImage {
  index: number;
  label: string;
  blob: Blob;
  url: string;
}

interface ChoirImageInput {
  churchName: string;
  serviceType: string;
  serviceDate: string;
  songTitle: string;
  composer: string;
  arranger: string;
  sections: string[];
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, fontSize: number) {
  ctx.font = `700 ${fontSize}px 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`;
  const lines: string[] = [];
  text.split('\n').forEach((paragraph) => {
    let line = '';
    for (const character of paragraph || ' ') {
      const candidate = line + character;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  });
  return lines.slice(0, 5);
}

function renderSection(ctx: CanvasRenderingContext2D, input: ChoirImageInput, text: string, index: number) {
  ctx.fillStyle = '#050608';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#a9b2c3';
  ctx.font = "500 28px 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
  ctx.fillText(input.churchName || 'UnoWorship', 96, 88);
  ctx.fillText(`${input.serviceType}  ·  ${input.serviceDate || '날짜 미입력'}`, 96, 132);

  ctx.fillStyle = '#ffffff';
  ctx.font = "800 62px 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
  ctx.fillText(input.songTitle, 96, 248);
  ctx.fillStyle = '#64748b';
  ctx.font = "500 26px 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
  ctx.fillText([input.composer && `작곡 ${input.composer}`, input.arranger && `편곡 ${input.arranger}`].filter(Boolean).join('  ·  '), 98, 296);

  const fontSize = text.length > 100 ? 54 : text.length > 60 ? 64 : 76;
  const lines = wrapLines(ctx, text, 1680, fontSize);
  const lineHeight = fontSize * 1.55;
  const startY = 530 - ((lines.length - 1) * lineHeight) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,255,255,.12)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#ffffff';
  lines.forEach((line, lineIndex) => ctx.fillText(line, WIDTH / 2, startY + lineIndex * lineHeight));
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#64748b';
  ctx.font = "500 24px 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
  ctx.fillText(`찬양대 자막  ${String(index + 1).padStart(2, '0')} / ${input.sections.length}`, 96, 1000);
  ctx.textAlign = 'right';
  ctx.fillText('UnoWorship Pro', WIDTH - 96, 1000);
  ctx.textAlign = 'left';
}

export async function renderChoirImages(input: ChoirImageInput): Promise<ChoirImage[]> {
  const images: ChoirImage[] = [];
  for (let index = 0; index < input.sections.length; index += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D 컨텍스트를 만들 수 없습니다.');
    renderSection(context, input, input.sections[index], index);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG 변환 실패')), 'image/png'));
    images.push({ index: index + 1, label: `${index + 1}번 섹션`, blob, url: URL.createObjectURL(blob) });
  }
  return images;
}

export function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').trim() || 'unoworship';
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
