/**
 * 찬양대 전용 PMT 레이아웃 메타데이터
 *
 * 텍스트 디자인이 템플릿처럼 미리 들어가 있는 PMT 프리셋은
 * 일반 분리출력 기능이 아니라 찬양대/무대팀 전용 프롬프트 기능으로 관리한다.
 */

import type { BuiltInPromptLayoutType } from '@/lib/types';

export interface ChoirPromptLayoutMeta {
  type: BuiltInPromptLayoutType;
  label: string;
  description: string;
  enabled: boolean;
}

export const CHOIR_PROMPT_LAYOUTS: ChoirPromptLayoutMeta[] = [
  { type: 'none',           label: '없음',          description: '강대상과 동일',           enabled: true },
  { type: 'black-white',    label: '블랙+흰색가사',  description: '찬양대용 큰 흰색 가사',    enabled: true },
  { type: 'scripture',      label: '말씀본문',       description: '전체 절 연속 스크롤 · 현재 섹션 센터', enabled: true },
  { type: 'youtube-dance',  label: '안무영상',       description: '찬양대 안무 영상 레이아웃', enabled: false },
  { type: 'bible',          label: '성경본문',       description: '설교용 큰 본문 + 장절 표기', enabled: true },
  { type: 'layout4',        label: '레이아웃 4',     description: '예비 레이아웃 4',         enabled: false },
  { type: 'layout5',        label: '레이아웃 5',     description: '예비 레이아웃 5',         enabled: false },
];
