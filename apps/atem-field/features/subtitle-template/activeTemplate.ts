// 이 교회가 쓰는 자막 템플릿 세트 이름을 한 곳에서 정한다.
//
// 왜 필요한가 — 템플릿은 이름(name)으로 세트를 이룬다. 카테고리마다 같은 이름의
// 템플릿을 두면 그게 한 세트다. 제품은 'basic-001'을 시드로 배포하고, 교회는
// 자기 이름('울주-001' 등)으로 세트를 만든다.
//
//   · 교회가 손본 카테고리 → 교회 세트를 쓴다
//   · 손대지 않은 카테고리 → 시드로 자동 폴백한다 (loadTemplatePicker 가 처리)
//   · 제품 업데이트는 시드만 갱신하므로 교회 디자인을 덮어쓰지 않는다
//
// 저장은 현장 맥의 localStorage 다. 템플릿 파일 자체가 그 맥에 있으므로
// 설정만 클라우드에 두면 오히려 어긋난다(오프라인에서 못 읽는 문제도 있다).

import type { SubtitleTemplate } from './model';
import type { TemplateCategory } from './schema';

/** 제품이 배포하는 시드 세트 이름. 폴백 기준이자 초기값 */
export const SEED_TEMPLATE_NAME = 'basic-001';

const STORAGE_KEY = 'unolive:activeTemplateName';

/**
 * 지금 이 교회가 쓰는 세트 이름.
 * 서버 렌더링·미설정 시에는 시드 이름을 돌려준다.
 */
export function getActiveTemplateName(): string {
  if (typeof window === 'undefined') return SEED_TEMPLATE_NAME;
  try {
    return window.localStorage.getItem(STORAGE_KEY)?.trim() || SEED_TEMPLATE_NAME;
  } catch {
    return SEED_TEMPLATE_NAME;
  }
}

/** 세트 이름을 바꾼다. 빈 값이면 시드로 되돌린다 */
export function setActiveTemplateName(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    const next = name.trim();
    if (!next || next === SEED_TEMPLATE_NAME) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 저장 실패는 무시한다 — 다음 실행에 시드로 돌아갈 뿐이다
  }
}

/**
 * 카테고리 하나를 이름으로 찾되, 없으면 시드로 폴백한다.
 * loadTemplatePicker 와 같은 규칙 — 단건 조회가 필요한 곳(빠른 성경 등)에서 쓴다.
 */
export function findTemplate(
  all: SubtitleTemplate[],
  category: TemplateCategory,
  name = getActiveTemplateName(),
): SubtitleTemplate | undefined {
  return (
    all.find((t) => t.category === category && t.name === name)
    ?? (name === SEED_TEMPLATE_NAME
      ? undefined
      : all.find((t) => t.category === category && t.name === SEED_TEMPLATE_NAME))
  );
}

/** 등록된 템플릿에서 세트 이름 목록을 만든다 (시드는 항상 포함) */
export function listTemplateSetNames(all: SubtitleTemplate[]): string[] {
  const names = new Set<string>([SEED_TEMPLATE_NAME]);
  for (const t of all) {
    const n = t.name.trim();
    if (n) names.add(n);
  }
  return [...names];
}
