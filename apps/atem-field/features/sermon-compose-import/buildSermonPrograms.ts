// unoworship-pro 설교대지 저장분 → 컴포저 프로그램 5종 조립.
//
//   01 말씀찾기(본문)   본문 장 전체, 숨김 프로그램
//   02 설교대지        말씀타이틀 · 본문묵상 · 제목/본문 · 설교자
//   03 말씀찾기(인용)   대지타이틀 + 인용구절
//   04 찬송가          장 번호마다 한 프로그램
//   05 찬양(PPT)       저장된 PPT 변환본을 복제
//
// 자막 스타일이 예배 자막 협조와 한 치도 달라지면 안 되므로, 섹션 조립은
// lib/generators/worshipServiceGenerator 의 헬퍼를 그대로 호출한다.
//
// 반드시 브라우저에서 실행해야 한다. 성경 본문 넘침 분할이 canvas 측정에 기대는데
// (features/subtitle-template/templateOverflow.ts) 서버에는 document 가 없어
// 분할이 통째로 사라진다.

import type { Section, SetlistItem } from '@/lib/types';
import type { SavedProgram } from '@/lib/generators/programTypes';
import { formatDateISO } from '@/lib/generators/worshipUploader';
import { buildHymnSectionChunks } from '@/lib/generators/hymnLyrics';
import { orderScriptureMainBeforeQuote } from '@/features/hidden-scripture/hiddenScripture';
import {
  cloneSlideItem,
  fetchBible,
  fetchHymn,
  fetchSlideImagePrograms,
  loadTemplatePicker,
  makeBibleSections,
  makeMeditationSections,
  makeSection,
  stripHeadings,
  type TemplatePicker,
} from '@/lib/generators/worshipServiceGenerator';
import { getActiveTemplateName } from '@/features/subtitle-template/activeTemplate';
import type { CloudSermonOutline, CloudSubProgram, SubHymnItem, SubPraiseItem } from './types';

/** 이 생성기가 만든 프로그램 표시 — 다시 생성할 때 이전 회차를 골라 지우는 기준 */
export const SERMON_IMPORT_GENERATOR = 'sermon-compose-import-v1';

export interface BuildResult {
  worshipId: string;
  worshipName: string;
  programs: SavedProgram[];
  /** PPT 변환본을 찾지 못해 건너뛴 찬양 곡명 */
  skippedPraise: string[];
  warnings: string[];
}

/** 'YYYY-MM-DD' → 'YYYYMMDD'. 날짜가 없으면 오늘로 둔다 */
function toDateKey(serviceDate: string | null): string {
  if (serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return serviceDate.replaceAll('-', '');
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

function slugify(text: string): string {
  return text.replace(/[^a-zA-Z0-9가-힣_\-]/g, '');
}

/**
 * 설교대지 저장분과 부속 프로그램을 컴포저 프로그램으로 조립한다.
 * 저장은 하지 않는다 — 호출부가 POST /api/programs 로 올린다.
 */
export async function buildSermonPrograms(
  outline: CloudSermonOutline,
  subPrograms: CloudSubProgram[],
  options: { templateName?: string } = {},
): Promise<BuildResult> {
  if (typeof document === 'undefined') {
    throw new Error('설교대지 프로그램은 브라우저에서만 조립할 수 있습니다(본문 넘침 분할이 화면 측정에 기댑니다).');
  }

  const warnings: string[] = [];
  const skippedPraise: string[] = [];

  const dateKey = toDateKey(outline.service_date);
  const worshipType = outline.service_type || '주일낮예배';
  const worshipId = `${dateKey}-worship`;
  const worshipName = `${formatDateISO(dateKey).replaceAll('-', '.')} ${worshipType}`;

  /* 이 교회가 고른 세트를 쓴다. 미등록 카테고리는 picker 가 시드로 폴백한다. */
  const picker = await loadTemplatePicker(options.templateName ?? getActiveTemplateName());

  /* 화면에서 확인·수정을 거친 값이 협조문 파싱값보다 우선한다. */
  const meta = outline.metadata ?? {};
  const parsed = meta.parsed;
  const sermonTitle = (meta.sermonTitle ?? parsed?.sermonTitle ?? '').trim();
  const scriptureRef = (meta.scriptureRef ?? parsed?.scriptureRef ?? '').trim();
  const preacher = (meta.preacher ?? '').trim();
  /* 교회명은 입력웹이 churches 레코드에서 읽어 보낸다. 옛 저장분에는 없을 수 있다. */
  const churchName = (meta.churchName ?? '').trim();
  const points = parsed?.points ?? [];

  if (preacher && !churchName) {
    warnings.push('입력웹에서 교회명을 받지 못해 설교자 자막의 소속이 비어 있습니다.');
  }

  const items: SetlistItem[] = [];
  const slideSources = new Map<string, SavedProgram>();
  /* id 는 순번이 아니라 프로그램의 정체성으로 만든다.
     순번을 쓰면 앞쪽 프로그램 수가 달라질 때(대지가 없으면 말씀찾기(인용)이 빠진다)
     같은 336장이 -03 → -04 → -05 로 매번 다른 파일이 되어 세 번 딸려온다.
     정체성으로 만들면 다시 생성해도 같은 id 라 서버 파일도 세트리스트 항목도 그대로 갱신된다.
     한 배치 안에서 겹치지 않는다 — 찬송가는 장 번호, 찬양은 곡명, 나머지는 종류가 하나씩이다.
     목록 순서는 id 가 아니라 updatedAt 내림차순으로 잡히므로 순번이 없어도 그대로다. */
  const nextId = (name: string) => `${worshipId}-${slugify(name)}`;

  /* 본문 요절 — 말씀찾기(본문)·본문묵상·제목/본문이 함께 쓴다. */
  const main = scriptureRef ? await fetchBible(`ref=${encodeURIComponent(scriptureRef)}`) : null;
  if (scriptureRef && !main) {
    warnings.push(`본문(${scriptureRef})을 로컬 성경에서 찾지 못해 말씀찾기(본문)·본문묵상을 건너뛰었습니다.`);
  }

  // ── 01. 말씀찾기(본문) — 장 전체를 절별로. 목록에서는 숨겨진다.
  if (main) {
    const chapterAll = await fetchBible(
      `bookId=${encodeURIComponent(main.bookId)}&chapter=${main.chapter}`,
    );
    const verses = chapterAll && chapterAll.verses.length > 0 ? chapterAll.verses : main.verses;
    /* refBase 는 ref= 조회 결과에서 얻는다 — 장 전체 조회의 reference 는 '창 1장' 형태라 절 표기에 못 쓴다. */
    const refBase = main.reference.split(':')[0];
    const id = nextId('말씀찾기본문');
    const sections = verses.flatMap((verse) =>
      makeBibleSections(
        picker,
        {
          body: stripHeadings(verse.text),
          reference: `${refBase}:${verse.num}`,
          verse: `${verse.num}`,
        },
        `${id}-v${verse.num}`,
        `${verse.num}`,
        { splitStrategy: 'balanced' },
      ),
    );
    items.push({
      id,
      title: `${dateKey}-말씀찾기(본문)`,
      sections,
      promptLayout: 'bible',
      hiddenScripture: true,
    });
  }

  // ── 02. 설교대지 — 말씀타이틀 · 본문묵상 · 제목/본문 · 설교자
  if (sermonTitle || scriptureRef || preacher) {
    const id = nextId('설교대지');
    const sections: Section[] = [];

    /* 말씀타이틀 — 요절을 올린다. 어떤 슬롯을 지정한 템플릿이든 받도록 함께 채운다. */
    sections.push(
      ...makeSection(
        picker,
        'wordTitle',
        {
          title: scriptureRef,
          reference: scriptureRef,
          scriptureRef,
          speaker: preacher,
          body: scriptureRef,
        },
        `${id}-word-title`,
        '말씀타이틀',
      ),
    );

    /* 본문묵상 — 별도 프로그램이 아니라 설교대지 안에서 말씀타이틀 다음에 온다. */
    if (main && main.verses.length > 0) {
      const meditationId = `${id}-meditation`;
      sections.push(
        ...main.verses.flatMap((verse) =>
          makeMeditationSections(
            picker,
            {
              body: stripHeadings(verse.text),
              reference: main.reference,
              verse: `${verse.num}`,
            },
            `${meditationId}-v${verse.num}`,
            `${verse.num}`,
          ),
        ),
      );
    }

    const keyVerseText =
      main && main.verses.length > 0
        ? main.verses.map((verse) => stripHeadings(verse.text)).join('\n')
        : '';
    sections.push(
      ...makeSection(
        picker,
        'titleScripture',
        {
          title: sermonTitle,
          scriptureRef,
          reference: scriptureRef,
          body: keyVerseText || `${sermonTitle}\n${scriptureRef}`,
        },
        `${id}-title-scripture`,
        '제목/본문',
      ),
    );

    sections.push(
      ...makeSection(
        picker,
        'preacher',
        { name: preacher, church: churchName, body: preacher },
        `${id}-preacher`,
        '설교자',
      ),
    );

    /* 설교대지 섹션은 PMT 기본 꺼짐 — 예배 자막 협조와 같다. */
    items.push({ id, title: `${dateKey}-설교대지`, sections, promptLayout: 'none' });
  }

  // ── 03. 말씀찾기(인용) — 대지타이틀 다음에 그 대지의 인용구절
  if (points.length > 0) {
    const id = nextId('말씀찾기인용');
    const sections: Section[] = [];
    let quoteNo = 0;

    for (const [pointIndex, point] of points.entries()) {
      const pointNo = pointIndex + 1;
      sections.push(
        ...makeSection(
          picker,
          'pointTitle',
          { point: point.title, pointNumber: point.number || `${pointNo}`, body: point.title },
          `${id}-p${pointNo}`,
          `대지 ${pointNo}`,
        ),
      );

      for (const quote of point.quotes) {
        quoteNo += 1;
        const found = await fetchBible(`ref=${encodeURIComponent(quote)}`);
        if (found && found.verses.length > 0) {
          const refBase = found.reference.split(':')[0];
          for (const verse of found.verses) {
            sections.push(
              ...makeBibleSections(
                picker,
                {
                  body: stripHeadings(verse.text),
                  reference: `${refBase}:${verse.num}`,
                  /* 인용은 여러 책장절이 섞이므로 절 번호 대신 헤더의 전체 책장절만 쓴다. */
                  verse: '',
                },
                `${id}-q${quoteNo}-v${verse.num}`,
                `인용${quoteNo}-${verse.num}`,
                { splitStrategy: 'balanced' },
              ),
            );
          }
        } else {
          warnings.push(`인용 구절(${quote})을 찾지 못해 표기만 넣었습니다.`);
          sections.push(
            ...makeBibleSections(
              picker,
              { body: quote, reference: quote },
              `${id}-q${quoteNo}`,
              `인용 ${quoteNo}`,
              { splitStrategy: 'balanced' },
            ),
          );
        }
      }
    }

    items.push({ id, title: `${dateKey}-말씀찾기(인용)`, sections, promptLayout: 'bible' });
  }

  // ── 04. 찬송가 — 장 번호마다 한 프로그램. 가사는 로컬 찬송가 데이터에서 채운다.
  const hymnNumbers = subPrograms
    .filter((program) => program.kind === 'hymn')
    .flatMap((program) => (program.items as SubHymnItem[]).map((item) => item.number))
    .filter((num) => Number.isInteger(num) && num > 0);

  for (const num of hymnNumbers) {
    const item = await buildHymnItem(picker, nextId(`${num}장`), num, warnings);
    if (item) items.push(item);
  }

  // ── 05. 찬양(PPT) — 저장된 슬라이드 프로그램을 곡명으로 찾아 복제
  const praiseNames = subPrograms
    .filter((program) => program.kind === 'praise')
    .flatMap((program) => (program.items as SubPraiseItem[]).map((item) => item.songName))
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name));

  if (praiseNames.length > 0) {
    const slidePrograms = await fetchSlideImagePrograms();
    for (const name of praiseNames) {
      const source = findSlideProgram(slidePrograms, name);
      if (!source) {
        skippedPraise.push(name);
        continue;
      }
      const id = nextId(name);
      items.push(cloneSlideItem(source, id, name));
      slideSources.set(id, source);
    }
  }

  if (picker.missing.size > 0) {
    warnings.push(
      `템플릿 ${picker.selectedName} 미등록 카테고리(${[...picker.missing].join(', ')})는 기본 디자인으로 생성했습니다.`,
    );
  }

  /* 말씀찾기(본문)은 맨 앞에서 만들어지지만 목록에서는 말씀찾기(인용) 바로 위에 온다.
     로더와 같은 규칙을 써서 생성·로드 순서를 맞춘다. */
  const orderedItems = orderScriptureMainBeforeQuote(items);
  const now = Date.now();

  const programs: SavedProgram[] = orderedItems.map((item) => {
    const source = slideSources.get(item.id);
    return {
      id: item.id,
      type: source ? 'slide-images' : 'worship',
      worshipId,
      worshipName,
      formData: source
        ? {
            ...source.formData,
            /* 찬양(PPT) 사본에도 생성기 표시를 남긴다 — 다시 생성할 때 정리 대상을 고르는 기준이다 */
            generator: SERMON_IMPORT_GENERATOR,
            preserveElements: true,
            templateName: picker.selectedName,
          }
        : {
            generator: SERMON_IMPORT_GENERATOR,
            preserveElements: true,
            worshipType,
            templateName: picker.selectedName,
            sourceOutlineId: outline.id,
          },
      item,
      createdAt: now,
      updatedAt: now,
    };
  });

  return { worshipId, worshipName, programs, skippedPraise, warnings };
}

/** 장 번호 → 찬송가 프로그램. 예배 자막 협조의 buildHymnByNumber 와 같은 규칙이다. */
async function buildHymnItem(
  picker: TemplatePicker,
  itemId: string,
  num: number,
  warnings: string[],
): Promise<SetlistItem | null> {
  const hymn = await fetchHymn(num);
  if (!hymn) {
    warnings.push(`찬송가 ${num}장을 로컬 데이터에서 찾지 못해 건너뛰었습니다.`);
    return null;
  }

  const title = `${num}장`;
  const hymnTitle = hymn.title?.trim();
  const chunks = buildHymnSectionChunks(hymn.lyrics);
  const sections = chunks.flatMap((chunk, index) =>
    makeSection(
      picker,
      'hymn',
      {
        body: chunk.body,
        // 제목(title) 슬롯 = 곡명. 장 번호는 number 슬롯, 프로그램 이름은 "N장" 유지.
        //   (예배 자막협조 생성기와 같은 규칙 — 어긋나면 같은 템플릿이 경로마다 다르게 나온다)
        title: hymnTitle || title,
        number: String(num),
        verseLabel: chunk.verseLabel,
        ...(chunk.amen ? { amen: chunk.amen } : {}),
      },
      `${itemId}-sec${index + 1}`,
      /* 첫 섹션 라벨에 'N장 · 제목'을 심어 송출그리드 타일에 보여 준다(가사·송출엔 영향 없음). */
      index === 0 && hymnTitle ? `${num}장 · ${hymnTitle}` : chunk.verseLabel,
    ),
  );

  return { id: itemId, title, sections, promptLayout: 'black-white' };
}

/** 곡명으로 PPT 변환본 찾기 — 예배 자막 협조의 findSlideProgram 과 같은 규칙이다. */
function findSlideProgram(programs: SavedProgram[], name: string): SavedProgram | undefined {
  const query = name.trim().toLowerCase();
  if (!query) return undefined;
  return programs.find((program) =>
    program.item.title.toLowerCase().includes(query)
    || program.worshipName.toLowerCase().includes(query)
    || String(program.formData?.sourceLabel ?? '').toLowerCase().includes(query)
    || String(program.formData?.assetFolder ?? '').toLowerCase().includes(query),
  );
}
