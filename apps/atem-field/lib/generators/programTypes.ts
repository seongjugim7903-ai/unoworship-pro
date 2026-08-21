/**
 * lib/generators/programTypes.ts
 * 서버 저장 프로그램 공통 타입
 *
 * 모든 입력 페이지(찬양대, 찬양콘티, 설교대지, 주보 등)가
 * 이 타입으로 서버에 저장/불러오기 된다.
 */

import type { SetlistItem } from '@/lib/types';

/** 프로그램 유형 */
export type ProgramType = 'choir' | 'conti' | 'sermon' | 'bulletin' | 'slide-images' | 'worship';

/**
 * 불러오기 화면의 분류 카테고리.
 * - worship : 예배(워십) 소속 프로그램 (worshipId로 묶임)
 * - program : 워십과 무관하게 자기 이름으로 개별 저장한 재사용 프로그램
 * - choir   : 찬양대(헵시다) 프로그램
 */
export type ProgramCategory = 'worship' | 'program' | 'choir';

export const SLIDE_IMAGE_PROGRAM_TYPE: ProgramType = 'slide-images';

/**
 * 서버에 저장되는 프로그램 레코드
 */
export interface SavedProgram {
  /** 고유 ID (= SetlistItem.id) */
  id: string;
  /** 프로그램 유형 */
  type: ProgramType;
  /**
   * 불러오기 분류 카테고리. 없으면 type으로 추론(resolveProgramCategory).
   * 개별 저장 프로그램만 'program'을 명시적으로 기록한다.
   */
  category?: ProgramCategory;
  /** 워쉽 ID (예: "20260415-수요예배") */
  worshipId: string;
  /** 워쉽 표시명 (예: "2026.04.15 수요예배") */
  worshipName: string;
  /** 원본 폼 데이터 — 수정 시 폼에 복원용 */
  formData: Record<string, unknown>;
  /** 생성된 SetlistItem — UnoLive 등록용 */
  item: SetlistItem;
  /** 생성 시각 (epoch ms) */
  createdAt: number;
  /** 수정 시각 (epoch ms) */
  updatedAt: number;
}

/**
 * 프로그램의 불러오기 카테고리를 결정한다.
 * 명시적 category가 있으면 그것을, 없으면 기존 파일 호환을 위해 type으로 추론한다.
 * (type==='choir' → 'choir', 그 외 → 'worship')
 */
export function resolveProgramCategory(
  program: Pick<SavedProgram, 'category' | 'type'>
): ProgramCategory {
  if (program.category) return program.category;
  return program.type === 'choir' ? 'choir' : 'worship';
}

/** 이미지 슬라이드처럼 생성 당시 elements를 그대로 보존해야 하는 프로그램인지 판별 */
export function shouldPreserveProgramElements(
  program: Pick<SavedProgram, 'type' | 'formData'>
): boolean {
  return (
    program.type === SLIDE_IMAGE_PROGRAM_TYPE ||
    program.formData?.generator === 'ppt-slide-folder-v1' ||
    program.formData?.preserveElements === true
  );
}

/**
 * API 응답 타입
 */
export interface ProgramListResponse {
  programs: SavedProgram[];
}

export interface ProgramResponse {
  program: SavedProgram;
}
