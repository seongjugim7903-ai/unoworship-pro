// 말씀찾기(인용)·대지타이틀만 독립 프로그램으로 저장하는 생성기.
// 전체 예배 순서 생성과 분리해 data/programs에 단일 프로그램 레코드만 만든다.

import type { Section, SetlistItem } from '@/lib/types';
import type { SavedProgram } from './programTypes';
import { formatDateISO } from './worshipUploader';
import { CHOIR_DESIGN } from './designs/choirDesign';
import { listTemplates } from '@/features/subtitle-template/templateClient';
import { applyTemplate } from '@/features/subtitle-template/applyTemplate';
import type { SubtitleTemplate } from '@/features/subtitle-template/model';
import type { TemplateCategory } from '@/features/subtitle-template/schema';

const DEFAULT_TEMPLATE_NAME = 'basic-001';

export interface QuoteProgramForm {
  worshipDate: string;
  templateName: string;
  quotesText: string;
}

export interface QuoteProgramResult {
  worshipId: string;
  worshipName: string;
  sectionCount: number;
  saved: boolean;
  warnings: string[];
}

interface BibleVerseDto {
  num: number;
  text: string;
}

interface BibleResponseDto {
  reference: string;
  verses: BibleVerseDto[];
}

function makeFallbackTemplate(category: TemplateCategory): SubtitleTemplate {
  return {
    id: `fallback-${category}`,
    name: 'fallback',
    category,
    templateVersion: 1,
    variants: [{
      id: 'body',
      label: '본문',
      elements: CHOIR_DESIGN.defaultSection.elements.map((element) => JSON.parse(JSON.stringify(element))),
    }],
    createdAt: '',
    updatedAt: '',
  };
}

async function loadTemplatePicker(templateName: string) {
  const selectedName = templateName.trim() || DEFAULT_TEMPLATE_NAME;
  let templates: SubtitleTemplate[] = [];
  try {
    templates = await listTemplates();
  } catch {
    // 저장 API가 동작해도 템플릿 API가 일시적으로 응답하지 않을 수 있어 폴백을 사용한다.
  }

  const missing = new Set<TemplateCategory>();
  const cache = new Map<TemplateCategory, SubtitleTemplate>();
  return {
    selectedName,
    missing,
    get(category: TemplateCategory): SubtitleTemplate {
      const cached = cache.get(category);
      if (cached) return cached;
      const selected = templates.find((template) =>
        template.category === category && (template.name === selectedName || template.name.includes(selectedName)),
      );
      const basic = templates.find((template) =>
        template.category === category && (template.name === DEFAULT_TEMPLATE_NAME || template.name.includes(DEFAULT_TEMPLATE_NAME)),
      );
      const template = selected ?? basic ?? makeFallbackTemplate(category);
      if (!selected) missing.add(category);
      cache.set(category, template);
      return template;
    },
  };
}

function isScriptureRefLine(line: string): boolean {
  return /^[가-힣A-Za-z0-9]+(\s+\d+)?\s*\d*\s*:\s*\d+(\s*[-~,]\s*\d+)*$/.test(line.trim());
}

function stripHeadings(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/^\s*-\d+\s+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function fetchBible(reference: string): Promise<BibleResponseDto | null> {
  try {
    const response = await fetch(`/api/bible?ref=${encodeURIComponent(reference)}`);
    if (!response.ok) return null;
    const data = (await response.json()) as BibleResponseDto;
    return Array.isArray(data.verses) ? data : null;
  } catch {
    return null;
  }
}

function makeSections(
  template: SubtitleTemplate,
  fields: Record<string, string>,
  idPrefix: string,
  label: string,
): Section[] {
  return applyTemplate(template, { fields }, { idPrefix, label, colorMark: '#ffffff' });
}

async function resolveQuoteIdentity(baseId: string, baseName: string): Promise<{ worshipId: string; worshipName: string }> {
  const response = await fetch('/api/programs');
  if (!response.ok) throw new Error(`기존 프로그램 목록 확인 실패 (${response.status})`);

  const data = (await response.json()) as { programs?: SavedProgram[] };
  const programs = Array.isArray(data.programs) ? data.programs : [];
  const ids = new Set(programs.map((program) => program.worshipId));
  const names = new Set(programs.map((program) => program.worshipName));
  if (!ids.has(baseId) && !names.has(baseName)) {
    return { worshipId: baseId, worshipName: baseName };
  }

  let suffix = 1;
  while (ids.has(`${baseId}-${suffix}`) || names.has(`${baseName} (${suffix})`)) suffix += 1;
  return {
    worshipId: `${baseId}-${suffix}`,
    worshipName: `${baseName} (${suffix})`,
  };
}

/** 말씀찾기(인용)·대지타이틀 입력만 프로그램 파일로 저장한다. */
export async function createQuoteProgram(form: QuoteProgramForm): Promise<QuoteProgramResult> {
  const lines = form.quotesText.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error('말씀찾기(인용) 또는 대지타이틀을 한 줄 이상 입력해 주세요.');

  const dateDisplay = formatDateISO(form.worshipDate).replace(/-/g, '.');
  const { worshipId, worshipName } = await resolveQuoteIdentity(
    `${form.worshipDate}-quote`,
    `${dateDisplay} 말씀찾기(인용)`,
  );
  const picker = await loadTemplatePicker(form.templateName);
  const itemId = `${worshipId}-01-말씀찾기인용`;
  const sections: Section[] = [];
  const warnings: string[] = [];
  let quoteNo = 0;
  let pointNo = 0;

  for (const line of lines) {
    if (isScriptureRefLine(line)) {
      quoteNo += 1;
      const found = await fetchBible(line);
      if (found?.verses.length) {
        const refBase = found.reference.split(':')[0];
        for (const verse of found.verses) {
          sections.push(...makeSections(
            picker.get('bible'),
            {
              body: stripHeadings(verse.text),
              reference: `${refBase}:${verse.num}`,
              verse: '',
            },
            `${itemId}-q${quoteNo}-v${verse.num}`,
            `인용${quoteNo}-${verse.num}`,
          ));
        }
      } else {
        warnings.push(`인용 구절(${line})을 찾지 못해 표기만 넣었습니다.`);
        sections.push(...makeSections(
          picker.get('bible'),
          { body: line, reference: line, verse: '' },
          `${itemId}-q${quoteNo}`,
          `인용 ${quoteNo}`,
        ));
      }
      continue;
    }

    pointNo += 1;
    sections.push(...makeSections(
      picker.get('pointTitle'),
      { point: line, pointNumber: `${pointNo}`, body: line },
      `${itemId}-p${pointNo}`,
      `대지 ${pointNo}`,
    ));
  }

  if (picker.missing.size > 0) {
    warnings.push(`템플릿 ${picker.selectedName}의 미등록 카테고리는 basic-001 또는 기본 디자인으로 생성했습니다.`);
  }

  const item: SetlistItem = {
    id: itemId,
    title: `${form.worshipDate}-말씀찾기(인용)`,
    sections,
    promptLayout: 'bible',
  };
  const now = Date.now();
  const program: SavedProgram = {
    id: itemId,
    type: 'worship',
    worshipId,
    worshipName,
    formData: {
      generator: 'quote-program-v1',
      preserveElements: true,
      templateName: picker.selectedName,
      quotesText: form.quotesText,
    },
    item,
    createdAt: now,
    updatedAt: now,
  };

  const response = await fetch('/api/programs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(program),
  });
  if (!response.ok) throw new Error(`말씀찾기(인용) 프로그램 저장 실패 (${response.status})`);

  return { worshipId, worshipName, sectionCount: sections.length, saved: true, warnings };
}
