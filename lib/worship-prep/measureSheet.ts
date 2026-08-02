'use client';

// 브라우저에서 악보 한 장의 크기와 흰 여백을 잰다. 올릴 때 한 번만 돈다.
//
// 왜 브라우저인가 — 서버에서 하려면 이미지 디코더가 필요하고 Vercel 함수 시간을 먹는다.
// 어차피 파일이 사용자 손에 있으니 여기서 재서 값만 같이 보내는 편이 싸다.

import { detectCrop, NO_CROP, type SheetPage } from './sheetPages';

/** 여백을 잴 때 쓰는 축소 폭. 원본 그대로 훑으면 큰 악보에서 느리다 */
const SCAN_WIDTH = 400;

export interface MeasuredSheet {
  w: number;
  h: number;
  crop: SheetPage['crop'];
}

/**
 * 이미지 파일의 원본 크기와 잘라낼 여백을 잰다.
 *
 * 실패하면(PDF, 디코드 불가, canvas 차단) 크기 0 과 NO_CROP 을 돌려준다 —
 * 화면은 그때 자르지 않고 원본 그대로 그린다. 재기 실패가 업로드를 막지는 않는다.
 */
export async function measureSheet(file: File): Promise<MeasuredSheet> {
  if (!file.type.startsWith('image/')) return { w: 0, h: 0, crop: NO_CROP };

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('decode failed'));
      element.src = url;
    });

    const w = image.naturalWidth;
    const h = image.naturalHeight;
    if (!w || !h) return { w: 0, h: 0, crop: NO_CROP };

    const scanW = Math.min(SCAN_WIDTH, w);
    const scanH = Math.max(1, Math.round((h / w) * scanW));
    const canvas = document.createElement('canvas');
    canvas.width = scanW;
    canvas.height = scanH;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return { w, h, crop: NO_CROP };

    /* 투명 PNG 가 검게 읽히지 않도록 흰 바탕을 깔고 그린다 */
    context.fillStyle = '#fff';
    context.fillRect(0, 0, scanW, scanH);
    context.drawImage(image, 0, 0, scanW, scanH);

    const { data } = context.getImageData(0, 0, scanW, scanH);
    const gray = new Uint8Array(scanW * scanH);
    for (let i = 0; i < gray.length; i += 1) {
      const p = i * 4;
      /* 사람 눈 기준 밝기 — 옅은 색 도장·머리글도 내용으로 잡힌다 */
      gray[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) | 0;
    }
    return { w, h, crop: detectCrop(gray, scanW, scanH) };
  } catch {
    return { w: 0, h: 0, crop: NO_CROP };
  } finally {
    URL.revokeObjectURL(url);
  }
}
