// 찬양대 가사 섹션을 1920x1080 PMT 블랙+흰색가사 PNG로 변환하는 브라우저 전용 렌더러

import {
  PMT_BLACK_WHITE_CANVAS,
  renderPmtBlackWhiteSection,
} from './choir-subtitle-designs/pmtBlackWhiteDesign';

const WIDTH = PMT_BLACK_WHITE_CANVAS.width;
const HEIGHT = PMT_BLACK_WHITE_CANVAS.height;

export interface ChoirImage {
  index: number;
  label: string;
  blob: Blob;
  uploadBlob: Blob;
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

function renderSection(ctx: CanvasRenderingContext2D, input: ChoirImageInput, text: string, index: number) {
  renderPmtBlackWhiteSection(ctx, {
    composer: input.composer,
    index,
    sections: input.sections,
    serviceDate: input.serviceDate,
    serviceType: input.serviceType,
    songTitle: input.songTitle,
    text,
  });
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
    const webpBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92));
    const uploadBlob = webpBlob?.type === 'image/webp' && webpBlob.size < blob.size
      ? webpBlob
      : blob;
    images.push({
      index: index + 1,
      label: `${index + 1}번 섹션`,
      blob,
      uploadBlob,
      url: URL.createObjectURL(blob),
    });
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
