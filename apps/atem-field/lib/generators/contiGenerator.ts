/**
 * lib/generators/contiGenerator.ts
 * 찬양콘티 작성 데이터를 UnoLive SetlistItem + 서버 프로그램 형태로 변환한다.
 */

import type { SetlistItem, Section } from '@/lib/types';
import type { CanvasElement } from '@/lib/canvasTypes';
import type {
  GeneratedScoreOutputType,
  ScoreAnalysis,
  ScoreLicenseStatus,
  ScoreSourceType,
} from '@/lib/score-analysis/types';
import { analyzeContiFlow, type ContiFlowSegment } from '@/lib/score-analysis/contiFlowAnalyzer';
import type { SavedProgram } from './programTypes';
import type { ProgramDesign } from './designs/index';
import { CONTI_DESIGN } from './designs/contiDesign';
import { loadDesignForProgram } from './designs/designLoader';
import { uploadToUnoLive, makeWorshipId, formatDateISO } from './worshipUploader';

export interface WorshipContiSongForm {
  id: string;
  order: number;
  title: string;
  lyricist: string;
  composer: string;
  arranger: string;
  originalKey: string;
  targetKey: string;
  tempo: string;
  sourceType: ScoreSourceType;
  sourceName: string;
  /** 브라우저 로컬 미리보기 전용. 저장/API 전송에서는 제외한다. */
  sourcePreviewDataUrl?: string;
  sourcePreviewMimeType?: string;
  licenseStatus: ScoreLicenseStatus;
  lyrics: string;
  flowPattern: string;
  flowSections: ContiFlowSegment[];
  memo: string;
  outputTypes: GeneratedScoreOutputType[];
}

export interface WorshipContiForm {
  worshipType: string;
  worshipDate: string;
  worshipTitle: string;
  programName: string;
  leaderName: string;
  serviceTheme: string;
  note: string;
  songs: WorshipContiSongForm[];
}

export interface WorshipContiSubmitResult {
  setlistId: string;
  itemId: string;
  sectionCount: number;
  analysisCount: number;
  outputCount: number;
  serverSaved: boolean;
  serverError?: string;
}

function cloneElements(elements: CanvasElement[], sectionId: string): CanvasElement[] {
  return elements.map((el) => ({
    ...el,
    id: `${el.id}-${sectionId}-${Date.now()}`,
  }));
}

function splitLyricsBlocks(lyrics: string): string[] {
  return lyrics
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function buildScoreAnalysisFromSong(song: WorshipContiSongForm): ScoreAnalysis {
  // v1 stores worship-conti metadata only. OMR parsing and actual note/chord transposition
  // must happen in a separate score-analysis engine before this can produce real score files.
  const flow = song.flowSections?.length
    ? { segments: song.flowSections }
    : analyzeContiFlow(song.lyrics, song.flowPattern);
  const lyricsBlocks = flow.segments.map((segment) => ({
    label: segment.code === 'c'
      ? 'chorus' as const
      : segment.code === 'b'
        ? 'bridge' as const
        : segment.code === 'e'
          ? 'ending' as const
          : segment.code.startsWith('v')
            ? 'verse' as const
            : 'other' as const,
    text: segment.text,
  }));

  const sourceAssetId = song.sourceName
    ? `${song.sourceType}:${song.sourceName}`
    : undefined;
  const parsedTempo = song.tempo ? Number(song.tempo) : undefined;

  return {
    id: `analysis-${song.id}`,
    sourceType: song.sourceType,
    sourceAssetId,
    title: song.title.trim(),
    lyricist: song.lyricist.trim() || undefined,
    composer: song.composer.trim() || undefined,
    arranger: song.arranger.trim() || undefined,
    originalKey: song.originalKey || undefined,
    detectedKey: song.originalKey || undefined,
    targetKey: song.targetKey || undefined,
    tempo: Number.isFinite(parsedTempo) ? parsedTempo : undefined,
    timeSignature: undefined,
    lyricsBlocks,
    chordTimeline: [],
    melodyHints: [],
    pageImages: sourceAssetId
      ? [{ page: 1, assetId: sourceAssetId, width: 0, height: 0 }]
      : [],
    confidence: {
      metadata: song.title.trim() ? 0.75 : 0.2,
      lyrics: lyricsBlocks.length ? 0.65 : 0.1,
      chords: song.originalKey || song.targetKey ? 0.35 : 0.1,
      melody: 0.1,
    },
    copyright: {
      licenseStatus: song.licenseStatus,
    },
  };
}

function makeSongSectionText(song: WorshipContiSongForm): string {
  const keyLine = [song.originalKey && `원조 ${song.originalKey}`, song.targetKey && `목표 ${song.targetKey}`]
    .filter(Boolean)
    .join(' → ');
  const meta = [
    keyLine,
    song.tempo && `Tempo ${song.tempo}`,
    song.flowPattern && `구조 ${song.flowPattern}`,
    song.memo.trim(),
  ].filter(Boolean);

  const firstLyricsBlock = song.flowSections?.[0]?.text || splitLyricsBlocks(song.lyrics)[0] || '';

  return [
    `${song.order}. ${song.title.trim()}`,
    meta.length ? meta.join(' · ') : '',
    firstLyricsBlock,
  ].filter(Boolean).join('\n');
}

function generateContiItem(form: WorshipContiForm, design: ProgramDesign): SetlistItem {
  const coverDesign = design.coverSection ?? design.defaultSection;
  const coverText = [
    form.programName || '예배 전 찬양',
    form.worshipTitle || form.worshipType,
    `${formatDateISO(form.worshipDate).replace(/-/g, '.')} ${form.worshipType}`,
    form.leaderName ? `콘티: ${form.leaderName}` : '',
    form.serviceTheme ? `주제: ${form.serviceTheme}` : '',
    `${form.songs.length}곡`,
  ].filter(Boolean).join('\n');

  const coverSection: Section = {
    id: `conti-cover-${Date.now()}`,
    label: '표지',
    text: coverText,
    colorMark: '#facc15',
    elements: cloneElements(coverDesign.elements, 'cover'),
  };

  const songSections: Section[] = form.songs
    .sort((a, b) => a.order - b.order)
    .map((song) => ({
      id: `conti-song-${song.order}-${Date.now()}`,
      label: `${song.order}. ${song.title.trim()}`,
      text: makeSongSectionText(song),
      colorMark: '#ffffff',
      elements: cloneElements(design.defaultSection.elements, song.id),
    }));

  const noteSection: Section | null = form.note.trim()
    ? {
        id: `conti-note-${Date.now()}`,
        label: '비고',
        text: form.note.trim(),
        colorMark: '#94a3b8',
        elements: [],
      }
    : null;

  return {
    id: `conti-${form.worshipDate}-${Date.now()}`,
    title: `[${form.programName || '예배 전 찬양'}] ${form.worshipTitle || form.worshipType}`,
    sections: noteSection ? [coverSection, ...songSections, noteSection] : [coverSection, ...songSections],
    promptLayout: design.promptLayout,
    ...(design.subtitleStyle ? { style: design.subtitleStyle } : {}),
  };
}

export async function submitWorshipConti(
  form: WorshipContiForm,
  editId?: string
): Promise<WorshipContiSubmitResult> {
  let design: ProgramDesign;
  try {
    design = await loadDesignForProgram('conti');
  } catch {
    design = CONTI_DESIGN;
  }

  const item = generateContiItem(form, design);
  if (editId) item.id = editId;

  const worshipId = makeWorshipId(form.worshipDate, form.worshipType);
  const worshipName = `${formatDateISO(form.worshipDate).replace(/-/g, '.')} ${form.worshipType}`;
  const dateISO = formatDateISO(form.worshipDate);
  const result = uploadToUnoLive(worshipId, worshipName, dateISO, item);

  const analyses = form.songs.map(buildScoreAnalysisFromSong);
  const flowAnalyses = form.songs.map((song) => ({
    songId: song.id,
    title: song.title,
    pattern: song.flowPattern,
    sections: song.flowSections,
  }));
  const outputCount = form.songs.reduce((sum, song) => sum + song.outputTypes.length, 0);
  const persistableSongs = form.songs.map((song) => {
    const { sourcePreviewDataUrl, sourcePreviewMimeType, ...rest } = song;
    void sourcePreviewDataUrl;
    void sourcePreviewMimeType;
    return rest;
  });
  const persistableForm = {
    ...form,
    songs: persistableSongs,
  };
  const savedProgram: SavedProgram = {
    id: item.id,
    type: 'conti',
    worshipId,
    worshipName,
    formData: {
      ...persistableForm,
      scoreAnalyses: analyses,
      flowAnalyses,
    },
    item,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  let serverSaved = false;
  let serverError: string | undefined;
  try {
    const method = editId ? 'PUT' : 'POST';
    const url = editId ? `/api/programs/${editId}` : '/api/programs';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savedProgram),
    });
    serverSaved = res.ok;
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      serverError = body?.error ? String(body.error) : `HTTP ${res.status}`;
    }
  } catch (err) {
    serverError = err instanceof Error ? err.message : String(err);
  }

  return {
    ...result,
    sectionCount: item.sections.length,
    analysisCount: analyses.length,
    outputCount,
    serverSaved,
    serverError,
  };
}
