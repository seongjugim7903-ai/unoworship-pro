// 설교 타이틀류 섹션(말씀타이틀·제목/본문·설교자) 판정 — 말씀본문(scripture) PMT 제외용

import type { Section } from '@/lib/types';
import type { TextElement } from '@/lib/canvasTypes';

/**
 * [FEATURE: SCRIPTURE_PMT_EXCLUDE]
 * 말씀타이틀(title)·제목/본문(title+scriptureRef)·설교자(name) 카테고리 섹션인지 판별한다.
 *   - 본문(body) 역할이 있으면 본문형(성경문구·본문묵상·찬송 등)이므로 대상 아님.
 *   - body 가 없고 title 또는 name 역할이 있으면 설교 타이틀류로 본다.
 *   - 대지타이틀(point)은 title/name 이 아니므로 대상 아님(요청 3종만 제외).
 * → scripture(말씀본문) PMT 에서 이 섹션들은 전체 절 스크롤에서 빼고(절 목록 제외),
 *   해당 섹션 송출 시엔 scripture 렌더를 적용하지 않는다.
 */
export function isSermonTitleSection(section: Section): boolean {
  const roles = new Set<string>();
  for (const el of section.elements ?? []) {
    if (el.type !== 'text') continue;
    const t = el as TextElement;
    if (t.fieldRole && t.content?.trim()) roles.add(t.fieldRole);
  }
  if (roles.has('body')) return false;
  return roles.has('title') || roles.has('name');
}
