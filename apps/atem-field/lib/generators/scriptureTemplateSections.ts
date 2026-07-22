// 말씀찾기 전용 성경문구 섹션 생성기.
// 템플릿 종류/이름과 상관없이 선택된 성경문구 템플릿의 본문 텍스트 박스를 기준으로
// 본문이 넘치면 applyBibleTemplate의 박스 측정 분할 경로를 강제로 통과시킨다.

import { applyBibleTemplate, type TemplateBodySplitStrategy } from '@/features/subtitle-template/templateOverflow';
import type { SubtitleTemplate } from '@/features/subtitle-template/model';
import type { CanvasElement, TextElement } from '@/lib/canvasTypes';
import type { Section } from '@/lib/types';

export interface ScriptureTemplateFields {
  body: string;
  reference?: string;
  verse?: string;
  [key: string]: string | undefined;
}

export interface ScriptureTemplateSectionOptions {
  idPrefix: string;
  label: string;
  colorMark?: string;
  maxCharsPerSlide?: number;
  splitStrategy?: TemplateBodySplitStrategy;
}

function isTextElement(element: CanvasElement): element is TextElement {
  return element.type === 'text';
}

function pickBodyElements(elements: CanvasElement[]): TextElement[] {
  const texts = elements.filter(isTextElement);
  const explicit = texts.filter((element) => element.fieldRole === 'body');
  if (explicit.length > 0) return explicit;

  const inferred = texts.find((element) => element.linked && !element.content)
    ?? texts.find((element) => element.linked)
    ?? [...texts].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return inferred ? [inferred] : [];
}

function withBodyAutoFitDisabled(template: SubtitleTemplate): SubtitleTemplate {
  const cloned = JSON.parse(JSON.stringify(template)) as SubtitleTemplate;
  cloned.variants.forEach((variant) => {
    pickBodyElements(variant.elements).forEach((element) => {
      element.autoFit = false;
      element.autoWidth = false;
      element.autoHeight = false;
    });
  });
  return cloned;
}

export function makeScriptureTemplateSections(
  template: SubtitleTemplate,
  fields: ScriptureTemplateFields,
  options: ScriptureTemplateSectionOptions,
): Section[] {
  const fixedBodyTemplate = withBodyAutoFitDisabled(template);
  const normalizedFields: Record<string, string> = {
    ...fields,
    body: fields.body ?? '',
    reference: fields.reference ?? '',
    verse: fields.verse ?? '',
  };

  return applyBibleTemplate(fixedBodyTemplate, normalizedFields, {
    idPrefix: options.idPrefix,
    label: options.label,
    colorMark: options.colorMark ?? '#ffffff',
    maxCharsPerSlide: options.maxCharsPerSlide,
    splitStrategy: options.splitStrategy,
  });
}
