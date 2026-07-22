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

export const SLIDE_IMAGE_PROGRAM_TYPE: ProgramType = 'slide-images';

/**
 * 서버에 저장되는 프로그램 레코드
 */
export interface SavedProgram {
  /** 고유 ID (= SetlistItem.id) */
  id: string;
  /** 프로그램 유형 */
  type: ProgramType;
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
