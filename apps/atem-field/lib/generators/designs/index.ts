/**
 * lib/generators/designs/index.ts
 * 디자인 템플릿 레지스트리
 *
 * 각 제너레이터(찬양대, 찬양콘티, 설교대지, 주보 등)는
 * 자기 전용 디자인 파일을 갖고, 여기서 공통 타입을 export.
 *
 * 디자인 = 강대상 모니터용 CanvasElement[] + 중층 모니터용 PromptLayoutType
 */

import type { CanvasElement } from '@/lib/canvasTypes';
import type { PromptLayoutType, SubtitleStyle } from '@/lib/types';

/**
 * 섹션 디자인 — 각 섹션에 적용할 캔버스 요소 목록
 * 텍스트 요소의 content 는 빈 문자열 → 제너레이터가 가사로 채움
 */
export interface SectionDesign {
  /** 강대상(출력) 모니터에 표시할 캔버스 요소 템플릿 */
  elements: CanvasElement[];
}

/**
 * 프로그램 디자인 — SetlistItem 레벨 설정
 */
export interface ProgramDesign {
  /** 중층(프롬프트) 모니터 레이아웃 */
  promptLayout: PromptLayoutType;
  /** 자막 스타일 오버라이드 (선택) */
  subtitleStyle?: Partial<SubtitleStyle>;
  /** 기본 섹션 디자인 — 모든 가사 섹션에 동일 적용 */
  defaultSection: SectionDesign;
  /** 표지 섹션 디자인 (선택 — 없으면 defaultSection 사용) */
  coverSection?: SectionDesign;
}
