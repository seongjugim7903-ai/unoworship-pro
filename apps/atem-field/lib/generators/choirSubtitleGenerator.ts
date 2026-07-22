/**
 * lib/generators/choirSubtitleGenerator.ts
 * 찬양대 자막 요청 제너레이터
 *
 * 폼 입력 데이터를 UnoLive SetlistItem(프로그램) + Section[] 으로 변환.
 *
 * 디자인 우선순위:
 *   1. 디자인 등록 모달에서 캡처 → 서버 저장 (data/designs/choir.json)
 *   2. 코드 기본 디자인 (designs/choirDesign.ts)
 *
 * 가사 파싱 규칙:
 *   - 빈 줄(한 줄 이상 띄움)이 섹션 구분자
 *   - 빈 줄 사이의 텍스트 블록이 하나의 섹션
 *   - 각 섹션 내부의 줄바꿈은 그대로 유지 (송출 시 여러 줄 표시)
 */

import type { SetlistItem, Section } from '@/lib/types';
import type { CanvasElement } from '@/lib/canvasTypes';
import type { SavedProgram } from './programTypes';
import type { ProgramDesign } from './designs/index';
import { uploadToUnoLive, makeWorshipId, formatDateISO } from './worshipUploader';
import { CHOIR_DESIGN } from './designs/choirDesign';
import { loadDesignForProgram } from './designs/designLoader';

export interface ChoirSubtitleForm {
  worshipType: string;
  worshipDate: string;
  songTitle: string;
  composer: string;
  arranger: string;
  lyrics: string;
  note: string;
}

/**
 * 디자인 요소 ID 를 고유하게 복제 (같은 템플릿을 여러 섹션에 사용하므로)
 */
function cloneElements(elements: CanvasElement[], sectionIndex: number): CanvasElement[] {
  return elements.map((el) => ({
    ...el,
    id: `${el.id}-s${sectionIndex}-${Date.now()}`,
  }));
}

/**
 * 가사 텍스트를 섹션 배열로 파싱
 */
function parseLyricsToSections(lyrics: string, design: ProgramDesign): Section[] {
  const blocks = lyrics
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  return blocks.map((block, i) => ({
    id: `choir-sec-${i + 1}-${Date.now()}`,
    label: `${i + 1}절`,
    text: block,
    colorMark: '#ffffff',
    elements: cloneElements(design.defaultSection.elements, i + 1),
  }));
}

/**
 * 폼 데이터 → SetlistItem 변환
 */
function generateChoirItem(form: ChoirSubtitleForm, design: ProgramDesign): SetlistItem {
  const sections = parseLyricsToSections(form.lyrics, design);

  const coverText = [
    form.songTitle,
    form.composer ? `작곡: ${form.composer}` : '',
    form.arranger ? `편곡: ${form.arranger}` : '',
  ].filter(Boolean).join('\n');

  const coverDesign = design.coverSection ?? design.defaultSection;

  const coverSection: Section = {
    id: `choir-cover-${Date.now()}`,
    label: '표지',
    text: coverText,
    colorMark: '#facc15',
    elements: cloneElements(coverDesign.elements, 0),
  };

  const allSections = [coverSection, ...sections];
  if (form.note.trim()) {
    allSections.push({
      id: `choir-note-${Date.now()}`,
      label: '비고',
      text: form.note.trim(),
      colorMark: '#94a3b8',
      elements: [],
    });
  }

  return {
    id: `choir-${form.worshipDate}-${Date.now()}`,
    title: `[찬양대] ${form.songTitle}`,
    sections: allSections,
    promptLayout: design.promptLayout,
    ...(design.subtitleStyle ? { style: design.subtitleStyle } : {}),
  };
}

/**
 * 찬양대 자막 요청 → UnoLive 등록 + 서버 저장 (end-to-end)
 *
 * 1. 서버 디자인 로드 (없으면 코드 기본값 사용)
 * 2. SetlistItem 생성
 * 3. UnoLive 스토어 등록
 * 4. 서버에 프로그램 저장
 */
export async function submitChoirSubtitle(form: ChoirSubtitleForm, editId?: string): Promise<{
  setlistId: string;
  itemId: string;
  sectionCount: number;
  worshipId: string;
  item: SetlistItem;
}> {
  // 1. 디자인 로드 (서버 우선 → 코드 기본값 폴백)
  let design: ProgramDesign;
  try {
    design = await loadDesignForProgram('choir');
  } catch {
    design = CHOIR_DESIGN;
  }

  // 2. SetlistItem 생성
  const item = generateChoirItem(form, design);
  if (editId) item.id = editId;

  const worshipId = makeWorshipId(form.worshipDate, form.worshipType);
  const worshipName = `${formatDateISO(form.worshipDate).replace(/-/g, '.')} ${form.worshipType}`;
  const dateISO = formatDateISO(form.worshipDate);

  // 3. UnoLive 클라이언트 스토어에 등록
  const result = uploadToUnoLive(worshipId, worshipName, dateISO, item);

  // 4. 서버에 저장
  const savedProgram: SavedProgram = {
    id: item.id,
    type: 'choir',
    worshipId,
    worshipName,
    formData: form as unknown as Record<string, unknown>,
    item,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  try {
    const method = editId ? 'PUT' : 'POST';
    const url = editId ? `/api/programs/${editId}` : '/api/programs';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(savedProgram) });
  } catch (err) {
    console.warn('[choirSubtitleGenerator] 서버 저장 실패 (로컬 등록은 완료):', err);
  }

  return { ...result, sectionCount: item.sections.length, worshipId, item };
}
