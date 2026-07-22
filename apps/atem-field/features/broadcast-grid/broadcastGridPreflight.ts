import type { CanvasElement, CanvasRenderTarget, TextElement } from '@/lib/canvasTypes';
import { isElementVisibleOn } from '@/lib/canvasTypes';
import type { PromptLayoutType, Section } from '@/lib/types';

export type BroadcastGridPreflightSeverity = 'danger' | 'warning';
export type BroadcastGridPreflightTarget = 'main' | 'sub' | 'grid';

export interface BroadcastGridPreflightEntry {
  index: number;
  itemTitle: string;
  section: Section;
  promptLayout?: PromptLayoutType;
}

export interface BroadcastGridPreflightIssue {
  sectionId: string;
  index: number;
  target: BroadcastGridPreflightTarget;
  severity: BroadcastGridPreflightSeverity;
  code: 'main-text-missing' | 'sub-text-missing' | 'grid-text-fallback';
  title: string;
  detail: string;
}

export interface BroadcastGridPreflightResult {
  checkedAt: number;
  totalSections: number;
  issues: BroadcastGridPreflightIssue[];
  issueBySectionId: Map<string, BroadcastGridPreflightIssue[]>;
  summary: {
    danger: number;
    warning: number;
    mainMissing: number;
    subMissing: number;
    gridFallback: number;
  };
}

function getVisibleElements(section: Section): CanvasElement[] {
  return (section.elements ?? []).filter((element) => element.visible !== false);
}

function getTextElementsForTarget(section: Section, target: CanvasRenderTarget): TextElement[] {
  return getVisibleElements(section).filter(
    (element): element is TextElement =>
      element.type === 'text' && isElementVisibleOn(element, target),
  );
}

function hasRenderableTextContent(element: TextElement, sectionText: string): boolean {
  if (element.content?.trim()) return true;
  return Boolean(sectionText.trim() && (element.fieldRole === 'body' || element.linked));
}

function hasRenderableTextForTarget(section: Section, target: CanvasRenderTarget): boolean {
  const sectionText = section.text ?? '';
  return getTextElementsForTarget(section, target).some((element) =>
    hasRenderableTextContent(element, sectionText),
  );
}

function promptLayoutCanRenderSectionText(promptLayout?: PromptLayoutType): boolean {
  return Boolean(promptLayout && promptLayout !== 'none');
}

function gridCanShowText(section: Section): boolean {
  const sectionText = section.text?.trim() ?? '';
  if (!sectionText) return false;
  const visibleElements = getVisibleElements(section);
  if (visibleElements.length === 0) return true;
  return visibleElements.some((element) => {
    if (element.type !== 'text') return false;
    return hasRenderableTextContent(element as TextElement, sectionText);
  });
}

function sectionNeedsTextIntegrityCheck(section: Section): boolean {
  return Boolean(section.text?.trim());
}

function pushIssue(
  issues: BroadcastGridPreflightIssue[],
  issue: BroadcastGridPreflightIssue,
): void {
  issues.push(issue);
}

export function runBroadcastGridPreflight(entries: BroadcastGridPreflightEntry[]): BroadcastGridPreflightResult {
  const issues: BroadcastGridPreflightIssue[] = [];

  for (const entry of entries) {
    const { section } = entry;
    if (!sectionNeedsTextIntegrityCheck(section)) continue;

    const hasElements = getVisibleElements(section).length > 0;
    const mainTextOk = !hasElements || hasRenderableTextForTarget(section, 'output');
    const subTextOk =
      promptLayoutCanRenderSectionText(entry.promptLayout) ||
      !hasElements ||
      hasRenderableTextForTarget(section, 'prompt');
    const gridTextOk = gridCanShowText(section);

    if (!mainTextOk) {
      pushIssue(issues, {
        sectionId: section.id,
        index: entry.index,
        target: 'main',
        severity: 'danger',
        code: 'main-text-missing',
        title: '메인 텍스트 누락',
        detail: 'section.text는 있지만 메인(output)으로 렌더 가능한 텍스트 요소가 없습니다.',
      });
    }

    if (!subTextOk) {
      pushIssue(issues, {
        sectionId: section.id,
        index: entry.index,
        target: 'sub',
        severity: 'warning',
        code: 'sub-text-missing',
        title: '서브 텍스트 누락',
        detail: 'section.text는 있지만 서브(prompt)로 렌더 가능한 텍스트 경로가 없습니다.',
      });
    }

    if (!gridTextOk) {
      pushIssue(issues, {
        sectionId: section.id,
        index: entry.index,
        target: 'grid',
        severity: 'warning',
        code: 'grid-text-fallback',
        title: '그리드 텍스트 폴백',
        detail: '그리드가 section.text만 보고 표시할 수 있어 실제 송출과 다를 수 있습니다.',
      });
    }
  }

  const issueBySectionId = new Map<string, BroadcastGridPreflightIssue[]>();
  for (const issue of issues) {
    const list = issueBySectionId.get(issue.sectionId) ?? [];
    list.push(issue);
    issueBySectionId.set(issue.sectionId, list);
  }

  return {
    checkedAt: Date.now(),
    totalSections: entries.length,
    issues,
    issueBySectionId,
    summary: {
      danger: issues.filter((issue) => issue.severity === 'danger').length,
      warning: issues.filter((issue) => issue.severity === 'warning').length,
      mainMissing: issues.filter((issue) => issue.code === 'main-text-missing').length,
      subMissing: issues.filter((issue) => issue.code === 'sub-text-missing').length,
      gridFallback: issues.filter((issue) => issue.code === 'grid-text-fallback').length,
    },
  };
}
