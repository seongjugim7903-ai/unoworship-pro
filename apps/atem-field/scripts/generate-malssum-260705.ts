// 성경 7구절 → 템플릿(성경-인용-001) 적용 → 한 프로그램(SetlistItem) → SavedProgram JSON 생성.
//   워십서버(data/programs)에 넣어 좌측 ServerWorshipLoader 에서 "말씀찾기-260705" 로 다운로드 가능.
//   실행: (dev서버 3000 켜진 상태에서) npx tsx scripts/generate-malssum-260705.ts
import fs from 'fs';
import path from 'path';
import { applyTemplate } from '../features/subtitle-template/applyTemplate';
import type { Section } from '../lib/types';

const PROJECT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(PROJECT, 'data/templates/tpl-1783169080624.json'); // 성경-인용-001
const OUT_DIR = path.join(PROJECT, 'data/programs');
const BIBLE_API = 'http://localhost:3000/api/bible';

const REFS = [
  '단2:1-24', '잠1:1-6', '삼하20:16', '삼하20:22', '잠9:10', '전9:16',
  '요1:1', '요1:14', '계1:3', '계10:10', '계22:18-19',
  '약1:2-4', '단3:17', '단6:10', '마18:17-18', '계8:3-5',
  '계5:9-10', '계5:11-12', '계5:13-14', '단2:20', '히13:15',
];
const VERSES_PER_SECTION = 1; // 1절씩
const WORSHIP = '말씀찾기-오후-260705';

async function fetchBible(ref: string): Promise<{ reference: string; sections: string[] }> {
  const url = `${BIBLE_API}?ref=${encodeURIComponent(ref)}&versesPerSection=${VERSES_PER_SECTION}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bible fetch failed (${res.status}) for ${ref}`);
  const data = await res.json();
  return { reference: data.reference ?? ref, sections: Array.isArray(data.sections) ? data.sections : [] };
}

async function main() {
  const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
  // 템플릿에 '장절표기(reference)' 슬롯이 있으면 본문/장절을 분리 바인딩(BibleImporter 와 동일 로직)
  const hasRefSlot = template.variants.some(
    (v: { elements: { type: string; fieldRole?: string }[] }) =>
      v.elements.some((e) => e.type === 'text' && e.fieldRole === 'reference'),
  );

  const now = Date.now();
  const allSections: Section[] = [];

  for (let r = 0; r < REFS.length; r++) {
    const { reference, sections } = await fetchBible(REFS[r]);
    if (sections.length === 0) {
      console.warn(`  ⚠ 본문 없음: ${REFS[r]}`);
      continue;
    }
    sections.forEach((block, i) => {
      const label = sections.length > 1 ? `${reference} · ${i + 1}` : reference;
      const fields = hasRefSlot
        ? { body: block, reference }
        : { body: `${reference}\n${block}` };
      const secs = applyTemplate(template, { fields }, {
        idPrefix: `sec-${now}-${r}-${i}`,
        label,
        colorMark: '#ffffff',
      });
      allSections.push(...secs);
    });
    console.log(`  ✓ ${reference} → ${sections.length} 블록`);
  }

  const programId = `sermon-20260705-${now}`;
  const program = {
    id: programId,
    type: 'sermon',
    worshipId: WORSHIP,
    worshipName: WORSHIP,
    formData: { preserveElements: true, refs: REFS, versesPerSection: VERSES_PER_SECTION },
    item: { id: programId, title: WORSHIP, sections: allSections },
    createdAt: now,
    updatedAt: now,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${programId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(program, null, 2), 'utf8');
  console.log(`\n✅ 생성: ${outPath}`);
  console.log(`   총 섹션: ${allSections.length} / 예배: ${WORSHIP}`);
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
