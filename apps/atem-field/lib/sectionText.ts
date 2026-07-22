import type { TextElement } from './canvasTypes';

const VERSE_ONLY = /^\d{1,3}[.．]?$/;

/**
 * 렌더러와 에디터가 같은 방식으로 섹션 본문을 해석하도록 한다.
 * 오래 저장된 섹션은 body 요소가 비어 있거나 절 번호만 가질 수 있다.
 */
export function getTextElementContent(element: TextElement, sectionText = ''): string {
  const ownText = element.content ?? '';
  const fallback = sectionText.trim();
  const isBodyFallback = element.fieldRole === 'body'
    && fallback.length > ownText.trim().length
    && (!ownText.trim() || VERSE_ONLY.test(ownText.trim()));

  if (isBodyFallback) return sectionText;
  if (element.linked && !ownText) return sectionText;
  return ownText;
}
