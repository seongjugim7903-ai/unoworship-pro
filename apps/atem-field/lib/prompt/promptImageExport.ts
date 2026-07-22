// PMT(무대 sub모니터) 프롬프트 레이아웃 섹션을 오프스크린 캔버스로 렌더해 PNG로 뽑는 클라이언트 유틸
//   - 라이브 송출에 쓰는 renderPromptLayout 을 그대로 재사용해 화면과 동일한 이미지를 생성한다.
//   - 브라우저 전용(document 사용). 클라이언트 컴포넌트에서만 import 할 것.

import { renderPromptLayout } from '@/components/prompt/promptLayoutRenderer';
import type { PromptLayoutType } from '@/lib/types';

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;
// 모바일 고해상도 대응: 논리 1920×1080 을 2배로 래스터(3840×2160). 검정 배경이라 용량은 작다.
const RENDER_SCALE = 2;

/** 이미지 export 시 실제로 그릴 레이아웃 (지원 안 하는 값이면 찬양대 기본 black-white 로 폴백) */
function effectiveLayout(layout: PromptLayoutType): PromptLayoutType {
  return layout === 'black-white' || layout === 'bible' ? layout : 'black-white';
}

/** 섹션 텍스트 하나를 PMT 레이아웃 PNG Blob 으로 렌더 */
export async function renderPromptSectionToBlob(
  layout: PromptLayoutType,
  currentText: string,
  nextText: string,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = BASE_WIDTH * RENDER_SCALE;
  canvas.height = BASE_HEIGHT * RENDER_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D 캔버스 컨텍스트를 만들 수 없습니다.');

  // Noto Sans KR 로드 완료 후 렌더 (미로드 시 시스템 폰트로 폴백되어 자간이 달라질 수 있음)
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // 무시
    }
  }

  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  renderPromptLayout(ctx, effectiveLayout(layout), currentText, nextText, BASE_WIDTH, BASE_HEIGHT);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG 변환에 실패했습니다.'))),
      'image/png',
    );
  });
}

export interface PromptSectionImage {
  index: number;
  label: string;
  blob: Blob;
  /** 미리보기용 object URL — 사용하는 쪽에서 revoke 책임 */
  url: string;
}

/** 프로그램 섹션 배열 전체를 PMT 이미지로 렌더 (순차 처리로 메모리 안전) */
export async function renderPromptImages(
  sections: { label?: string; text: string }[],
  layout: PromptLayoutType,
): Promise<PromptSectionImage[]> {
  const images: PromptSectionImage[] = [];
  for (let i = 0; i < sections.length; i++) {
    const nextText = sections[i + 1]?.text ?? '';
    const blob = await renderPromptSectionToBlob(layout, sections[i].text, nextText);
    images.push({
      index: i,
      label: sections[i].label || `${i + 1}`,
      blob,
      url: URL.createObjectURL(blob),
    });
  }
  return images;
}

/** 파일명에 쓸 수 없는 문자 정리 */
export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').trim() || 'image';
}

/** Blob 을 파일로 다운로드 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
