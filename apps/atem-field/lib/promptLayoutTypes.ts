/**
 * lib/promptLayoutTypes.ts
 * 프롬프트 모니터 레이아웃 메타데이터 호환 export
 *
 * 빌트인 텍스트 PMT 템플릿은 찬양대 전용 기능으로
 * lib/prompt/choirPromptLayouts.ts 에서 관리한다.
 */

export type { ChoirPromptLayoutMeta as PromptLayoutMeta } from './prompt/choirPromptLayouts';
export { CHOIR_PROMPT_LAYOUTS as PROMPT_LAYOUTS } from './prompt/choirPromptLayouts';
