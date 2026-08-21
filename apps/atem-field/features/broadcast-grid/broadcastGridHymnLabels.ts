// 송출그리드 찬송가 타일의 절 라벨 — 절과 후렴을 가려낸다.
//
// 절 배지는 "가사 템플릿으로 만든 찬송가"에만 붙인다. 악보 PPT 프로그램은 라벨이
// 01~12 인 슬라이드 순번이라 절과 무관하고, 악보 이미지에 절이 이미 인쇄돼 있다.

import type { Section } from '@/lib/types';
import type { TextElement } from '@/lib/canvasTypes';

/** 라벨을 절 표기로 다듬는다. 절로 볼 수 없으면 null. */
export function normalizeHymnVerseLabel(value: string): string | null {
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (/^후렴$/i.test(cleaned)) return '후렴';

  const verseMatch = cleaned.match(/^(\d{1,2})\s*절$/);
  if (verseMatch) return `${verseMatch[1]}절`;

  const bareNumberMatch = cleaned.match(/^(\d{1,2})$/);
  if (bareNumberMatch) return `${bareNumberMatch[1]}절`;

  return null;
}

/** verseLabel 슬롯을 먼저 보고, 없으면 섹션 라벨로 판단한다. */
export function resolveHymnVerseLabel(section: Section): string | null {
  const verseSlot = (section.elements ?? []).find(
    (element): element is TextElement =>
      element.type === 'text' &&
      element.visible !== false &&
      element.fieldRole === 'verseLabel' &&
      Boolean(element.content?.trim()),
  );
  const fromSlot = verseSlot ? normalizeHymnVerseLabel(verseSlot.content) : null;
  if (fromSlot) return fromSlot;

  return normalizeHymnVerseLabel(section.label);
}

function getSectionBodyText(section: Section): string {
  const fromText = section.text?.trim();
  if (fromText) return fromText;

  const body = (section.elements ?? []).find(
    (element): element is TextElement =>
      element.type === 'text' &&
      element.visible !== false &&
      element.fieldRole === 'body' &&
      Boolean(element.content?.trim()),
  );
  return body?.content?.trim() ?? '';
}

export interface HymnRefrainSourceEntry {
  itemId: string;
  section: Section;
}

/**
 * 후렴 섹션의 id 집합. 프로그램(itemId)마다 따로 판정한다.
 *
 * 찬송가 데이터에는 후렴 표시가 따로 없고 라벨에 절 번호만 들어 있다.
 * 그래서 후렴이 '1절','2절',… 로 잘못 표시됐다.
 * 후렴은 절마다 똑같이 되풀이되므로, **모든 절 그룹에 빠짐없이 나오는 가사**를
 * 후렴으로 본다.
 *
 * '두 개 이상의 절에 나오면 후렴'으로 잡으면 354장처럼 1절과 4절의 가사가 같은
 * 곡에서 절을 후렴으로 오인한다. 그래서 '모든 절'로 좁혔다.
 * 데이터에 후렴이 한 절에서 빠져 있으면 검출되지 않고 지금처럼 절 번호가 나온다 —
 * 틀리게 '후렴'이라 우기는 것보다 낫다.
 */
export function findHymnRefrainSectionIds(
  entries: ReadonlyArray<HymnRefrainSourceEntry>,
): Set<string> {
  const byItem = new Map<string, HymnRefrainSourceEntry[]>();
  for (const entry of entries) {
    const list = byItem.get(entry.itemId);
    if (list) list.push(entry);
    else byItem.set(entry.itemId, [entry]);
  }

  const refrainIds = new Set<string>();

  for (const group of byItem.values()) {
    const verseByBody = new Map<string, Set<string>>();
    const verses = new Set<string>();

    for (const { section } of group) {
      const verse = normalizeHymnVerseLabel(section.label);
      // 제목 섹션 등 절이 아닌 라벨과 이미 '후렴'인 것은 판정 대상이 아니다.
      if (!verse || verse === '후렴') continue;
      verses.add(verse);

      const body = getSectionBodyText(section);
      if (!body) continue;
      const seen = verseByBody.get(body);
      if (seen) seen.add(verse);
      else verseByBody.set(body, new Set([verse]));
    }

    if (verses.size < 2) continue;

    for (const { section } of group) {
      const body = getSectionBodyText(section);
      if (!body) continue;
      if (verseByBody.get(body)?.size === verses.size) refrainIds.add(section.id);
    }
  }

  return refrainIds;
}
