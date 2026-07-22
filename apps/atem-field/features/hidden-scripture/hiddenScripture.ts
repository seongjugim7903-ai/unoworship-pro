// 말씀찾기(본문) 프로그램 식별 — 워십 로드 시 프로그램 목록 맨 앞(items[0])에 배치해
// 장 전체 절 섹션이 전역 번호 1번부터(번호=절)를 차지하게 하는 플래그.

/**
 * [FEATURE: HIDDEN_SCRIPTURE → SCRIPTURE_FIRST]
 *
 * 규칙 (2026-07-10 사용자 확정 — 숨김 동작 제거):
 *  - 워십 생성 시 본문이 "창 1:4-5"면 창세기 1장 전체(1절~끝절)를 절별 섹션으로 만든
 *    "말씀찾기(본문)" 프로그램을 만들고, 로드 시 세트리스트 맨 앞(items[0])에 둔다.
 *    → 전역 섹션 번호 1..N 을 이 프로그램이 차지하고(번호=절 번호), 다음 프로그램은 N+1 부터.
 *  - 프로그램 목록·섹션 리스트에 항상 보인다 — 일반 프로그램처럼 Delete 로 직접 삭제 가능.
 *  - (구) "투명인간" 숨김 동작은 제거됨: 숨겨서 수동 삭제가 불가능했고, 이를 보완하려던
 *    로드 시 자동 purge 가 서버 저장 경합 때 새 워십 것까지 지우는 사고가 있었다.
 *
 * 생성 측: lib/generators/worshipServiceGenerator.ts (hiddenScripture: true 로 생성 — 필드명은
 *          기존 저장 데이터 호환을 위해 유지, 의미는 "맨앞 고정 말씀찾기(본문)" 식별)
 * 로드 측: components/composer/setlist/ServerWorshipLoader.tsx (맨앞 배치 + 초기 활성 프로그램 선택)
 */

import type { SetlistItem } from '@/lib/types';

/** 이 프로그램이 말씀찾기(본문) 프로그램인가 (맨앞 배치 대상) */
export function isHiddenScriptureItem(item: Pick<SetlistItem, 'hiddenScripture'>): boolean {
  return !!item.hiddenScripture;
}

/** 워십 로드 직후 활성화할 프로그램 — 말씀찾기(본문)는 건너뛰고 첫 일반 프로그램부터 */
export function firstVisibleItem(items: readonly SetlistItem[]): SetlistItem | undefined {
  return items.find((i) => !isHiddenScriptureItem(i)) ?? items[0];
}
