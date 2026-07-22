/**
 * lib/bible/referenceParser.ts
 *
 * 한국어 성경 참조 표기를 파싱.
 *   "요3:16"       → John 3:16
 *   "창1:1-5"      → Genesis 1:1-5
 *   "롬8:28,31-39" → Romans 8:28, 31-39
 *   "요한복음 3:16" → John 3:16 (전체 이름도 지원)
 *   "시136-21-26"  → Psalms 136:21-26 (콜론 누락 보정)
 *
 * 설계:
 *   1. 앞부분: 한글 책명(단축/전체/혼용) 매칭 → bookId
 *   2. 뒷부분: 숫자 "장:절" 파싱
 *   3. 절 범위: "-" (하이픈), "," (콤마), "~" (물결표)
 *
 * 알려진 단축/전체 이름은 BOOK_ALIASES 에서 확장.
 */

import type { BibleBookMeta, BibleReference } from './types';

// 책명 → id 매핑 (한 책당 여러 표기 허용)
// BOOKS 메타는 { name, abbr } 둘만 가지고 있으므로 확장 별칭을 여기 추가.
const EXTRA_ALIASES: Record<string, string[]> = {
  // 구약 — 주요 축약
  gen: ['창세기', '창세', '창'],
  exo: ['출애굽기', '출애굽', '출'],
  lev: ['레위기', '레'],
  num: ['민수기', '민'],
  deu: ['신명기', '신'],
  jos: ['여호수아', '수'],
  jdg: ['사사기', '삿'],
  rut: ['룻기', '룻'],
  '1sa': ['사무엘상', '삼상'],
  '2sa': ['사무엘하', '삼하'],
  '1ki': ['열왕기상', '왕상'],
  '2ki': ['열왕기하', '왕하'],
  '1ch': ['역대상', '대상'],
  '2ch': ['역대하', '대하'],
  ezr: ['에스라', '스'],
  neh: ['느헤미야', '느'],
  est: ['에스더', '에'],
  job: ['욥기', '욥'],
  psa: ['시편', '시'],
  pro: ['잠언', '잠'],
  ecc: ['전도서', '전'],
  sng: ['아가', '아'],
  isa: ['이사야', '사'],
  jer: ['예레미야', '렘'],
  lam: ['예레미야애가', '애'],
  ezk: ['에스겔', '겔'],
  dan: ['다니엘', '단'],
  hos: ['호세아', '호'],
  jol: ['요엘', '욜'],
  amo: ['아모스', '암'],
  oba: ['오바댜', '옵'],
  jon: ['요나', '욘'],
  mic: ['미가', '미'],
  nam: ['나훔', '나'],
  hab: ['하박국', '합'],
  zep: ['스바냐', '습'],
  hag: ['학개', '학'],
  zec: ['스가랴', '슥'],
  mal: ['말라기', '말'],
  // 신약
  mat: ['마태복음', '마태', '마'],
  mrk: ['마가복음', '마가', '막'],
  luk: ['누가복음', '누가', '눅'],
  jhn: ['요한복음', '요한', '요'],
  act: ['사도행전', '사도', '행'],
  rom: ['로마서', '롬'],
  '1co': ['고린도전서', '고전'],
  '2co': ['고린도후서', '고후'],
  gal: ['갈라디아서', '갈'],
  eph: ['에베소서', '엡'],
  php: ['빌립보서', '빌'],
  col: ['골로새서', '골'],
  '1th': ['데살로니가전서', '살전'],
  '2th': ['데살로니가후서', '살후'],
  '1ti': ['디모데전서', '딤전'],
  '2ti': ['디모데후서', '딤후'],
  tit: ['디도서', '딛'],
  phm: ['빌레몬서', '몬'],
  heb: ['히브리서', '히'],
  jas: ['야고보서', '약'],
  '1pe': ['베드로전서', '벧전'],
  '2pe': ['베드로후서', '벧후'],
  '1jn': ['요한일서', '요일'],
  '2jn': ['요한이서', '요이'],
  '3jn': ['요한삼서', '요삼'],
  jud: ['유다서', '유'],
  rev: ['요한계시록', '계시록', '계'],
};

/**
 * 공백 제거 후 입력을 앞에서부터 훑으면서 가장 긴 책명 매칭을 찾는다.
 * 예: "요한복음3:16" → "요한복음" 매칭 우선 (3 글자 "요한" 보다)
 */
function findBookId(text: string, books: BibleBookMeta[]): { id: string; consumed: number } | null {
  // 모든 별칭을 한번에 모음 (책 id → 후보 배열)
  const candidates: { alias: string; id: string }[] = [];
  for (const book of books) {
    const aliases = new Set<string>([book.name, book.abbr, ...(EXTRA_ALIASES[book.id] ?? [])]);
    for (const a of aliases) candidates.push({ alias: a, id: book.id });
  }
  // 긴 것부터 매칭
  candidates.sort((a, b) => b.alias.length - a.alias.length);
  for (const { alias, id } of candidates) {
    if (text.startsWith(alias)) {
      return { id, consumed: alias.length };
    }
  }
  return null;
}

/**
 * "16-18", "28,31-39" 같은 절 명세를 절 번호 배열로 확장.
 * 숫자 정렬 + 중복 제거.
 */
function parseVerses(spec: string): number[] {
  const out = new Set<number>();
  for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*[-~]\s*(\d+)$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (!isNaN(a) && !isNaN(b) && a <= b) {
        for (let i = a; i <= b; i++) out.add(i);
      }
    } else if (/^\d+$/.test(part)) {
      out.add(parseInt(part, 10));
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * 한국어 성경 참조 파싱.
 * @param input "요3:16" / "창1:1-5" / "요한복음 3:16-18"
 * @param books 현재 버전의 책 메타 목록
 * @returns 파싱 성공 시 BibleReference, 실패 시 null
 */
export function parseReference(input: string, books: BibleBookMeta[]): BibleReference | null {
  if (!input) return null;
  // 입력 현장에서 자주 쓰는 "시편136장21-26절" 표기를 먼저 정리한다.
  //   - 장 뒤에 숫자가 이어질 때만 장을 콜론으로 바꾼다.
  //   - 장절 표기의 마지막 "절"은 제거한다.
  //   - 일반적인 "요3:16"에는 아무 영향이 없다.
  const trimmed = input
    .replace(/\s+/g, '')
    .replace(/장(?=\d)/g, ':')
    .replace(/장$/, '')
    .replace(/절$/, '')
    .trim();
  if (!trimmed) return null;

  const bookMatch = findBookId(trimmed, books);
  if (!bookMatch) return null;

  const rest = trimmed.slice(bookMatch.consumed);
  // "3:16-18" 형태
  const m = rest.match(/^(\d+):(.+)$/);
  // 콜론을 빠뜨린 현장 입력("시136-21-26")은 장-절-절로 보정한다.
  // 두 숫자("시136-21")는 단일 절, 세 숫자("시136-21-26")는 절 범위다.
  const compactVerse = rest.match(/^(\d+)[-~](\d+)(?:[-~](\d+))?$/);
  const chapterText = m?.[1] ?? compactVerse?.[1];
  const verseSpec = m?.[2]
    ?? (compactVerse
      ? compactVerse[3]
        ? `${compactVerse[2]}-${compactVerse[3]}`
        : compactVerse[2]
      : undefined);
  if (!chapterText || !verseSpec) {
    // 장만 있는 경우 "요3" → 3장 전체 (여기선 빈 절 배열로 반환 → 호출자가 해석)
    const chOnly = rest.match(/^(\d+)$/);
    if (chOnly) {
      const book = books.find((b) => b.id === bookMatch.id);
      return {
        bookId: bookMatch.id,
        bookName: book?.name ?? bookMatch.id,
        chapter: parseInt(chOnly[1], 10),
        verses: [],
      };
    }
    return null;
  }

  const chapter = parseInt(chapterText, 10);
  const verses  = parseVerses(verseSpec);
  if (!chapter || verses.length === 0) return null;

  const book = books.find((b) => b.id === bookMatch.id);
  return {
    bookId: bookMatch.id,
    bookName: book?.name ?? bookMatch.id,
    chapter,
    verses,
  };
}

/** 참조 객체를 다시 한국어 표기로 포매팅 ("요 3:16-18") */
export function formatReference(ref: BibleReference, useAbbr = true): string {
  const { bookId, bookName, chapter, verses } = ref;
  // 약어는 별칭 배열의 '마지막' 원소(표준 최단 약어)를 쓴다.
  // [1] 은 3원소 책(사도행전 ['사도행전','사도','행'], 마태복음 ['마태복음','마태','마'] 등)에서
  // 중간 별칭(사도·마태)을 집어 잘못된 약어가 나오던 버그가 있었다.
  const aliases = EXTRA_ALIASES[bookId];
  const display = useAbbr
    ? (aliases && aliases.length ? aliases[aliases.length - 1] : bookName)
    : bookName;
  if (verses.length === 0) return `${display} ${chapter}장`;

  // 연속 구간으로 축약 (16,17,18,20,21 → "16-18,20-21")
  const parts: string[] = [];
  let start = verses[0];
  let prev = start;
  for (let i = 1; i < verses.length; i++) {
    const v = verses[i];
    if (v === prev + 1) {
      prev = v;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = v;
    prev = v;
  }
  parts.push(start === prev ? `${start}` : `${start}-${prev}`);
  return `${display} ${chapter}:${parts.join(',')}`;
}
