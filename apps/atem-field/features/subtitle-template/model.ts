// 자막 템플릿 데이터 모델(SubtitleTemplate/TemplateVariant/ContentUnit)과 에디터 임시 템플릿 헬퍼

import type { CanvasElement, CanvasRenderTarget } from '@/lib/canvasTypes';
import type { TemplateCategory } from './schema';

/** 자동 맞춤(shrink-to-fit) 정책 — Phase 4에서 사용 */
export interface FitPolicy {
  mode: 'shrink' | 'fixed';
  minFontScale?: number;
  maxLines?: number;
}

/** 긴 본문 자동 분할 정책 — Phase 4에서 사용 */
export interface SplitPolicy {
  enabled: boolean;
  maxCharsPerSlide?: number;
}

/** 템플릿 변형 — 기존 default/cover 대응 */
export interface TemplateVariant {
  id: string; // 'body' | 'cover' | ...
  label: string;
  elements: CanvasElement[]; // 텍스트 요소는 fieldRole 로 콘텐츠 필드를 가리킴
  fit?: FitPolicy;
  split?: SplitPolicy;
}

export interface SubtitleTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  /** 마이그레이션용 버전 — 처음부터 박는다 */
  templateVersion: number;
  /** 미리보기 data URL */
  thumbnail?: string;
  /** 출력 대상(강대상/중층/방송) — 기존 main/prompt 개념 대응 */
  target?: CanvasRenderTarget;
  variants: TemplateVariant[];
  createdAt: string;
  updatedAt: string;
}

/** 콘텐츠 소스가 넘기는 값 묶음(디자인은 모른다). 예: { body:'하나님이…', reference:'요 3:16' } */
export interface ContentUnit {
  fields: Partial<Record<string, string>>;
  /** 표지/본문 등 변형 선택 힌트 */
  variantHint?: string;
}

export const TEMPLATE_VERSION = 1;

/**
 * 에디터의 현재 활성 섹션 요소들을 임시(ad-hoc) 템플릿으로 감싼다.
 * 등록 UI(Phase 2) 이전에도 삽입 경로가 applyTemplate 을 통과하도록 하는 다리.
 */
export function makeAdhocTemplate(
  elements: CanvasElement[],
  category: TemplateCategory,
): SubtitleTemplate {
  return {
    id: 'adhoc',
    name: '현재 에디터 디자인',
    category,
    templateVersion: TEMPLATE_VERSION,
    variants: [{ id: 'body', label: '본문', elements }],
    createdAt: '',
    updatedAt: '',
  };
}
