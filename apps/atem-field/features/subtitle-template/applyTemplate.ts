// 콘텐츠(필드 값 묶음)를 템플릿에 역할 기반으로 주입해 섹션을 만드는 단일 순수함수

import type { CanvasElement, TextElement } from '@/lib/canvasTypes';
import type { Section } from '@/lib/types';
import type { ContentUnit, SubtitleTemplate, TemplateVariant } from './model';

export interface ApplyOptions {
  /** 생성 섹션의 id(그리고 요소 id 접두사). 자동 분할 시 `${idPrefix}-s{n}`. */
  idPrefix: string;
  label?: string;
  colorMark?: string;
  /** 변형 선택. 없으면 content.variantHint → 첫 변형 순. */
  variantId?: string;
  /** 본문이 이 글자 수를 넘으면 여러 섹션으로 자동 분할. 0/미지정이면 분할 안 함. */
  maxCharsPerSlide?: number;
}

function isText(el: CanvasElement): el is TextElement {
  return el.type === 'text';
}

function pickVariant(
  template: SubtitleTemplate,
  content: ContentUnit,
  opts: ApplyOptions,
): TemplateVariant | undefined {
  const wanted = opts.variantId ?? content.variantHint;
  if (wanted) {
    const found = template.variants.find((v) => v.id === wanted);
    if (found) return found;
  }
  return template.variants[0];
}

/**
 * fieldRole 태그가 없는 레거시/에디터 템플릿에서 '본문'을 받을 요소를 추론한다.
 * 우선순위: 비어있는 linked 텍스트 → 아무 linked 텍스트 → 가장 큰 텍스트.
 */
function inferPrimaryBodyId(texts: TextElement[]): string | undefined {
  const linkedEmpty = texts.find((t) => t.linked && !t.content);
  if (linkedEmpty) return linkedEmpty.id;
  const anyLinked = texts.find((t) => t.linked);
  if (anyLinked) return anyLinked.id;
  const largest = [...texts].sort(
    (a, b) => b.width * b.height - a.width * a.height,
  )[0];
  return largest?.id;
}

/**
 * 긴 본문을 슬라이드당 최대 글자 수에 맞춰 나눈다.
 * 줄(\n) → 단어 경계 순으로 자연스럽게 끊고, 한 단어가 한도보다 길면 강제로 자른다.
 */
export function splitBody(text: string, maxChars: number): string[] {
  if (!text || maxChars <= 0 || text.length <= maxChars) return [text];

  const result: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) result.push(cur.trim());
    cur = '';
  };

  for (const para of text.split('\n')) {
    // 현재 청크에 문단을 통째로 붙일 수 있으면 붙인다.
    if ((cur ? cur.length + 1 : 0) + para.length <= maxChars) {
      cur = cur ? `${cur}\n${para}` : para;
      continue;
    }
    flush();
    if (para.length <= maxChars) {
      cur = para;
      continue;
    }
    // 문단 자체가 한도 초과 → 단어 경계로 쪼갠다.
    let line = '';
    for (const token of para.split(/(\s+)/)) {
      if ((line + token).length <= maxChars) {
        line += token;
        continue;
      }
      if (line.trim()) result.push(line.trim());
      line = '';
      if (token.length > maxChars) {
        let rest = token;
        while (rest.length > maxChars) {
          result.push(rest.slice(0, maxChars));
          rest = rest.slice(maxChars);
        }
        line = rest;
      } else {
        line = token;
      }
    }
    if (line.trim()) cur = line.trim();
  }
  flush();

  return result.length ? result : [text];
}

function cloneEl(el: CanvasElement): CanvasElement {
  return JSON.parse(JSON.stringify(el)) as CanvasElement;
}

/** 한 슬라이드(섹션)를 만든다 — 역할 바인딩 + 본문 추론 + id/clipMask 재매핑. */
function buildSection(
  source: CanvasElement[],
  fields: Partial<Record<string, string>>,
  idPrefix: string,
  label: string,
  colorMark: string,
): Section {
  const texts = source.filter(isText);
  const hasExplicitBody = texts.some((t) => t.fieldRole === 'body');
  const primaryBodyId =
    !hasExplicitBody && fields.body != null ? inferPrimaryBodyId(texts) : undefined;

  const idMap = new Map<string, string>();
  source.forEach((el, i) => idMap.set(el.id, `${idPrefix}__${i}`));

  const elements: CanvasElement[] = source.map((el, i) => {
    const cloned = cloneEl(el);
    cloned.id = `${idPrefix}__${i}`;
    if (cloned.clipMaskId && idMap.has(cloned.clipMaskId)) {
      cloned.clipMaskId = idMap.get(cloned.clipMaskId);
    }

    if (!isText(cloned)) return cloned;

    const role = (el as TextElement).fieldRole;

    if (role) {
      const value = fields[role];
      if (value != null && value !== '') {
        cloned.content = value;
        cloned.linked = false;
      } else {
        cloned.content = '';
        cloned.linked = false;
        cloned.visible = false;
      }
    } else if (el.id === primaryBodyId) {
      cloned.content = fields.body ?? '';
      cloned.linked = false;
    } else {
      cloned.linked = false;
    }

    return cloned;
  });

  return {
    id: idPrefix,
    label,
    text: fields.body ?? '',
    colorMark,
    elements,
  };
}

/**
 * 콘텐츠 1단위를 템플릿에 적용해 섹션을 만든다(순수함수, 결정적).
 * 본문이 maxCharsPerSlide 를 넘으면 여러 섹션으로 자동 분할한다.
 */
export function applyTemplate(
  template: SubtitleTemplate,
  content: ContentUnit,
  opts: ApplyOptions,
): Section[] {
  const variant = pickVariant(template, content, opts);
  const source = variant?.elements ?? [];
  const baseFields = content.fields;
  const colorMark = opts.colorMark ?? '#ffffff';

  const bodyText = baseFields.body ?? '';
  const maxChars = opts.maxCharsPerSlide ?? 0;
  const chunks = maxChars > 0 ? splitBody(bodyText, maxChars) : [bodyText];

  return chunks.map((chunk, si) => {
    const multi = chunks.length > 1;
    const fields = multi ? { ...baseFields, body: chunk } : baseFields;
    const idPrefix = multi ? `${opts.idPrefix}-s${si + 1}` : opts.idPrefix;
    const label =
      multi && opts.label
        ? `${opts.label} (${si + 1}/${chunks.length})`
        : opts.label ?? '';
    return buildSection(source, fields, idPrefix, label, colorMark);
  });
}
