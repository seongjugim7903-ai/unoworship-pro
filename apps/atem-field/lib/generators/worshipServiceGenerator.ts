// 예배 자막 협조 제너레이터 — 예배 순서 전체(고정곡·찬송가·설교대지·찬양)를
// 선택한 카테고리별 템플릿으로 프로그램화해 서버(/api/programs)에 저장한다.
// 워십 ID는 "(예배일자)-worship" — 같은 날짜의 순서가 한 워십으로 묶여 방송실이 한 번에 불러온다.

import type { Section, SetlistItem } from '@/lib/types';
import type { SavedProgram } from './programTypes';
import { formatDateISO } from './worshipUploader';
import { CHOIR_DESIGN } from './designs/choirDesign';
import { chunkTwoLines, buildHymnSectionChunks } from './hymnLyrics';
import {
  makeScriptureTemplateSections,
  type ScriptureTemplateFields,
  type ScriptureTemplateSectionOptions,
} from './scriptureTemplateSections';
import { listTemplates } from '@/features/subtitle-template/templateClient';
import { applyTemplate } from '@/features/subtitle-template/applyTemplate';
import type { SubtitleTemplate } from '@/features/subtitle-template/model';
import type { TemplateCategory } from '@/features/subtitle-template/schema';

// ─── 폼 타입 ─────────────────────────────────────────────────────────────────

export interface WorshipServiceForm {
  worshipType: string;   // 주일낮예배 | 주일오후예배 | 수요예배 | 금요기도회 | 월삭감사예배 | 기타명
  worshipDate: string;   // YYYYMMDD
  /** data/programs 파일 ID의 공통 앞부분. 비우면 YYYYMMDD-worship을 사용한다. */
  worshipFileName?: string;
  templateName: string;  // 기본값 basic-001, 카테고리에 없으면 basic-001로 대체
  // 05. 설교대지
  sermonTitle: string;   // 설교제목
  scriptureRef: string;  // 본문 요절 (예: 벧전 2:5-9) — 이 요절이 곧 본문묵상 섹션
  preacher: string;      // 설교자
  churchName: string;    // 교회 이름 — 설교자 섹션의 소속/교회 슬롯
  /** 말씀찾기(인용)·대지타이틀 — 줄 단위. 성경 구절 표기는 인용, 그 외는 대지타이틀로 순서대로 섹션화 */
  quotesText: string;
  // 04/06. 찬송가 — 장 번호만 입력, 가사는 로컬 찬송가 데이터(/api/hymn)에서 자동 (비우면 미포함)
  hymn1Number: string;
  hymn2Number: string;
  /** 추가 찬송가 — 장 번호 배열. 설교 후(찬송가 2) 뒤에 순서대로 삽입 (선택, 비우면 미포함) */
  extraHymnNumbers?: string[];
  // 4. 목사님 찬양 — 줄 단위 곡명 (PPT 변환본 검색 배치)
  praiseSongs: string;
  // 5. 준비찬양 — PPT 변환본들을 하나의 사용자 지정 프로그램으로 묶음
  preparationPraiseProgramName: string;
  preparationPraiseSongs: string;
  /** 정기예배별 기본 프로그램 — 오른쪽 목록에서 사용자가 클릭해 가져온 것만 생성 */
  selectedRegularProgramIds?: RegularProgramId[];
  /** 고정 프로그램 라이브러리 — 워십 생성 시 사용자가 선택해 추가 */
  selectedFixedProgramIds?: string[];
  /** 주일낮예배 추가 프로그램 — 템플릿 등록 전까지는 공지 필드만 생성 */
  campaignText?: string;
  churchNewsText?: string;
}

export interface GeneratedProgramSummary {
  title: string;
  sectionCount: number;
  saved: boolean;
}

export interface WorshipServiceResult {
  worshipId: string;
  worshipName: string;
  programs: GeneratedProgramSummary[];
  /** PPT 변환본을 찾지 못해 건너뛴 찬양 곡명 */
  skippedPraise: string[];
  warnings: string[];
}

export type RegularProgramId =
  | 'king-my-god'
  | 'bless-my-soul'
  | 'my-god'
  | 'campaign'
  | 'church-news'
  | 'hephzibah'
  | 'only-jesus'
  | 'sending-song';

export interface RegularProgramOption {
  id: RegularProgramId;
  title: string;
  eligible: boolean;
  note: string;
}

// ─── 고정 자료 (교회 보유/사용 허가 자료) ────────────────────────────────────

/** 01. 왕이신 나의 하나님 — 주일낮예배(1·2부) */
const SONG_KING_MY_GOD = {
  title: '왕이신 나의 하나님',
  blocks: [
    '왕이신 나의 하나님\n내가 주를 높이고\n영원히 주의 이름을\n송축하리다',
    '왕이신 나의 하나님\n내가 주를 높이고\n영원히 주의 이름을\n송축하리다',
  ],
};

/** 08. 파송의 노래 — 주일오후예배 */
const SONG_SENDING = {
  title: '파송의 노래',
  blocks: [
    '너의 가는 길에 주의 평강 있으리\n평강의 왕 함께 가시니',
    '너의 걸음걸음 주 인도하시리\n주의 강한 손 널 이끄시리',
    '너의 가는 길에 주의 축복 있으리\n영광의 주 함께 가시니',
    '네가 밟는 모든 땅 주님 다스리시리\n너는 주의 길 예비케 되리',
    '주님 나라 위하여\n길 떠나는 나의 형제여',
    '주께서 가라시니\n너는 가라 주의 이름으로',
    '거칠은 광야 위에\n꽃은 피어나고',
    '세상은 네 안에서\n주님의 영광 보리라',
    '강하고 담대하라\n세상 이기신 주 늘 함께',
    '너와 동행하시며\n네게 새 힘 늘 주시리',
  ],
};

/** 09. 송축해 내영혼 — 주일낮예배(1·2부) 제외 전체 */
const SONG_BLESS_MY_SOUL = {
  title: '송축해 내영혼',
  blocks: [
    '송축해 내 영혼 내 영혼아\n거룩하신 이름\n이전에 없었던 노래로\n나 주님을 경배해',
    '감사해 내 영혼 내 영혼아\n거룩하신 이름\n이전에 없었던 감사로\n나 주님을 경배해',
  ],
};

/** 추가-나의 하나님 — 주일낮예배(1·2부) */
const SONG_MY_GOD = {
  title: '나의 하나님',
  blocks: [
    '나의 하나님 나의 하나님\n나와 함께 하신 하나님',
    '주님 뜻대로 살기 원하여\n이처럼 간구합니다.',
    '아버지 아버지\n죄인 부르신 아버지',
    '감사합니다 감사합니다\n늘 찬송하게 합소서',
    '아버지 아버지\n은혜 베푸신 아버지',
    '감사합니다 감사합니다\n영광받아 주 옵소서',
  ],
};

/** 오직 예수님 — 추가 고정 찬양 */
const SONG_ONLY_JESUS = {
  title: '오직 예수',
  blocks: [
    '오직 예수님 주님 십자가\n오직 예수님 아-멘',
    '오직 예수님 주님 십자가\n오직 예수님 아-멘',
    '오직 예수님 주님 오신다\n오직 예수님 아-멘',
    '오직 예수님 주님 오신다\n오직 에수님 아-멘',
    '오직 성령님 오직 성령님\n오직 성령님 충만',
    '오직 성령님 오직 성령님\n오직 성령님 충만',
  ],
};

export function getRegularProgramOptions(worshipType: string): RegularProgramOption[] {
  const isSundayMorning = worshipType === '주일낮예배';
  const isSundayAfternoon = worshipType === '주일오후예배';

  return [
    { id: 'king-my-god', title: SONG_KING_MY_GOD.title, eligible: isSundayMorning, note: '주일낮예배 1·2부' },
    { id: 'bless-my-soul', title: SONG_BLESS_MY_SOUL.title, eligible: !isSundayMorning, note: '주일낮예배 제외 정기예배' },
    { id: 'my-god', title: SONG_MY_GOD.title, eligible: isSundayMorning, note: '주일낮예배 1·2부' },
    { id: 'campaign', title: '행복한 신앙생활 캠페인', eligible: isSundayMorning, note: '주일낮예배 1·2부 · 필드' },
    { id: 'church-news', title: '교회소식', eligible: isSundayMorning, note: '주일낮예배 1·2부 · 필드' },
    { id: 'hephzibah', title: '헵시바 선교단', eligible: isSundayMorning, note: '주일낮예배 1·2부 · PPT 이미지 또는 빈 프로그램' },
    { id: 'only-jesus', title: SONG_ONLY_JESUS.title, eligible: true, note: '추가 고정 찬양' },
    { id: 'sending-song', title: SONG_SENDING.title, eligible: isSundayAfternoon, note: '주일오후예배' },
  ];
}

// ─── 템플릿 로딩 ─────────────────────────────────────────────────────────────

const DEFAULT_TEMPLATE_NAME = 'basic-001';

interface TemplatePicker {
  get(category: TemplateCategory): SubtitleTemplate;
  missing: Set<TemplateCategory>;
  selectedName: string;
}

function makeFallbackTemplate(category: TemplateCategory): SubtitleTemplate {
  const elements = CHOIR_DESIGN.defaultSection.elements.map(
    (el) => JSON.parse(JSON.stringify(el)),
  );
  return {
    id: `fallback-${category}`,
    name: 'fallback',
    category,
    templateVersion: 1,
    variants: [{ id: 'body', label: '본문', elements }],
    createdAt: '',
    updatedAt: '',
  };
}

async function loadTemplatePicker(templateName: string): Promise<TemplatePicker> {
  let all: SubtitleTemplate[] = [];
  try {
    all = await listTemplates();
  } catch {
    // 서버 미응답 → 전부 폴백
  }
  const cache = new Map<TemplateCategory, SubtitleTemplate>();
  const missing = new Set<TemplateCategory>();
  const selectedName = templateName.trim() || DEFAULT_TEMPLATE_NAME;
  return {
    missing,
    selectedName,
    get(category) {
      const cached = cache.get(category);
      if (cached) return cached;
      const found =
        all.find((t) => t.category === category && t.name === selectedName) ??
        all.find((t) => t.category === category && t.name.includes(selectedName));
      const fallback = selectedName === DEFAULT_TEMPLATE_NAME
        ? undefined
        : all.find((t) => t.category === category && t.name === DEFAULT_TEMPLATE_NAME);
      const tpl = found ?? fallback ?? makeFallbackTemplate(category);
      if (!found) missing.add(category);
      cache.set(category, tpl);
      return tpl;
    },
  };
}

// ─── 성경 조회 ───────────────────────────────────────────────────────────────

interface BibleVerseDto {
  num: number;
  text: string;
}

interface BibleResponseDto {
  reference: string;
  bookId: string;
  chapter: number;
  verses: BibleVerseDto[];
}

/** 개역개정 편집 소제목(<...>) 제거 — /api/bible buildSections 와 동일 규칙 */
function stripHeadings(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/^\s*-\d+\s+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function fetchBible(query: string): Promise<BibleResponseDto | null> {
  try {
    const res = await fetch(`/api/bible?${query}`);
    if (!res.ok) return null;
    return (await res.json()) as BibleResponseDto;
  } catch {
    return null;
  }
}

/**
 * 성경 구절 표기 줄인지 판별 — "롬 8:28", "벧전 2:18-21", "요한복음 3:16", "롬8:28,31-39" 형태.
 * 그 외 문장(대지타이틀)과 구분하는 용도.
 */
export function isScriptureRefLine(line: string): boolean {
  return /^[가-힣A-Za-z0-9]+(\s+\d+)?\s*\d*\s*:\s*\d+(\s*[-~,]\s*\d+)*$/.test(line.trim());
}

// ─── 섹션/프로그램 빌더 ──────────────────────────────────────────────────────

function makeSection(
  picker: TemplatePicker,
  category: TemplateCategory,
  fields: Record<string, string>,
  idPrefix: string,
  label: string,
): Section[] {
  return applyTemplate(picker.get(category), { fields }, { idPrefix, label, colorMark: '#ffffff' });
}

function makeBibleSections(
  picker: TemplatePicker,
  fields: ScriptureTemplateFields,
  idPrefix: string,
  label: string,
  options: Pick<ScriptureTemplateSectionOptions, 'splitStrategy'> = {},
): Section[] {
  return makeScriptureTemplateSections(picker.get('bible'), fields, {
    idPrefix,
    label,
    colorMark: '#ffffff',
    splitStrategy: options.splitStrategy,
  });
}

function makeMeditationSections(
  picker: TemplatePicker,
  fields: ScriptureTemplateFields,
  idPrefix: string,
  label: string,
): Section[] {
  return makeScriptureTemplateSections(picker.get('meditation'), fields, {
    idPrefix,
    label,
    colorMark: '#ffffff',
    splitStrategy: 'balanced',
  });
}

function slugify(text: string): string {
  return text.replace(/[^a-zA-Z0-9가-힣_\-]/g, '');
}

function normalizeWorshipFileName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9가-힣_\-]/g, '');
}

/** 가사 블록들 → 찬송가(hymn) 템플릿 섹션의 프로그램 (섹션당 두 줄) — 고정곡(마커 없는 순수 블록)용 */
function buildSongItem(
  picker: TemplatePicker,
  itemId: string,
  title: string,
  blocks: string[],
  extra: { number?: string } = {},
): SetlistItem {
  const chunks = blocks.flatMap(chunkTwoLines);
  const sections = chunks.flatMap((chunk, i) =>
    makeSection(
      picker,
      'hymn',
      {
        body: chunk,
        title,
        ...(extra.number ? { number: extra.number } : {}),
        verseLabel: `${i + 1}`,
      },
      `${itemId}-sec${i + 1}`,
      `${i + 1}`,
    ),
  );
  // 고정곡(왕이신·송축·파송)은 PMT 기본 꺼짐 — 필요 시 컴포저에서 수동으로 켠다 (2026-07-09 확정)
  return { id: itemId, title, sections, promptLayout: 'none' };
}

interface LocalHymnDto {
  num: number;
  title: string;
  lyrics: string;
  sections: string[];
}

/** 로컬 찬송가 데이터(/api/hymn)에서 장 번호로 조회 */
async function fetchHymn(num: number): Promise<LocalHymnDto | null> {
  try {
    const res = await fetch(`/api/hymn?num=${num}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { hymn: LocalHymnDto };
    return data.hymn ?? null;
  } catch {
    return null;
  }
}

async function fetchSlideImagePrograms(): Promise<SavedProgram[]> {
  try {
    const res = await fetch('/api/programs?type=slide-images');
    if (!res.ok) return [];
    const data = (await res.json()) as { programs?: SavedProgram[] };
    return Array.isArray(data.programs) ? data.programs : [];
  } catch {
    return [];
  }
}

async function fetchFixedPrograms(): Promise<SavedProgram[]> {
  try {
    const res = await fetch('/api/fixed-programs', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { programs?: SavedProgram[] };
    return Array.isArray(data.programs) ? data.programs : [];
  } catch {
    return [];
  }
}

interface WorshipIdentity {
  worshipId: string;
  worshipName: string;
  lookupFailed: boolean;
}

/**
 * 같은 날짜의 워십을 다시 만들 때 기존 프로그램을 덮어쓰지 않도록
 * 저장된 이름과 ID를 함께 확인해 다음 번호를 예약한다.
 */
async function resolveWorshipIdentity(baseId: string, baseName: string): Promise<WorshipIdentity> {
  try {
    const res = await fetch('/api/programs');
    if (!res.ok) return { worshipId: baseId, worshipName: baseName, lookupFailed: true };

    const data = (await res.json()) as { programs?: SavedProgram[] };
    const programs = Array.isArray(data.programs) ? data.programs : [];
    const names = new Set(programs.map((program) => program.worshipName));
    const ids = new Set(programs.map((program) => program.worshipId));

    if (!names.has(baseName) && !ids.has(baseId)) {
      return { worshipId: baseId, worshipName: baseName, lookupFailed: false };
    }

    let suffix = 1;
    while (names.has(`${baseName} (${suffix})`) || ids.has(`${baseId}-${suffix}`)) {
      suffix += 1;
    }
    return {
      worshipId: `${baseId}-${suffix}`,
      worshipName: `${baseName} (${suffix})`,
      lookupFailed: false,
    };
  } catch {
    return { worshipId: baseId, worshipName: baseName, lookupFailed: true };
  }
}

function cloneSlideItem(source: SavedProgram, id: string, title: string): SetlistItem {
  const item = JSON.parse(JSON.stringify(source.item)) as SetlistItem;
  return {
    ...item,
    id,
    title,
    sections: item.sections.map((section) => ({
      ...section,
      id: `${id}-${section.id}`,
      elements: section.elements.map((element) => ({
        ...element,
        id: `${id}-${element.id}`,
      })),
    })),
  };
}

// ─── 메인 제출 함수 ──────────────────────────────────────────────────────────

export async function submitWorshipService(form: WorshipServiceForm): Promise<WorshipServiceResult> {
  const baseWorshipId = normalizeWorshipFileName(form.worshipFileName ?? '') || `${form.worshipDate}-worship`;
  const dateDisplay = formatDateISO(form.worshipDate).replace(/-/g, '.');
  const baseWorshipName = `${dateDisplay} 예배`;
  const identity = await resolveWorshipIdentity(baseWorshipId, baseWorshipName);
  const { worshipId, worshipName } = identity;
  const warnings: string[] = [];
  const skippedPraise: string[] = [];

  if (identity.lookupFailed) {
    warnings.push('기존 워십 목록을 확인하지 못해 기본 워십 이름으로 저장했습니다.');
  }

  const picker = await loadTemplatePicker(form.templateName);

  const regularOptions = getRegularProgramOptions(form.worshipType);
  const selectedRegularProgramIds = new Set(form.selectedRegularProgramIds ?? []);
  const includeRegularProgram = (id: RegularProgramId) =>
    selectedRegularProgramIds.has(id) && Boolean(regularOptions.find((option) => option.id === id)?.eligible);

  const slidePrograms = await fetchSlideImagePrograms();
  const fixedPrograms = await fetchFixedPrograms();
  const selectedFixedProgramIds = new Set(form.selectedFixedProgramIds ?? []);
  const selectedFixedPrograms = fixedPrograms.filter((program) => selectedFixedProgramIds.has(program.id));
  const selectedFixedByTitle = new Map(selectedFixedPrograms.map((program) => [program.item.title.trim(), program]));
  if (selectedFixedProgramIds.size > 0 && fixedPrograms.length === 0) {
    warnings.push('고정 프로그램 라이브러리를 불러오지 못해 선택 자료를 건너뛰었습니다.');
  }
  const addSelectedFixedProgram = (program: SavedProgram, title = program.item.title) => {
    items.push(cloneSlideItem(program, nextId(title), title));
  };
  const findSlideProgram = (name: string) => {
    const query = name.trim().toLowerCase();
    if (!query) return undefined;
    return slidePrograms.find((program) =>
      program.item.title.toLowerCase().includes(query)
      || program.worshipName.toLowerCase().includes(query)
      || String(program.formData?.sourceLabel ?? '').toLowerCase().includes(query)
      || String(program.formData?.assetFolder ?? '').toLowerCase().includes(query),
    );
  };

  // 순서대로 프로그램 조립. hiddenScripture 는 리스트에서 숨겨지는 내부 프로그램이다.
  const items: SetlistItem[] = [];
  const slideSources = new Map<string, SavedProgram>();
  let order = 0;
  const nextId = (name: string) => {
    order += 1;
    return `${worshipId}-${String(order).padStart(2, '0')}-${slugify(name) || 'p'}`;
  };
  const addSlideItem = (source: SavedProgram, title: string) => {
    const id = nextId(title);
    const item = cloneSlideItem(source, id, title);
    items.push(item);
    slideSources.set(id, source);
    return item;
  };

  const preparationPraiseNames = form.preparationPraiseSongs
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const praiseNames = form.praiseSongs
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  // 본문 요절 조회 — 말씀찾기(본문)·본문묵상·제목/본문에서 함께 쓴다
  const main = await fetchBible(`ref=${encodeURIComponent(form.scriptureRef)}`);

  // 00. 말씀찾기(본문) — 장 전체 숨김 프로그램 [FEATURE: HIDDEN_SCRIPTURE]
  //   본문이 "창 1:4-5"여도 창세기 1장 전체(1절~끝절)를 절별 섹션으로 생성.
  //   items 맨 앞에 두어 전역 섹션 번호 1..N 을 무조건 이 프로그램이 차지하게 한다.
  //   리스트에는 숨겨지고(hiddenScripture) 번호 송출 중에만 나타난다 — features/hidden-scripture 참조.
  if (main) {
    const chapterAll = await fetchBible(
      `bookId=${encodeURIComponent(main.bookId)}&chapter=${main.chapter}`,
    );
    const verses = chapterAll && chapterAll.verses.length > 0 ? chapterAll.verses : main.verses;
    // refBase 는 ref= 조회 결과에서 얻는다 — 장 전체 조회의 reference 는 "창 1장" 형태라 절 표기용으로 부적합
    const refBase = main.reference.split(':')[0]; // "창 1:4-5" → "창 1"
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
      title: `${form.worshipDate}-말씀찾기(본문)`,
      sections,
      promptLayout: 'bible',
      hiddenScripture: true,
    });
  } else {
    warnings.push(
      `본문(${form.scriptureRef})을 로컬 성경에서 찾지 못해 말씀찾기(본문)·본문묵상 섹션을 생략했습니다.`,
    );
  }

  // 01. 준비찬양 — 모든 정기예배에서 PPT 변환본을 찾아 하나의 프로그램으로 묶는다.
  if (preparationPraiseNames.length > 0) {
    const preparationPrograms = preparationPraiseNames
      .map((name) => ({ name, program: findSlideProgram(name) }))
      .filter((entry): entry is { name: string; program: SavedProgram } => Boolean(entry.program));
    preparationPraiseNames.forEach((name) => {
      if (!findSlideProgram(name)) skippedPraise.push(`준비찬양: ${name}`);
    });
    if (preparationPrograms.length > 0) {
      const title = form.preparationPraiseProgramName.trim() || '준비찬양';
      const first = preparationPrograms[0].program;
      const id = nextId(title);
      const sections = preparationPrograms.flatMap(({ program }) =>
        program.item.sections.map((section) => ({
          ...section,
          id: `${id}-${section.id}`,
          elements: section.elements.map((element) => ({
            ...element,
            id: `${id}-${element.id}`,
          })),
        })),
      );
      items.push({ ...cloneSlideItem(first, id, title), sections });
      slideSources.set(id, first);
    }
  }

  // 02. 왕이신 나의 하나님 — 주일낮예배(1·2부)
  if (includeRegularProgram('king-my-god')) {
    items.push(buildSongItem(picker, nextId(SONG_KING_MY_GOD.title), SONG_KING_MY_GOD.title, SONG_KING_MY_GOD.blocks));
  }

  // 03. 송축해 내영혼 — 기존 정기예배 조건 유지(주일낮예배 1·2부 제외).
  if (includeRegularProgram('bless-my-soul')) {
    items.push(buildSongItem(picker, nextId(SONG_BLESS_MY_SOUL.title), SONG_BLESS_MY_SOUL.title, SONG_BLESS_MY_SOUL.blocks));
  }

  // 04. 사도신경 — 라이브러리에서 선택하면 본문까지 넣고, 선택하지 않으면 기존 빈 프로그램을 유지한다.
  const selectedApostlesCreed = selectedFixedByTitle.get('사도신경');
  if (selectedApostlesCreed) {
    addSelectedFixedProgram(selectedApostlesCreed, '사도신경');
  } else {
    items.push({
      id: nextId('사도신경'),
      title: '사도신경',
      sections: [],
      promptLayout: 'none',
    });
  }

  // 주기도문·교독문 등 새로 추가되는 고정 자료도 선택 시 함께 생성한다.
  // 기존 정기예배 선택으로 이미 생성되는 고정 찬양은 제목 중복을 피한다.
  const generatedTitles = new Set(items.map((item) => item.title.trim()));
  for (const program of selectedFixedPrograms) {
    const title = program.item.title.trim();
    if (!title || title === '사도신경' || generatedTitles.has(title)) continue;
    addSelectedFixedProgram(program, title);
    generatedTitles.add(title);
  }

  // 05. 찬송가(설교 전) — 장 번호 → 로컬 데이터 조회 → 절/후렴 구조 파싱.
  //   [FEATURE: HYMN_VERSE_REFRAIN] (N) 절 번호 표기는 제거하고, 후렴이 있으면 절마다 뒤에 반복 배치
  //   (원곡이 절-후렴-절-후렴 구조이므로 — 인쇄본처럼 후렴을 한 번만 두면 라이브 중 다시 찾기 어려움).
  //   아멘은 마지막 절에서만 분리해 amen 필드로 전달(본문과 별도 텍스트 슬롯 — 작게·이탤릭 스타일용).
  const buildHymnByNumber = async (numberText: string): Promise<SetlistItem | null> => {
    const num = Number(numberText.trim());
    if (!Number.isInteger(num) || num <= 0) {
      warnings.push(`찬송가 번호(${numberText})가 올바르지 않아 건너뛰었습니다.`);
      return null;
    }
    const hymn = await fetchHymn(num);
    if (!hymn) {
      warnings.push(`찬송가 ${num}장을 로컬 데이터에서 찾지 못해 건너뛰었습니다.`);
      return null;
    }
    const itemId = nextId(`${num}장`);
    const title = `${num}장`;
    // 첫 섹션 라벨에 "N장 · 제목"을 심어 송출그리드 타일에 표시(가사/송출엔 영향 없음, label 전용).
    const hymnTitle = hymn.title?.trim();
    const chunks = buildHymnSectionChunks(hymn.lyrics);
    const sections = chunks.flatMap((c, i) =>
      makeSection(
        picker,
        'hymn',
        {
          body: c.body,
          title,
          number: String(num),
          verseLabel: c.verseLabel,
          ...(c.amen ? { amen: c.amen } : {}),
        },
        `${itemId}-sec${i + 1}`,
        i === 0 && hymnTitle ? `${num}장 · ${hymnTitle}` : c.verseLabel,
      ),
    );
    return { id: itemId, title, sections, promptLayout: 'black-white' };
  };

  // 05. 찬송가 1 — 번호 입력 시
  if (form.hymn1Number.trim()) {
    const item = await buildHymnByNumber(form.hymn1Number);
    if (item) items.push(item);
  }

  // 06. 추가-나의 하나님 — 주일낮예배(1·2부)
  if (includeRegularProgram('my-god')) {
    items.push(buildSongItem(picker, nextId(SONG_MY_GOD.title), SONG_MY_GOD.title, SONG_MY_GOD.blocks));
  }

  // 07. 행복한 신앙생활 캠페인·교회소식 — 주일낮예배용 필드만 먼저 생성.
  if (includeRegularProgram('campaign')) {
    const campaignId = nextId('행복한신앙생활캠페인');
    items.push({
      id: campaignId,
      title: '행복한 신앙생활 캠페인',
      sections: makeSection(
        picker,
        'notice',
        { title: '행복한 신앙생활 캠페인', body: form.campaignText?.trim() ?? '' },
        `${campaignId}-section`,
        '행복한 신앙생활 캠페인',
      ),
      promptLayout: 'none',
    });
  }

  if (includeRegularProgram('church-news')) {
    const newsId = nextId('교회소식');
    items.push({
      id: newsId,
      title: '교회소식',
      sections: makeSection(
        picker,
        'notice',
        { title: '교회소식', body: form.churchNewsText?.trim() ?? '' },
        `${newsId}-section`,
        '교회소식',
      ),
      promptLayout: 'none',
    });
  }

  if (includeRegularProgram('hephzibah')) {
    const hephzibah = findSlideProgram('헵시바') ?? findSlideProgram('hephzibah');
    if (hephzibah) {
      addSlideItem(hephzibah, '헵시바 선교단');
    } else {
      warnings.push('헵시바 선교단 PPT 이미지가 없어 빈 프로그램을 생성했습니다.');
      items.push({
        id: nextId('헵시바선교단'),
        title: '헵시바 선교단',
        sections: [],
        promptLayout: 'none',
      });
    }
  }

  // 10. (예배일자)-설교대지 — 본문묵상은 이 프로그램 안에 포함한다.
  {
    const title = `${form.worshipDate}-설교대지`;
    const id = nextId('설교대지');
    const sections: Section[] = [];

    // 말씀타이틀 — 요절(본문 표기)을 올린다. 설교제목은 제목/본문 섹션에서 사용.
    //   [필드 누락 방지] 장절표기(reference) 슬롯 포함 — 어떤 슬롯을 지정한 템플릿이든 요절이 배치되게.
    sections.push(
      ...makeSection(
        picker,
        'wordTitle',
        {
          title: form.scriptureRef,
          reference: form.scriptureRef,
          scriptureRef: form.scriptureRef,
          speaker: form.preacher,
          body: form.scriptureRef,
        },
        `${id}-word-title`,
        '말씀타이틀',
      ),
    );

    // 본문묵상 — 별도 프로그램이 아니라 설교대지 안에서 말씀타이틀 다음에 배치.
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

    // 제목/본문 — 설교제목 + 본문 표기 + 요절 텍스트
    //   [필드 누락 방지] 장절표기(reference) 슬롯 포함.
    const keyVerseText =
      main && main.verses.length > 0
        ? main.verses.map((v) => stripHeadings(v.text)).join('\n')
        : '';
    sections.push(
      ...makeSection(
        picker,
        'titleScripture',
        {
          title: form.sermonTitle,
          scriptureRef: form.scriptureRef,
          reference: form.scriptureRef,
          body: keyVerseText || `${form.sermonTitle}\n${form.scriptureRef}`,
        },
        `${id}-title-scripture`,
        '제목/본문',
      ),
    );

    // 설교자 — 이름 + 소속 교회
    sections.push(
      ...makeSection(
        picker,
        'preacher',
        { name: form.preacher, church: form.churchName, body: form.preacher },
        `${id}-preacher`,
        '설교자',
      ),
    );

    // 설교대지 섹션(말씀타이틀·본문묵상·제목/본문·설교자)은 PMT 기본 꺼짐.
    items.push({ id, title, sections, promptLayout: 'none' });
  }

  // 11. 말씀찾기(인용) — 설교 후 입력 인용/대지타이틀 프로그램.
  {
    const quoteLines = form.quotesText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const id = nextId('말씀찾기인용');
    const sections: Section[] = [];
    let quoteNo = 0;
    let pointNo = 0;
    for (const line of quoteLines) {
      if (isScriptureRefLine(line)) {
        quoteNo += 1;
        const found = await fetchBible(`ref=${encodeURIComponent(line)}`);
        if (found && found.verses.length > 0) {
          // 인용도 1절씩 성경문구 템플릿을 적용하되, 본문 박스 넘침은 자동 분할한다.
          const refBase = found.reference.split(':')[0];
          for (const verse of found.verses) {
            sections.push(
              ...makeBibleSections(
                picker,
                {
                  body: stripHeadings(verse.text),
                  reference: `${refBase}:${verse.num}`,
                  // 말씀찾기(인용)은 여러 책장절을 섞어 쓰므로 본문 앞 절 번호 대신 헤더의 전체 책장절만 표시한다.
                  verse: '',
                },
                `${id}-q${quoteNo}-v${verse.num}`,
                `인용${quoteNo}-${verse.num}`,
                { splitStrategy: 'balanced' },
              ),
            );
          }
        } else {
          warnings.push(`인용 구절(${line})을 찾지 못해 표기만 넣었습니다.`);
          sections.push(
            ...makeBibleSections(
              picker,
              { body: line, reference: line },
              `${id}-q${quoteNo}`,
              `인용 ${quoteNo}`,
              { splitStrategy: 'balanced' },
            ),
          );
        }
      } else {
        pointNo += 1;
        sections.push(
          ...makeSection(
            picker,
            'pointTitle',
            { point: line, pointNumber: `${pointNo}`, body: line },
            `${id}-p${pointNo}`,
            `대지 ${pointNo}`,
          ),
        );
      }
    }
    items.push({ id, title: `${form.worshipDate}-말씀찾기(인용)`, sections, promptLayout: 'bible' });
  }

  // 12. 찬송가(설교 후) — 번호 입력 시
  if (form.hymn2Number.trim()) {
    const item = await buildHymnByNumber(form.hymn2Number);
    if (item) items.push(item);
  }

  // 13. 기존 폼의 추가 찬송가 — 설교 후 찬송가 뒤에 유지.
  for (const num of form.extraHymnNumbers ?? []) {
    if (!num.trim()) continue;
    const item = await buildHymnByNumber(num);
    if (item) items.push(item);
  }

  // 14. 목사님 찬양(설교 후) — PPT 변환본에서 곡명 검색.
  const pastorPraisePrograms = praiseNames
    .map((name) => ({ name, program: findSlideProgram(name) }))
    .filter((entry): entry is { name: string; program: SavedProgram } => Boolean(entry.program));
  praiseNames.forEach((name) => {
    if (!findSlideProgram(name)) skippedPraise.push(name);
  });
  if (pastorPraisePrograms.length > 0) {
    const first = pastorPraisePrograms[0].program;
    const id = nextId('목사님찬양');
    const sections = pastorPraisePrograms.flatMap(({ program }) =>
      program.item.sections.map((section) => ({
        ...section,
        id: `${id}-${section.id}`,
        elements: section.elements.map((element) => ({
          ...element,
          id: `${id}-${element.id}`,
        })),
      })),
    );
    items.push({ ...cloneSlideItem(first, id, '목사님 찬양'), sections });
    slideSources.set(id, first);
  }

  // 15. 오직 예수 — 추가 고정 찬양.
  if (includeRegularProgram('only-jesus')) {
    items.push(buildSongItem(picker, nextId(SONG_ONLY_JESUS.title), SONG_ONLY_JESUS.title, SONG_ONLY_JESUS.blocks));
  }

  // 16. 파송의 노래 — 기존 정기예배 조건 유지(주일오후예배).
  if (includeRegularProgram('sending-song')) {
    items.push(buildSongItem(picker, nextId(SONG_SENDING.title), SONG_SENDING.title, SONG_SENDING.blocks));
  }

  if (picker.missing.size > 0) {
    warnings.push(
      `템플릿 ${picker.selectedName} 미등록 카테고리(${[...picker.missing].join(', ')})는 basic-001 또는 기본 디자인으로 생성했습니다.`,
    );
  }

  // 프로그램 레코드 구성 (텍스트 프로그램)
  const savedPrograms: SavedProgram[] = items.map((item) => {
    const source = slideSources.get(item.id);
    return {
      id: item.id,
      type: source ? 'slide-images' : 'worship',
      worshipId,
      worshipName,
      formData: source
        ? { ...source.formData, preserveElements: true, templateName: picker.selectedName }
        : {
            generator: 'worship-service-v1',
            preserveElements: true,
            worshipType: form.worshipType,
            templateName: picker.selectedName,
            preparationPraiseProgramName: form.preparationPraiseProgramName.trim(),
            selectedRegularProgramIds: [...selectedRegularProgramIds],
            selectedFixedProgramIds: [...selectedFixedProgramIds],
            campaignText: form.campaignText?.trim() ?? '',
            churchNewsText: form.churchNewsText?.trim() ?? '',
          },
      item,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  // 서버 저장 — GET 이 updatedAt 내림차순 정렬이므로 역순으로 저장해
  // "워십 불러오기"에서 01번부터 순서대로 배치되게 한다.
  const summaries: GeneratedProgramSummary[] = savedPrograms.map((p) => ({
    title: p.item.title,
    sectionCount: p.item.sections.length,
    saved: false,
  }));
  for (let i = savedPrograms.length - 1; i >= 0; i--) {
    try {
      const res = await fetch('/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savedPrograms[i]),
      });
      summaries[i].saved = res.ok;
      if (!res.ok) warnings.push(`"${savedPrograms[i].item.title}" 저장 실패 (${res.status})`);
    } catch {
      warnings.push(`"${savedPrograms[i].item.title}" 저장 실패 (네트워크)`);
    }
  }

  return { worshipId, worshipName, programs: summaries, skippedPraise, warnings };
}

// ─── 다가오는 정기예배 자동 선택 ─────────────────────────────────────────────

/** 예배 시작 시각 — 이 시각이 지나면 해당 회차는 '지난 예배'로 보고 다음 회차로 넘어간다 */
const WORSHIP_START_TIMES: Record<string, { hour: number; minute: number; dayOfWeek: number | 'firstOfMonth' }> = {
  주일낮예배: { hour: 11, minute: 0, dayOfWeek: 0 },   // 1부 9시 · 2부 11시 — 2부 시작 전까지
  주일오후예배: { hour: 14, minute: 30, dayOfWeek: 0 },
  수요예배: { hour: 19, minute: 30, dayOfWeek: 3 },
  금요기도회: { hour: 20, minute: 30, dayOfWeek: 5 },
  월삭감사예배: { hour: 20, minute: 30, dayOfWeek: 'firstOfMonth' },
};

/** 지금 시점에서 가장 가까운(아직 시작 전인) 정기예배를 반환 */
export function getUpcomingWorshipType(now = new Date()): string {
  let best = '주일낮예배';
  let bestTime = Infinity;

  for (const [name, t] of Object.entries(WORSHIP_START_TIMES)) {
    let next: Date;
    if (t.dayOfWeek === 'firstOfMonth') {
      next = new Date(now.getFullYear(), now.getMonth(), 1, t.hour, t.minute);
      if (next.getTime() < now.getTime()) {
        next = new Date(now.getFullYear(), now.getMonth() + 1, 1, t.hour, t.minute);
      }
    } else {
      let ahead = t.dayOfWeek - now.getDay();
      if (ahead < 0) ahead += 7;
      next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, t.hour, t.minute);
      if (next.getTime() < now.getTime()) next.setDate(next.getDate() + 7);
    }
    if (next.getTime() < bestTime) {
      bestTime = next.getTime();
      best = name;
    }
  }
  return best;
}

// ─── 폼 미리보기용: 선택된 예배에 포함될 순서 목록 ──────────────────────────

export interface PlannedProgram {
  order: string;
  title: string;
  included: boolean;
  note: string;
  selectable?: boolean;
  regularProgramId?: RegularProgramId;
}

export function getPlannedPrograms(
  worshipType: string,
  opts: {
    hasHymn1: boolean;
    hasHymn2: boolean;
    hasQuotes: boolean;
    praiseCount: number;
    preparationPraiseCount: number;
    preparationPraiseProgramName: string;
    extraHymnCount?: number;
    selectedRegularProgramIds?: RegularProgramId[];
  },
): PlannedProgram[] {
  const regularOptions = getRegularProgramOptions(worshipType);
  const regularById = new Map(regularOptions.map((option) => [option.id, option]));
  const selectedRegularProgramIds = new Set(opts.selectedRegularProgramIds ?? []);
  const regularProgram = (id: RegularProgramId): PlannedProgram => {
    const option = regularById.get(id)!;
    return {
      order: '',
      title: option.title,
      included: option.eligible && selectedRegularProgramIds.has(id),
      note: option.note,
      selectable: option.eligible,
      regularProgramId: id,
    };
  };
  const extraHymns = Array.from({ length: opts.extraHymnCount ?? 0 }, (_, i) => ({
    order: `12-${i + 1}`,
    title: '추가 찬송가',
    included: true,
    note: '설교 후 뒤에 삽입',
  }));
  const king = regularProgram('king-my-god');
  const bless = regularProgram('bless-my-soul');
  const myGod = regularProgram('my-god');
  const campaign = regularProgram('campaign');
  const churchNews = regularProgram('church-news');
  const hephzibah = regularProgram('hephzibah');
  const onlyJesus = regularProgram('only-jesus');
  const sending = regularProgram('sending-song');
  return [
    { order: '00', title: '말씀찾기(본문) · 장 전체', included: true, note: '숨김 프로그램 — 섹션 1번부터, 번호 송출 시에만 표시' },
    { order: '01', title: opts.preparationPraiseProgramName.trim() || '준비찬양', included: opts.preparationPraiseCount > 0, note: '모든 정기예배 · PPT 변환본 검색' },
    { ...king, order: '02' },
    { ...bless, order: '03' },
    { order: '04', title: '사도신경', included: true, note: '템플릿 등록 전 수동 입력' },
    { order: '05', title: '찬송가 (설교 전)', included: opts.hasHymn1, note: '장 번호 입력 시' },
    { ...myGod, order: '06' },
    { ...campaign, order: '07' },
    { ...churchNews, order: '08' },
    { ...hephzibah, order: '09' },
    { order: '10', title: '설교대지', included: true, note: '말씀타이틀·본문묵상·제목/본문·설교자' },
    { order: '11', title: '말씀찾기(인용)', included: true, note: '인용 구절·대지타이틀 (입력 시)' },
    { order: '12', title: '찬송가 (설교 후)', included: opts.hasHymn2, note: '장 번호 입력 시' },
    ...extraHymns,
    { order: '14', title: `목사님 찬양 ${opts.praiseCount}곡`, included: opts.praiseCount > 0, note: '설교 후 · PPT 변환본 검색' },
    { ...onlyJesus, order: '15' },
    { ...sending, order: '16' },
  ];
}
