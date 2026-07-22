#!/usr/bin/env node
/**
 * scripts/build-bible-data.mjs
 *
 * data/bibles/krv-raw.json (bluesaurel/Korean-Bible-1961-KRV 에서 받은 원본)
 *  → data/bibles/krv.json (정경 순서로 재배치, 한국어 책명 + 단축명 포함)
 *
 * 사용:  node scripts/build-bible-data.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const RAW_FILE  = path.join(ROOT, 'data', 'bibles', 'krv-raw.json');
const OUT_FILE  = path.join(ROOT, 'data', 'bibles', 'krv.json');
const META_FILE = path.join(ROOT, 'data', 'bibles', 'meta.json');

// ── 정경 66권 순서 + 한국어 이름/단축명 ──
// num: 전통 성경 순서 (1~66)
// id: 코드 (영문 소문자 3~4자, 원본 JSON 의 book 필드와 매핑용)
// 원본의 book 필드는 영어 (Genesis, Exodus, ...) 또는 "1Chronicles" 같은 형식
const BOOKS = [
  // 구약 (1~39)
  { num: 1,  id: 'gen', raw: 'Genesis',         name: '창세기',       abbr: '창', testament: 'ot' },
  { num: 2,  id: 'exo', raw: 'Exodus',          name: '출애굽기',     abbr: '출', testament: 'ot' },
  { num: 3,  id: 'lev', raw: 'Leviticus',       name: '레위기',       abbr: '레', testament: 'ot' },
  { num: 4,  id: 'num', raw: 'Numbers',         name: '민수기',       abbr: '민', testament: 'ot' },
  { num: 5,  id: 'deu', raw: 'Deuteronomy',     name: '신명기',       abbr: '신', testament: 'ot' },
  { num: 6,  id: 'jos', raw: 'Joshua',          name: '여호수아',     abbr: '수', testament: 'ot' },
  { num: 7,  id: 'jdg', raw: 'Judges',          name: '사사기',       abbr: '삿', testament: 'ot' },
  { num: 8,  id: 'rut', raw: 'Ruth',            name: '룻기',         abbr: '룻', testament: 'ot' },
  { num: 9,  id: '1sa', raw: '1Samuel',         name: '사무엘상',     abbr: '삼상', testament: 'ot' },
  { num: 10, id: '2sa', raw: '2Samuel',         name: '사무엘하',     abbr: '삼하', testament: 'ot' },
  { num: 11, id: '1ki', raw: '1Kings',          name: '열왕기상',     abbr: '왕상', testament: 'ot' },
  { num: 12, id: '2ki', raw: '2Kings',          name: '열왕기하',     abbr: '왕하', testament: 'ot' },
  { num: 13, id: '1ch', raw: '1Chronicles',     name: '역대상',       abbr: '대상', testament: 'ot' },
  { num: 14, id: '2ch', raw: '2Chronicles',     name: '역대하',       abbr: '대하', testament: 'ot' },
  { num: 15, id: 'ezr', raw: 'Ezra',            name: '에스라',       abbr: '스', testament: 'ot' },
  { num: 16, id: 'neh', raw: 'Nehemiah',        name: '느헤미야',     abbr: '느', testament: 'ot' },
  { num: 17, id: 'est', raw: 'Esther',          name: '에스더',       abbr: '에', testament: 'ot' },
  { num: 18, id: 'job', raw: 'Job',             name: '욥기',         abbr: '욥', testament: 'ot' },
  { num: 19, id: 'psa', raw: 'Psalms',          name: '시편',         abbr: '시', testament: 'ot' },
  { num: 20, id: 'pro', raw: 'Proverbs',        name: '잠언',         abbr: '잠', testament: 'ot' },
  { num: 21, id: 'ecc', raw: 'Ecclesiastes',    name: '전도서',       abbr: '전', testament: 'ot' },
  { num: 22, id: 'sng', raw: 'SongofSolomon',   name: '아가',         abbr: '아', testament: 'ot' },
  { num: 23, id: 'isa', raw: 'Isaiah',          name: '이사야',       abbr: '사', testament: 'ot' },
  { num: 24, id: 'jer', raw: 'Jeremiah',        name: '예레미야',     abbr: '렘', testament: 'ot' },
  { num: 25, id: 'lam', raw: 'Lamentations',    name: '예레미야애가', abbr: '애', testament: 'ot' },
  { num: 26, id: 'ezk', raw: 'Ezekiel',         name: '에스겔',       abbr: '겔', testament: 'ot' },
  { num: 27, id: 'dan', raw: 'Daniel',          name: '다니엘',       abbr: '단', testament: 'ot' },
  { num: 28, id: 'hos', raw: 'Hosea',           name: '호세아',       abbr: '호', testament: 'ot' },
  { num: 29, id: 'jol', raw: 'Joel',            name: '요엘',         abbr: '욜', testament: 'ot' },
  { num: 30, id: 'amo', raw: 'Amos',            name: '아모스',       abbr: '암', testament: 'ot' },
  { num: 31, id: 'oba', raw: 'Obadiah',         name: '오바댜',       abbr: '옵', testament: 'ot' },
  { num: 32, id: 'jon', raw: 'Jonah',           name: '요나',         abbr: '욘', testament: 'ot' },
  { num: 33, id: 'mic', raw: 'Micah',           name: '미가',         abbr: '미', testament: 'ot' },
  { num: 34, id: 'nam', raw: 'Nahum',           name: '나훔',         abbr: '나', testament: 'ot' },
  { num: 35, id: 'hab', raw: 'Habakkuk',        name: '하박국',       abbr: '합', testament: 'ot' },
  { num: 36, id: 'zep', raw: 'Zephaniah',       name: '스바냐',       abbr: '습', testament: 'ot' },
  { num: 37, id: 'hag', raw: 'Haggai',          name: '학개',         abbr: '학', testament: 'ot' },
  { num: 38, id: 'zec', raw: 'Zechariah',       name: '스가랴',       abbr: '슥', testament: 'ot' },
  { num: 39, id: 'mal', raw: 'Malachi',         name: '말라기',       abbr: '말', testament: 'ot' },
  // 신약 (40~66)
  { num: 40, id: 'mat', raw: 'Matthew',         name: '마태복음',     abbr: '마', testament: 'nt' },
  { num: 41, id: 'mrk', raw: 'Mark',            name: '마가복음',     abbr: '막', testament: 'nt' },
  { num: 42, id: 'luk', raw: 'Luke',            name: '누가복음',     abbr: '눅', testament: 'nt' },
  { num: 43, id: 'jhn', raw: 'John',            name: '요한복음',     abbr: '요', testament: 'nt' },
  { num: 44, id: 'act', raw: 'Acts',            name: '사도행전',     abbr: '행', testament: 'nt' },
  { num: 45, id: 'rom', raw: 'Romans',          name: '로마서',       abbr: '롬', testament: 'nt' },
  { num: 46, id: '1co', raw: '1Corinthians',    name: '고린도전서',   abbr: '고전', testament: 'nt' },
  { num: 47, id: '2co', raw: '2Corinthians',    name: '고린도후서',   abbr: '고후', testament: 'nt' },
  { num: 48, id: 'gal', raw: 'Galatians',       name: '갈라디아서',   abbr: '갈', testament: 'nt' },
  { num: 49, id: 'eph', raw: 'Ephesians',       name: '에베소서',     abbr: '엡', testament: 'nt' },
  { num: 50, id: 'php', raw: 'Philippians',     name: '빌립보서',     abbr: '빌', testament: 'nt' },
  { num: 51, id: 'col', raw: 'Colossians',      name: '골로새서',     abbr: '골', testament: 'nt' },
  { num: 52, id: '1th', raw: '1Thessalonians',  name: '데살로니가전서', abbr: '살전', testament: 'nt' },
  { num: 53, id: '2th', raw: '2Thessalonians',  name: '데살로니가후서', abbr: '살후', testament: 'nt' },
  { num: 54, id: '1ti', raw: '1Timothy',        name: '디모데전서',   abbr: '딤전', testament: 'nt' },
  { num: 55, id: '2ti', raw: '2Timothy',        name: '디모데후서',   abbr: '딤후', testament: 'nt' },
  { num: 56, id: 'tit', raw: 'Titus',           name: '디도서',       abbr: '딛', testament: 'nt' },
  { num: 57, id: 'phm', raw: 'Philemon',        name: '빌레몬서',     abbr: '몬', testament: 'nt' },
  { num: 58, id: 'heb', raw: 'Hebrews',         name: '히브리서',     abbr: '히', testament: 'nt' },
  { num: 59, id: 'jas', raw: 'James',           name: '야고보서',     abbr: '약', testament: 'nt' },
  { num: 60, id: '1pe', raw: '1Peter',          name: '베드로전서',   abbr: '벧전', testament: 'nt' },
  { num: 61, id: '2pe', raw: '2Peter',          name: '베드로후서',   abbr: '벧후', testament: 'nt' },
  { num: 62, id: '1jn', raw: '1John',           name: '요한일서',     abbr: '요일', testament: 'nt' },
  { num: 63, id: '2jn', raw: '2John',           name: '요한이서',     abbr: '요이', testament: 'nt' },
  { num: 64, id: '3jn', raw: '3John',           name: '요한삼서',     abbr: '요삼', testament: 'nt' },
  { num: 65, id: 'jud', raw: 'Jude',            name: '유다서',       abbr: '유', testament: 'nt' },
  { num: 66, id: 'rev', raw: 'Revelation',      name: '요한계시록',   abbr: '계', testament: 'nt' },
];

// ── 원본 로드 ──
const raw = JSON.parse(fs.readFileSync(RAW_FILE, 'utf-8'));
const rawByName = new Map(raw.map((b) => [b.book, b]));

// 원본의 raw name 들 확인용 (이상 없는지 출력)
console.log(`[build-bible] 원본 책 수: ${raw.length}`);

// 원본 파일이 쓰는 실제 book 문자열을 일부 샘플
const rawSamples = raw.slice(0, 5).map((b) => b.book);
console.log(`[build-bible] 원본 book 이름 샘플: ${rawSamples.join(', ')}`);

// ── 정경 순서로 재배치 + 한국어 메타 주입 ──
const canonical = [];
const missing = [];
for (const meta of BOOKS) {
  const src = rawByName.get(meta.raw);
  if (!src) {
    missing.push(meta.raw);
    continue;
  }
  canonical.push({
    num:       meta.num,
    id:        meta.id,
    name:      meta.name,
    abbr:      meta.abbr,
    testament: meta.testament,
    chapters: src.chapters.map((ch) => ({
      num:    ch.chapter,
      verses: ch.verses.map((v) => ({ num: v.verse, text: v.text })),
    })),
  });
}

if (missing.length > 0) {
  console.error(`[build-bible] ⚠️  원본에서 찾지 못한 책: ${missing.join(', ')}`);
  console.error(`[build-bible] 원본이 사용하는 실제 책 이름들:`);
  console.error(raw.map((b) => b.book).join(', '));
  process.exit(1);
}

// ── 저장 ──
const out = {
  version: {
    id: 'krv',
    name: '개역한글',
    year: 1961,
    copyright: 'Public Domain (대한민국 대법원 2013 2011다77313 판결)',
    source: 'https://github.com/bluesaurel/Korean-Bible-1961-KRV',
  },
  books: canonical,
};

fs.writeFileSync(OUT_FILE, JSON.stringify(out), 'utf-8');
const outSize = fs.statSync(OUT_FILE).size;
console.log(`[build-bible] ✅ ${OUT_FILE} (${(outSize / 1024 / 1024).toFixed(2)} MB)`);

// 메타 전용 파일 (책 목록만, UI 초기 로드용 — 텍스트 없음)
const meta = {
  version: out.version,
  books: canonical.map((b) => ({
    num: b.num, id: b.id, name: b.name, abbr: b.abbr, testament: b.testament,
    chapterCount: b.chapters.length,
  })),
};
fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
console.log(`[build-bible] ✅ ${META_FILE}`);

console.log(`[build-bible] 완료. 총 ${canonical.length} 권, ${canonical.reduce((s, b) => s + b.chapters.length, 0)} 장, ${canonical.reduce((s, b) => s + b.chapters.reduce((s2, c) => s2 + c.verses.length, 0), 0)} 절`);
