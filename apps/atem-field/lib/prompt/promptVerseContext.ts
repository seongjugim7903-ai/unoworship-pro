// bible PMT 송출용 — 프로그램 전체 절 목록과 현재 위치를 페이로드 필드로 구성 (무대 프롬프터 전체 보기)

import { extractSectionDisplayText } from '@/lib/types';
import type { PromptLayoutType, Section, SetlistItem } from '@/lib/types';
import type { TextElement } from '@/lib/canvasTypes';
import { isSermonTitleSection } from './sermonTitleSection';

export interface PromptVerseContextFields {
  promptVerses: string[];
  promptCurrentIndex: number;
  /** [FEATURE: SCRIPTURE_PMT] 말씀본문 전체 구간(예 "마 5:4-25") — 서브 상단 고정 헤더용. scripture 에서만 채움 */
  scripturePassage?: string;
}

/** 서버 검증 상한과 일치 — 초과 시 컨텍스트 생략(단일 절 폴백 렌더) */
export const MAX_PROMPT_VERSES = 300;

/** 섹션의 장절표기(fieldRole='reference') 요소 내용 — 없으면 빈 문자열 (예: "마 5:1", "마 26:26-28") */
function getSectionReference(section: Section): string {
  const el = section.elements.find(
    (e): e is TextElement => e.type === 'text' && e.fieldRole === 'reference',
  );
  return (el?.content ?? '').trim();
}

/**
 * [FIX: SCRIPTURE_REF_TITLE] 장절표기만 있고 실제 본문(절)이 없는 "책장절 타이틀" 섹션 판정.
 *   예) 말씀타이틀: reference="마5:9-12", text="마5:9-12" (본문 == 장절표기).
 *   말씀본문(scripture) 절 스크롤에서 이런 섹션은 제외한다 — 본문(절)이 이미 장절표기를 담으므로
 *   별도 타이틀은 "마5:9-12 마5:9-12"처럼 중복으로 보인다. isSermonTitleSection(title/name)이
 *   놓치는 reference-only 섹션을 잡는다.
 */
function isReferenceOnlyTitle(section: Section): boolean {
  const reference = getSectionReference(section);
  if (!reference) return false;
  const body = extractSectionDisplayText(section).trim();
  return body === '' || body === reference;
}

/** 장절표기 파싱 — 책·장·절(범위 시작~끝). 형식 불명이면 null (예: "마 26:26-28"→{마,26,26,28}) */
interface ReferenceParts {
  book: string;
  chapter: number;
  vStart: number;
  vEnd: number;
}
function parseReference(reference: string): ReferenceParts | null {
  const m = reference.match(/^(.+?)\s*(\d+)\s*:\s*(\d+)(?:\s*[-~]\s*(\d+))?/);
  if (!m) return null;
  const vStart = parseInt(m[3], 10);
  const vEnd = m[4] ? parseInt(m[4], 10) : vStart;
  return { book: m[1].trim(), chapter: parseInt(m[2], 10), vStart, vEnd };
}

/**
 * [FEATURE: SCRIPTURE_PMT] 말씀본문 전체 구간 문자열 — 첫·마지막 절의 장절표기로 만든다.
 *   예) 마5:4~마5:25 → "마 5:4-25", 마5:4~마6:20 → "마 5:4-6:20".
 * 절은 본문만 스크롤하고, 이 구간을 서브 모니터 상단에 고정 표기한다(워십 본문 필드 값과 동일).
 */
function deriveScripturePassage(sections: Section[]): string {
  let first: ReferenceParts | null = null;
  let last: ReferenceParts | null = null;
  for (const s of sections) {
    const parsed = parseReference(getSectionReference(s));
    if (!parsed) continue;
    if (!first) first = parsed;
    last = parsed;
  }
  if (!first || !last) return '';
  if (first.book === last.book && first.chapter === last.chapter) {
    return first.vStart === last.vEnd
      ? `${first.book} ${first.chapter}:${first.vStart}`
      : `${first.book} ${first.chapter}:${first.vStart}-${last.vEnd}`;
  }
  if (first.book === last.book) {
    return `${first.book} ${first.chapter}:${first.vStart}-${last.chapter}:${last.vEnd}`;
  }
  return `${first.book} ${first.chapter}:${first.vStart} - ${last.book} ${last.chapter}:${last.vEnd}`;
}

/**
 * 유효 promptLayout이 'bible' 또는 'scripture'인 프로그램의 전체 섹션 텍스트를 절 목록으로 만든다.
 *   - bible: 무대 프롬프터 전체 절 보기(현재 절 강조 + 이전/다음)
 *   - scripture(말씀본문): 전체 절을 세로로 이어 붙여 현재 섹션이 센터로 오도록 연속 스크롤
 * 둘 다 아니거나 현재 섹션을 못 찾으면 null (페이로드에 안 실림 → 기존 동작 유지).
 */
export function buildPromptVerseContext(
  item: SetlistItem | undefined,
  currentSectionId: string,
  effectivePromptLayout: PromptLayoutType | undefined,
): PromptVerseContextFields | null {
  if (!item || (effectivePromptLayout !== 'bible' && effectivePromptLayout !== 'scripture')) return null;
  // [FEATURE: SCRIPTURE_PMT_EXCLUDE] 말씀본문(scripture)에서는 설교 타이틀류(말씀타이틀·제목/본문·설교자)
  //   섹션을 절 목록에서 제외한다(성경 본문만 스크롤). bible 에는 그런 섹션이 없어 영향 없음.
  const sections =
    effectivePromptLayout === 'scripture'
      ? item.sections.filter((s) => !isSermonTitleSection(s) && !isReferenceOnlyTitle(s))
      : item.sections;
  if (sections.length === 0 || sections.length > MAX_PROMPT_VERSES) return null;
  const promptCurrentIndex = sections.findIndex((s) => s.id === currentSectionId);
  if (promptCurrentIndex < 0) return null;
  // scripture(말씀본문): 절은 본문만 스크롤하고, 전체 구간은 상단 고정 헤더(scripturePassage)로 표기.
  // bible(성경본문): 각 절에 장절표기(책장절)를 앞줄로 붙인다 → 여러 곳 인용마다 책장절이 보이게.
  const promptVerses =
    effectivePromptLayout === 'scripture'
      ? sections.map((s) => extractSectionDisplayText(s))
      : sections.map((s) => {
          const reference = getSectionReference(s);
          const body = extractSectionDisplayText(s);
          return reference ? `${reference}\n${body}` : body;
        });
  const scripturePassage =
    effectivePromptLayout === 'scripture' ? deriveScripturePassage(sections) : undefined;
  return { promptVerses, promptCurrentIndex, scripturePassage };
}
