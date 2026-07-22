/**
 * components/prompt/promptLayoutRenderer.ts
 * 프롬프트 모니터 레이아웃 디스패처
 *
 * 실제 템플릿 렌더러는 기능별 폴더에서 관리한다.
 * 현재 빌트인 텍스트 템플릿은 찬양대 전용 PMT 기능으로 분리되어 있다.
 */

import type { PromptLayoutType } from '@/lib/types';
import { renderChoirPromptLayout, type PromptVerseContext } from './choir/choirPromptLayoutRenderer';

export type { PromptVerseContext };

/**
 * promptLayout 타입에 따라 적절한 레이아웃 렌더 함수를 호출.
 * 'none' 이면 false 를 반환하여 호출측이 기본 렌더를 수행하도록 알림.
 * verseContext — bible/scripture 전체 절 목록 (없으면 단일 절/본문 렌더로 폴백).
 * scriptureScrollY — scripture(말씀본문) 연속 스크롤의 현재 오프셋(문서 좌표). 호출측이 lerp로 관리.
 */
export function renderPromptLayout(
  ctx: CanvasRenderingContext2D,
  layout: PromptLayoutType,
  currentText: string,
  nextSectionText: string,
  canvasWidth: number,
  canvasHeight: number,
  verseContext?: PromptVerseContext,
  scriptureScrollY?: number,
): boolean {
  return renderChoirPromptLayout(ctx, layout, currentText, nextSectionText, canvasWidth, canvasHeight, verseContext, scriptureScrollY);
}
