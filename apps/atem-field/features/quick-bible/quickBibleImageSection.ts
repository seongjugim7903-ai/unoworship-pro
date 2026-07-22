'use client';

import { createImageElement } from '@/lib/canvasTypes';
import type { Section } from '@/lib/types';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function filenameToLabel(name: string): string {
  const withoutExt = name.replace(/\.[^.]+$/, '').trim();
  return withoutExt || '업로드 이미지';
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('이미지 파일을 읽지 못했습니다.'));
    };
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

function readImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('이미지 크기를 확인하지 못했습니다.'));
    image.src = src;
  });
}

export async function createQuickBibleImageSection(file: File): Promise<Section> {
  if (!file.type.startsWith('image/')) {
    throw new Error('PNG, JPG, WebP 같은 이미지 파일만 업로드할 수 있습니다.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('이미지는 25MB 이하 파일만 업로드해 주세요.');
  }

  const src = await readAsDataUrl(file);
  const imageSize = await readImageSize(src).catch(() => null);
  const sectionId = createId('sec-quick-image');
  const label = filenameToLabel(file.name);

  return {
    id: sectionId,
    label,
    text: '',
    colorMark: '#38bdf8',
    elements: [
      createImageElement({
        id: `${sectionId}-image`,
        src,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        objectFit: 'contain',
        opacity: 1,
        zIndex: 0,
        locked: false,
        visible: true,
        layerRole: 'props',
        visibleOn: ['output', 'prompt', 'broadcast'],
        imageMeta: imageSize
          ? {
              sourceName: file.name,
              naturalWidthPx: imageSize.width,
              naturalHeightPx: imageSize.height,
            }
          : undefined,
      }),
    ],
  };
}
