/**
 * src/parser/spokenAdapter.js
 *
 * 구어체(음성인식 출력) → 표준 성경 참조 변환.
 *
 * 기존 referenceParser.ts 는 "시편136장21-26절" 같은 *타이핑* 입력용이라
 * 설교 발화를 그대로 받지 못한다. 이 어댑터가 앞단에서 흡수한다.
 *
 * 2026-07-26 설교 전사본에서 실제로 관찰된 패턴만 다룬다:
 *   "요한복음 13장 31절에서부터 우리에 38절 말씀까지"  → jhn 13:31-38
 *   "13장 장 1절에"                                  → 13:1   (STT 중복 '장')
 *   "요한일서 4장 7절에 9절에"                        → 1jn 4:7-9
 *   "요한 1서 우리 5장 3절"                           → 1jn 5:3 (군더더기 '우리')
 *   "요한복음 아 고린도서 13장"                        → 1co 13 (자기정정)
 *   "38절을 보십시오"                                 → (문맥) :38
 *   "6절에"                                          → (문맥) :6
 */

import { buildAliasIndex } from './books.js';

const ALIAS_INDEX = buildAliasIndex();

const HANGUL = /[가-힣]/;

/* ── 자모 분해 + 근사 매칭 ─────────────────────────────
 * STT 는 책 이름을 발음이 비슷한 글자로 잘못 쓴다.
 *   2026-07-12  "열왕기아" (실제: 열왕기하)
 * 한국어 오인식은 음소 단위로 어긋나므로 자모로 풀어 비교한다.
 *   열왕기아 vs 열왕기하 → ㅇ/ㅎ 하나 차이(1)
 *   열왕기아 vs 열왕기상 → 자모 2개 차이 → 더 멀다
 */
function toJamo(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) { out += ch; continue; }
    out += String.fromCharCode(0x1100 + Math.floor(c / 588));
    out += String.fromCharCode(0x1161 + Math.floor((c % 588) / 28));
    const t = c % 28;
    if (t) out += String.fromCharCode(0x11a7 + t);
  }
  return out;
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/** 오인식된 책 이름을 근사 매칭. 유일한 최적 후보만 인정한다. */
function fuzzyBook(token) {
  if (!token || token.length < 3) return null;
  const t = toJamo(token);
  let best = null, bestD = Infinity, tie = false;
  for (const { alias, id } of ALIAS_INDEX) {
    if (alias.length < 3) continue;
    const d = editDistance(t, toJamo(alias));
    if (d < bestD) { bestD = d; best = { id, alias }; tie = false; }
    else if (d === bestD) tie = true;
  }
  if (!best || tie || bestD > 2) return null;
  return { ...best, distance: bestD };
}

function toNumber(s) {
  return /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
}

/* ── 한글 수사 (책 이름 뒤에서만) ───────────────────────────────────────────
 *
 * 원래는 전면 미지원이었다. 근거는 유효했다 —
 *   "대제사장"  → 사(4) + 장 → 4장
 *   "성경 구절"  → 구(9) + 절 → 9절
 * 일상 한국어와 충돌이 커서 무조건 변환하면 오검출이 터진다.
 *
 * 그런데 2026-07-28 Apple Speech 실측에서 전제가 깨졌다.
 *   정답 롬 5:8  →  STT "그래서 로마 스 오장 팔 절에는…"  →  미검출
 * 유튜브 자동자막(픽스처)은 숫자로 쓰지만 Apple 온디바이스는 한글 수사로 쓴다.
 * 엔진이 바뀌면 전제도 바뀐다.
 *
 * 그래서 무조건 변환이 아니라 **책 이름 바로 뒤 구간에서만** 변환한다.
 *   "로마서 오장 팔절"  → 앞에 책 이름 → 변환      → rom 5:8
 *   "성경 구절" · "대제사장" → 앞에 책 이름 없음 → 변환 안 함 (오검출 방지)
 * 추가로 '장/절' 뒤가 조사·경계가 아니면(예: "사장님") 단어의 일부로 보고 건너뛴다.
 */
const SINO = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };

/** 한자어 수사 → 숫자. 시편 176절(백칠십육)까지 커버. 형식이 아니면 NaN */
export function sinoToNumber(str) {
  let total = 0;
  let cur = 0;
  let seen = false;
  for (const ch of str) {
    if (SINO[ch]) { cur = SINO[ch]; seen = true; }
    else if (ch === '십') { total += (cur || 1) * 10; cur = 0; seen = true; }
    else if (ch === '백') { total += (cur || 1) * 100; cur = 0; seen = true; }
    else return NaN;
  }
  return seen ? total + cur : NaN;
}

// '장/절' 뒤에 올 수 있는 것 — 조사이거나 경계여야 한다. "사장님"의 '님'은 불가.
const AFTER_MARKER_OK = /^(?:\s|$|[.,!?"')\]]|은|는|이|가|을|를|에|의|와|과|도|만|부터|까지|에서|에는|에도|이라|이며|말씀)/;
const SINO_MARKER_RE = /([일이삼사오육칠팔구십백]{1,5})\s*(장|절|편)/g;

/** 책 이름 뒤 구간에서만 한글 수사를 숫자로 바꾼다. */
function convertSinoNumerals(text) {
  if (!SINO_MARKER_RE.test(text)) { SINO_MARKER_RE.lastIndex = 0; return text; }
  SINO_MARKER_RE.lastIndex = 0;

  // 변환을 허용할 구간 — 2글자 이상 책 별칭이 나온 지점부터 앞으로 40자.
  //   (1글자 별칭은 일상어 충돌이 커서 앵커로 쓰지 않는다)
  const zones = [];
  for (const { alias } of ALIAS_INDEX) {
    if (alias.length < 2) continue;
    let from = 0;
    for (;;) {
      const i = text.indexOf(alias, from);
      if (i < 0) break;
      from = i + 1;
      if (text[i - 1] && HANGUL.test(text[i - 1])) continue; // 다른 단어의 일부
      zones.push([i + alias.length, i + alias.length + 40]);
    }
  }
  if (!zones.length) return text;
  const inZone = (pos) => zones.some(([s, e]) => pos >= s && pos <= e);

  let out = '';
  let last = 0;
  let m;
  while ((m = SINO_MARKER_RE.exec(text))) {
    const num = sinoToNumber(m[1]);
    const after = text.slice(m.index + m[0].length);
    if (!Number.isFinite(num) || num <= 0 || !inZone(m.index) || !AFTER_MARKER_OK.test(after)) continue;
    out += text.slice(last, m.index) + num + m[2];
    last = m.index + m[0].length;
  }
  return last === 0 ? text : out + text.slice(last);
}

/* ── STT 띄어쓰기 오인식 복구 ───────────────────────────────────────────────
 * Apple Speech 실측: "로마서" → "로마 스".
 * 그대로 두면 1글자 별칭 '스'(에스라)가 매칭돼 **에스라 5:8** 로 오검출된다.
 * 공백을 접은 형태가 책 이름에 자모 거리 1 이내로 근접하면 붙여준다.
 * 뒤에 장/절 표지가 있을 때만 시도해 일상어 오작동을 막는다.
 */
function repairBookSpacing(text) {
  return text.replace(/([가-힣]{2,4})\s+([가-힣]{1,3})(?=\s*[0-9일이삼사오육칠팔구십백]{1,5}\s*(?:장|절|편))/g,
    (whole, a, b) => {
      const joined = a + b;
      if (joined.length < 3) return whole;
      const t = toJamo(joined);
      let best = null, bestD = Infinity, tie = false;
      for (const { alias } of ALIAS_INDEX) {
        if (alias.length < 3) continue;
        const d = editDistance(t, toJamo(alias));
        if (d < bestD) { bestD = d; best = alias; tie = false; }
        else if (d === bestD) tie = true;
      }
      // 이미 정확한 별칭이면 건드리지 않는다. 애매하면(동점) 포기.
      return !best || tie || bestD > 1 ? whole : joined;
    });
}

/**
 * 발화 정규화.
 * - 공백 정리
 * - STT 중복 '장 장' → '장'
 * - 숫자 사이 군더더기 조사 제거는 하지 않는다(위치 정보가 필요하므로 파싱 단계에서 처리)
 */
export function normalize(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/장\s*장/g, '장')
    .trim();
}

/**
 * 텍스트에서 책 이름 출현 위치를 찾는다.
 * 1글자 별칭(요·마·시…)은 일상어와 충돌하므로
 * "뒤에 숫자가 따라올 때"만 인정한다.  예) "뭐요?" 는 요한복음이 아니다.
 */
function findBooks(text) {
  const hits = [];
  for (const { alias, id } of ALIAS_INDEX) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(alias, from);
      if (i < 0) break;
      from = i + 1;

      const prev = text[i - 1];
      const after = text.slice(i + alias.length, i + alias.length + 6);

      // 앞 글자가 한글이면 다른 단어의 일부일 가능성이 높다
      if (prev && HANGUL.test(prev)) continue;

      if (alias.length === 1) {
        // 1글자 별칭: 곧바로 숫자가 와야 인정
        if (!/^\s?\d/.test(after)) continue;
      } else {
        // 2글자 이상: 군더더기 한두 단어까지 허용하되 숫자가 나와야 함
        if (!/\d/.test(text.slice(i + alias.length, i + alias.length + 14))) continue;
      }
      hits.push({ id, alias, start: i, end: i + alias.length });
    }
  }
  // 위치순 정렬 후, 겹치는 매치는 더 긴 별칭 우선
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  for (const h of hits) {
    if (out.length && h.start < out[out.length - 1].end) continue;
    out.push(h);
  }

  // 정확히 못 찾은 "N장" 앞의 낱말을 근사 매칭한다. (STT 책이름 오인식 보정)
  const chapRe = /([가-힣]{2,6})\s*(\d+)\s*장/g;
  let cm;
  while ((cm = chapRe.exec(text))) {
    const wordStart = cm.index;
    const covered = out.some((b) => wordStart < b.end && cm.index + cm[0].length > b.start);
    if (covered) continue;
    const fz = fuzzyBook(cm[1]);
    if (!fz) continue;
    out.push({ id: fz.id, alias: cm[1], start: wordStart, end: wordStart + cm[1].length, fuzzy: fz.distance });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * "N장" / "N절" 토큰 추출.
 * 시편만 장 대신 "편"을 쓴다 ("시편 23편 3절"). 다른 책에서 "N편"은
 * "영화 한 편" 같은 일상어이므로, 문장에 '시편'이 있을 때만 장으로 인정한다.
 */
function findMarkers(text) {
  const out = [];
  const allowPyeon = text.includes('시편');
  const re = /([0-9]+)\s*(장|절|편)/g;
  let m;
  while ((m = re.exec(text))) {
    const n = toNumber(m[1]);
    if (!Number.isFinite(n) || n <= 0) continue;
    let kind = m[2];
    if (kind === '편') {
      if (!allowPyeon) continue;
      kind = '장';
    }
    out.push({ kind, num: n, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * 발화 1건을 파싱한다.
 * @returns {Array<{bookId:string|null, chapter:number|null, verses:number[], raw:string, at:number}>}
 */
export function parseSpoken(rawText) {
  // 전처리 2단계 — 파서 본체는 건드리지 않는다.
  //   ① 띄어쓰기 오인식 복구 ("로마 스" → "로마서")  ② 책 이름 뒤 한글 수사 → 숫자
  //   둘 다 조건이 안 맞으면 원문 그대로 통과하므로 기존 동작은 변하지 않는다.
  const text = convertSinoNumerals(repairBookSpacing(normalize(rawText)));
  const books = findBooks(text);
  const marks = findMarkers(text);
  if (!marks.length && !books.length) return [];

  // 자기정정: 숫자 없이 책 이름이 연속으로 나오면 뒤엣것이 이긴다
  //   "요한복음 아 고린도서 13장" → 고린도서
  const merged = [];
  for (const b of books) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const between = text.slice(prev.end, b.start);
      if (!/\d/.test(between) && between.length <= 12) {
        merged[merged.length - 1] = { ...b, corrected: prev.id };
        continue;
      }
    }
    merged.push(b);
  }

  const results = [];
  let cursor = 0;

  for (let i = 0; i < merged.length; i++) {
    const b = merged[i];
    const limit = i + 1 < merged.length ? merged[i + 1].start : text.length;
    const own = marks.filter((m) => m.start >= b.end && m.start < limit);
    cursor = Math.max(cursor, limit);
    results.push(buildRef(b, own, text, rawText));
  }

  // 책 이름 없이 등장한 장/절 (문맥 의존) — 첫 책 앞쪽 구간
  const orphan = marks.filter(
    (m) => !merged.some((b) => m.start >= b.end && m.start < text.length && m.start > b.start),
  );
  if (!merged.length && orphan.length) {
    results.push(buildRef(null, orphan, text, rawText));
  }

  return results.filter(Boolean);
}

function buildRef(book, marks, text, rawText) {
  if (!book && !marks.length) return null;

  const chapters = marks.filter((m) => m.kind === '장').map((m) => m.num);
  const verses = marks.filter((m) => m.kind === '절').map((m) => m.num);

  let verseList = [];
  if (verses.length === 1) {
    verseList = [verses[0]];
  } else if (verses.length >= 2) {
    // "31절에서 38절까지" / "7절에 9절에"  → 범위
    // "31절, 32절" / "8절 그리고 15절"      → 열거
    //
    // 범위 여부는 "에서·부터·까지" 같은 표현으로만 판단한다.
    // 번호가 떨어져 있다고 범위로 간주하면 "8절 그리고 15절"이
    // 8~15절 여덟 개로 부풀어 엉뚱한 본문이 나간다.
    const first = marks.find((m) => m.kind === '절');
    const second = marks.filter((m) => m.kind === '절')[1];
    const gap = text.slice(first.end, second.start);
    const isRange = /에서|부터|까지|~|-|에\s*$/.test(gap);
    if (isRange) {
      const a = Math.min(verses[0], verses[1]);
      const b = Math.max(verses[0], verses[1]);
      for (let v = a; v <= b; v++) verseList.push(v);
    } else {
      verseList = [...new Set(verses)].sort((x, y) => x - y);
    }
  }

  return {
    bookId: book ? book.id : null,
    corrected: book && book.corrected ? book.corrected : null,
    chapter: chapters.length ? chapters[0] : null,
    verses: verseList,
    raw: rawText.trim(),
  };
}
