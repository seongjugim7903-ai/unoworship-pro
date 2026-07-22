// 성경본문(scripture) 템플릿의 "다음섹션 첫 줄"(fieldRole='nextLine') 슬롯을 송출 시점에 자동 주입.
// PMT black-white 레이아웃(무대 프롬프터)이 다음 섹션 첫 줄을 뽑는 규칙을 그대로 재사용한다.

import type { CanvasElement, TextElement } from '@/lib/canvasTypes';

/**
 * [FEATURE: SCRIPTURE_NEXT_LINE]
 * PMT 블랙+흰색가사 레이아웃(components/prompt/choir/choirPromptLayoutRenderer.ts,
 * renderBlackWhiteChoirLayout)의 nextFirstLine 규칙과 동일 —
 * 다음 섹션 텍스트에서 첫 번째 비어있지 않은 줄을 돌려준다.
 */
export function extractNextFirstLine(nextSectionText: string): string {
  if (!nextSectionText) return '';
  return nextSectionText.split('\n').find((line) => line.trim() !== '')?.trim() ?? '';
}

/**
 * fieldRole='nextLine' 텍스트 요소에 다음 섹션 첫 줄을 주입한다.
 *  - 다음 줄이 있으면 그 내용으로 채우고 표시.
 *  - 없으면(마지막 섹션 등) 그 요소를 숨긴다(다른 콘텐츠 슬롯의 미설정 처리와 동일).
 *  - nextLine 슬롯이 아예 없는 섹션은 원본 배열을 그대로 반환(불필요한 복제 회피).
 */
export function injectNextLineIntoElements(
  elements: CanvasElement[],
  nextSectionText: string,
): CanvasElement[] {
  const hasNextLineSlot = elements.some(
    (el) => el.type === 'text' && (el as TextElement).fieldRole === 'nextLine',
  );
  if (!hasNextLineSlot) return elements;

  const nextLine = extractNextFirstLine(nextSectionText);
  return elements.map((el) => {
    if (el.type !== 'text' || (el as TextElement).fieldRole !== 'nextLine') return el;
    const t = { ...(el as TextElement) };
    if (nextLine) {
      t.content = nextLine;
      t.linked = false;
      t.visible = true;
    } else {
      t.content = '';
      t.visible = false;
    }
    return t;
  });
}
