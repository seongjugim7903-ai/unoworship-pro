'use client';

/**
 * WorshipContiWorkspace — 찬양콘티 작성 워크스페이스
 *
 * 최상단 예배 상태바 + 좌측 곡명 리스트 + 중앙 콘티 플로우 + 우측 악보 생성 리스트.
 * 주간 주보정보는 현재 mock worship 데이터에서 읽고, 향후 church scope 주보 DB로 교체한다.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Database,
  ExternalLink,
  FileImage,
  FileText,
  Library,
  MonitorUp,
  Music2,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Smartphone,
  Tablet,
  Trash2,
  Upload,
  Users,
  Wand2,
} from 'lucide-react';
import CopyrightComplianceNotice from '@/components/compliance/CopyrightComplianceNotice';
import { useMediaStore } from '@/lib/media/mediaStore';
import type { Worship } from '@/lib/media/mediaTypes';
import {
  buildScoreAnalysisFromSong,
  submitWorshipConti,
  type WorshipContiForm,
  type WorshipContiSongForm,
  type WorshipContiSubmitResult,
} from '@/lib/generators/contiGenerator';
import {
  SCORE_OUTPUT_LABELS,
  type GeneratedScoreOutputType,
  type ScoreLicenseStatus,
  type ScoreSourceType,
} from '@/lib/score-analysis/types';
import {
  analyzeContiFlow,
  type ContiFlowAnalysis,
  type ContiFlowSegment,
} from '@/lib/score-analysis/contiFlowAnalyzer';
import {
  buildTransposedChordSheet,
  detectLikelyOriginalKey,
  type TransposedChordSheet,
} from '@/lib/score-analysis/chordTransposer';
import {
  DEFAULT_REGULAR_WORSHIPS,
  WORSHIP_OTHER_VALUE,
  WORSHIP_SELECT_OPTIONS,
  formatYYYYMMDD,
  getNextRegularWorshipDate,
  getWorshipSelectValue,
} from '@/lib/media/worshipDefaults';

const DRAFT_KEY = 'unolive:worship-conti:draft:v2';
const PROGRAM_NAME = '예배 전 찬양';

const DEFAULT_OUTPUT_TYPES: GeneratedScoreOutputType[] = [
  'transposed-score',
  'tablet-score',
  'vocal-practice',
  'congregation-score',
];

const KEY_OPTIONS = [
  '',
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
  'Cm',
  'C#m',
  'Dm',
  'Ebm',
  'Em',
  'Fm',
  'F#m',
  'Gm',
  'G#m',
  'Am',
  'Bbm',
  'Bm',
];

const SOURCE_OPTIONS: Array<{
  type: ScoreSourceType;
  label: string;
  icon: typeof Upload;
  accept?: string;
}> = [
  { type: 'database', label: 'DB', icon: Database },
  { type: 'pdf', label: 'PDF', icon: FileText, accept: 'application/pdf' },
  { type: 'image', label: '이미지', icon: FileImage, accept: 'image/*' },
  { type: 'manual', label: '직접', icon: Music2 },
];

const LICENSE_OPTIONS: Array<{ value: ScoreLicenseStatus; label: string }> = [
  { value: 'unknown', label: '확인 필요' },
  { value: 'church-owned', label: '교회 보유' },
  { value: 'licensed', label: '라이선스 있음' },
  { value: 'public-domain', label: '퍼블릭 도메인' },
];

const OUTPUT_OPTIONS: Array<{
  type: GeneratedScoreOutputType;
  description: string;
  icon: typeof RefreshCcw;
  color: string;
}> = [
  {
    type: 'transposed-score',
    description: '가사/코드 초안을 목표조 코드 악보로 렌더링',
    icon: RefreshCcw,
    color: 'border-sky-200 bg-sky-50 text-sky-800',
  },
  {
    type: 'tablet-score',
    description: 'iPad/Galaxy Tab 전자 악보 넘김',
    icon: Tablet,
    color: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  {
    type: 'vocal-practice',
    description: '모바일 전용 한 주간 보컬 연습용',
    icon: Smartphone,
    color: 'border-rose-200 bg-rose-50 text-rose-800',
  },
  {
    type: 'congregation-score',
    description: '회중용 큰 글자 코드/가사 악보 렌더링',
    icon: Users,
    color: 'border-amber-200 bg-amber-50 text-amber-900',
  },
];

function toYYYYMMDD(date: Date): string {
  return formatYYYYMMDD(date);
}

function toInputDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return '';
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function toDisplayDate(yyyymmdd: string): string {
  const input = toInputDate(yyyymmdd);
  if (!input) return yyyymmdd;
  return new Date(`${input}T00:00:00`).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function makeSongId(): string {
  return `conti-song-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createEmptySong(order: number): WorshipContiSongForm {
  return {
    id: makeSongId(),
    order,
    title: '',
    lyricist: '',
    composer: '',
    arranger: '',
    originalKey: '',
    targetKey: '',
    tempo: '',
    sourceType: 'manual',
    sourceName: '',
    sourcePreviewDataUrl: undefined,
    sourcePreviewMimeType: undefined,
    licenseStatus: 'unknown',
    lyrics: '',
    flowPattern: '',
    flowSections: [],
    memo: '',
    outputTypes: [...DEFAULT_OUTPUT_TYPES],
  };
}

function createInitialForm(): WorshipContiForm {
  const defaultWorship = DEFAULT_REGULAR_WORSHIPS[0].value;
  return {
    worshipType: defaultWorship,
    worshipDate: formatYYYYMMDD(getNextRegularWorshipDate(defaultWorship)),
    worshipTitle: `${defaultWorship} 찬양콘티`,
    programName: PROGRAM_NAME,
    leaderName: '',
    serviceTheme: '',
    note: '',
    songs: [],
  };
}

function sortSongs(songs: WorshipContiSongForm[]): WorshipContiSongForm[] {
  return [...songs]
    .sort((a, b) => a.order - b.order)
    .map((song, index) => ({ ...song, order: index + 1 }));
}

function getWorshipDate(worship: Worship): string {
  return toYYYYMMDD(new Date(worship.startAt));
}

function getSongFlow(song: WorshipContiSongForm | null): ContiFlowAnalysis {
  if (!song) return analyzeContiFlow('');
  if (song.flowSections.length) {
    return {
      pattern: song.flowPattern || song.flowSections.map((section) => section.code).join('-'),
      segments: song.flowSections,
      confidence: song.flowSections.length
        ? song.flowSections.reduce((sum, section) => sum + section.confidence, 0) / song.flowSections.length
        : 0,
    };
  }
  return analyzeContiFlow(song.lyrics, song.flowPattern);
}

function normalizeSong(song: WorshipContiSongForm): WorshipContiSongForm {
  const flow = analyzeContiFlow(song.lyrics, song.flowPattern);
  return {
    ...song,
    title: song.title.trim(),
    flowPattern: flow.pattern,
    flowSections: flow.segments,
  };
}

function hydrateSong(song: Partial<WorshipContiSongForm>, order: number): WorshipContiSongForm {
  const merged = {
    ...createEmptySong(order),
    ...song,
    order,
    id: song.id || makeSongId(),
    flowSections: song.flowSections || [],
    outputTypes: song.outputTypes?.length
      ? song.outputTypes
      : [...DEFAULT_OUTPUT_TYPES],
  };
  return normalizeSong(merged);
}

function hydrateForm(draft: Partial<WorshipContiForm>): WorshipContiForm {
  const initial = createInitialForm();
  return {
    ...initial,
    ...draft,
    programName: draft.programName || PROGRAM_NAME,
    songs: sortSongs((draft.songs || []).map((song, index) => hydrateSong(song, index + 1))),
  };
}

function stripPreviewData(form: WorshipContiForm): WorshipContiForm {
  return {
    ...form,
    songs: form.songs.map((song) => ({
      ...song,
      sourcePreviewDataUrl: undefined,
      sourcePreviewMimeType: undefined,
    })),
  };
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('이미지를 읽을 수 없습니다.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('이미지 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

function filenameToTitle(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function licenseLabel(status: ScoreLicenseStatus): string {
  return LICENSE_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function outputModeLabel(type: GeneratedScoreOutputType): string {
  if (type === 'transposed-score') return '조옮김 저장본';
  if (type === 'tablet-score') return '태블릿 넘김';
  if (type === 'vocal-practice') return '모바일 보컬 연습';
  return '회중용';
}

function scorePreviewClass(type: GeneratedScoreOutputType): string {
  if (type === 'tablet-score') return 'score tablet';
  if (type === 'vocal-practice') return 'score mobile';
  if (type === 'congregation-score') return 'score congregation';
  return 'score transposed';
}

function scoreGenerationNotice(type: GeneratedScoreOutputType, sheet?: TransposedChordSheet): string {
  if (type === 'transposed-score') {
    if (!sheet?.canTranspose) {
      return '조옮김 악보를 만들려면 원조와 목표조가 모두 필요합니다. 업로드 줄의 원조/옮길 조를 선택하거나 가사/코드 초안 첫 코드로 원조를 추정할 수 있습니다.';
    }
    if (sheet.transposedChordCount > 0) {
      if (sheet.inferredOriginalKey) {
        return `가사/코드 초안에서 원조를 ${sheet.inferredOriginalKey}로 추정하고, 코드 ${sheet.transposedChordCount}개를 목표조로 조옮김했습니다.`;
      }
      return `가사/코드 초안에서 코드 ${sheet.transposedChordCount}개를 목표조로 조옮김했습니다. PNG 이미지의 음표/조표 직접 변환은 OMR 연결 후 진행됩니다.`;
    }
    return '목표조는 선택되었지만 가사/코드 초안에서 조옮김할 코드가 아직 없습니다. PNG 이미지의 음표/조표 직접 변환은 OMR 연결 후 진행됩니다.';
  }
  if (type === 'congregation-score') {
    if (sheet?.transposedChordCount) {
      return `회중용 큰 글자 악보에 조옮김 코드 ${sheet.transposedChordCount}개를 반영했습니다.`;
    }
    return '회중용 악보는 원본 이미지 대신 코드/가사 시트로 생성합니다. 코드가 없으면 가사 중심 시트로 표시됩니다.';
  }
  if (type === 'vocal-practice') {
    return '현재 보컬 연습용은 모바일 화면 미리보기입니다. 실제 멜로디 가이드 오디오/MIDI 생성은 분석 엔진 연결 후 활성화됩니다.';
  }
  return '현재 태블릿 악보는 업로드 원본 이미지 기반 미리보기입니다. 페이지 번들/전자 넘김 저장은 다음 단계에서 연결됩니다.';
}

function scoreGenerationBadge(type: GeneratedScoreOutputType): string {
  if (type === 'transposed-score' || type === 'congregation-score') return '코드 조옮김';
  if (type === 'vocal-practice') return '오디오 미연결';
  return '미리보기';
}

function createSampleScoreDataUrl(): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
      <rect width="1200" height="1600" fill="#fffef8"/>
      <text x="600" y="110" font-family="Arial, sans-serif" font-size="52" font-weight="700" text-anchor="middle" fill="#111827">Sample Worship Score</text>
      <text x="600" y="165" font-family="Arial, sans-serif" font-size="26" text-anchor="middle" fill="#64748b">Original Key C · Target Key D · 72 BPM</text>
      ${[0, 1, 2, 3].map((system) => {
        const y = 280 + system * 285;
        const lines = [0, 18, 36, 54, 72].map((offset) => `<line x1="120" y1="${y + offset}" x2="1080" y2="${y + offset}" stroke="#334155" stroke-width="3"/>`).join('');
        const notes = [210, 320, 430, 540, 650, 760, 870, 980].map((x, i) => {
          const noteY = y + 54 - ((i + system) % 5) * 9;
          return `<g><ellipse cx="${x}" cy="${noteY}" rx="18" ry="13" fill="#111827" transform="rotate(-12 ${x} ${noteY})"/><line x1="${x + 16}" y1="${noteY}" x2="${x + 16}" y2="${noteY - 92}" stroke="#111827" stroke-width="5"/></g>`;
        }).join('');
        const lyrics = `<text x="120" y="${y + 125}" font-family="Arial, sans-serif" font-size="28" fill="#111827">Verse ${system + 1}  Amazing love flows through this place</text>`;
        return `<g>${lines}${notes}${lyrics}</g>`;
      }).join('')}
      <text x="120" y="1450" font-family="Arial, sans-serif" font-size="24" fill="#94a3b8">UnoLive test-only score image. Not a copyrighted hymn.</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function renderGeneratedScoreMarkup(
  song: WorshipContiSongForm,
  sheet: TransposedChordSheet,
  flow: ContiFlowAnalysis,
  type: GeneratedScoreOutputType
): string {
  const isCongregation = type === 'congregation-score';
  const lineMarkup = sheet.lines
    .map((line, index) => {
      if (line.type === 'blank') return '<div class="chart-line blank">&nbsp;</div>';
      return `<div class="chart-line ${line.type}" data-line="${index + 1}">${escapeHtml(line.text)}</div>`;
    })
    .join('');
  const flowSystems = flow.segments.length
    ? flow.segments
    : [{ id: 'flow-empty', code: 'v1', label: '1절', text: song.lyrics }];
  const staffMarkup = flowSystems.map((segment) => `
    <div class="staff-system">
      <div class="staff-title">${escapeHtml(segment.code.toUpperCase())} · ${escapeHtml(segment.label)}</div>
      <div class="staff-lines">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
      <p>${escapeHtml(segment.text || '코드/가사 초안 또는 OMR 분석 결과가 들어오면 이 위치에 악보가 생성됩니다.')}</p>
    </div>
  `).join('');

  return `
    <div class="generated-sheet ${isCongregation ? 'congregation-sheet' : ''}">
      <header class="sheet-head">
        <div>
          <p>${isCongregation ? '회중용 코드/가사 악보' : '조옮김 코드 악보'}</p>
          <h3>${escapeHtml(song.title || '제목 미입력')}</h3>
        </div>
        <div class="key-stamp">${escapeHtml(song.targetKey || '목표조')}</div>
      </header>
      <div class="sheet-meta">
        <span>원조 ${escapeHtml(sheet.originalKey || '미지정')}${sheet.inferredOriginalKey ? ' 추정' : ''}</span>
        <span>목표 ${escapeHtml(song.targetKey || '미지정')}</span>
        <span>${sheet.transposedChordCount > 0 ? `${sheet.transposedChordCount}개 코드 조옮김` : '코드 데이터 대기'}</span>
      </div>
      ${lineMarkup.trim()
        ? `<div class="chart">${lineMarkup}</div>`
        : `<div class="sheet-empty">${staffMarkup}</div>`}
      ${sheet.transposedChordCount > 0
        ? ''
        : `<div class="sheet-empty">${staffMarkup}</div>`}
    </div>
  `;
}

export default function WorshipContiWorkspace() {
  const currentMember = useMediaStore((s) => s.getCurrentMember());
  const worships = useMediaStore((s) => s.worships);
  const nextWorship = useMediaStore((s) => s.getNextWorship());

  const [form, setForm] = useState<WorshipContiForm>(() => createInitialForm());
  const [songDraft, setSongDraft] = useState<WorshipContiSongForm>(() => createEmptySong(1));
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [editingSongId, setEditingSongId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draftScoresGenerated, setDraftScoresGenerated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<WorshipContiSubmitResult | null>(null);

  useEffect(() => {
    if (currentMember?.name) {
      setForm((prev) => prev.leaderName ? prev : { ...prev, leaderName: currentMember.name });
    }
  }, [currentMember?.name]);

  useEffect(() => {
    if (!nextWorship || form.songs.length > 0) return;
    setForm((prev) => ({
      ...prev,
      worshipType: nextWorship.title,
      worshipTitle: `${nextWorship.title} 찬양콘티`,
      worshipDate: getWorshipDate(nextWorship),
    }));
  }, [nextWorship, form.songs.length]);

  const sortedWorships = useMemo(
    () => [...worships].sort((a, b) => a.startAt - b.startAt),
    [worships]
  );
  const sortedSongs = useMemo(() => sortSongs(form.songs), [form.songs]);
  const activeSong = useMemo(
    () => sortedSongs.find((song) => song.id === activeSongId) ?? sortedSongs[0] ?? null,
    [activeSongId, sortedSongs]
  );
  const activeIndex = activeSong ? sortedSongs.findIndex((song) => song.id === activeSong.id) : -1;
  const nextSong = activeIndex >= 0 ? sortedSongs[activeIndex + 1] ?? null : null;
  const selectedSource = SOURCE_OPTIONS.find((source) => source.type === songDraft.sourceType);
  const worshipSelectValue = getWorshipSelectValue(form.worshipType);
  const selectedWeeklyWorship = sortedWorships.find((worship) => worship.title === form.worshipType);
  const currentFlow = editingSongId || !activeSong ? getSongFlow(songDraft) : getSongFlow(activeSong);
  const analyses = useMemo(
    () => sortedSongs.map(buildScoreAnalysisFromSong),
    [sortedSongs]
  );
  const outputCount = sortedSongs.reduce((sum, song) => sum + song.outputTypes.length, 0);
  const canSubmit = Boolean(form.worshipType.trim() && form.worshipDate && sortedSongs.length);
  const editing = Boolean(editingSongId);

  const updateSongDraft = <K extends keyof WorshipContiSongForm>(key: K, value: WorshipContiSongForm[K]) => {
    setSongDraft((prev) => ({ ...prev, [key]: value }));
  };

  const applyFlowToDraft = (pattern?: string) => {
    setSongDraft((prev) => {
      const flow = analyzeContiFlow(prev.lyrics, pattern ?? prev.flowPattern);
      return {
        ...prev,
        flowPattern: flow.pattern,
        flowSections: flow.segments,
      };
    });
  };

  const handleWorshipTypeSelect = (value: string) => {
    if (value === WORSHIP_OTHER_VALUE) {
      const previousCustom = worshipSelectValue === WORSHIP_OTHER_VALUE && form.worshipType !== WORSHIP_OTHER_VALUE
        ? form.worshipType
        : '';
      setForm((prev) => ({
        ...prev,
        worshipType: previousCustom,
        worshipTitle: previousCustom ? `${previousCustom} 찬양콘티` : prev.worshipTitle,
      }));
      return;
    }

    const matched = sortedWorships.find((worship) => worship.title === value);
    setForm((prev) => ({
      ...prev,
      worshipType: value,
      worshipDate: matched ? getWorshipDate(matched) : formatYYYYMMDD(getNextRegularWorshipDate(value)),
      worshipTitle: `${value} 찬양콘티`,
    }));
  };

  const toggleOutput = (type: GeneratedScoreOutputType) => {
    setSongDraft((prev) => {
      const outputTypes = prev.outputTypes.includes(type)
        ? prev.outputTypes.filter((item) => item !== type)
        : [...prev.outputTypes, type];
      return { ...prev, outputTypes };
    });
  };

  const handleScoreFiles = async (files: File[]) => {
    const names = files.map((file) => file.name).join(', ');
    const image = files.find((file) => file.type.startsWith('image/'));

    if (!image) {
      setSongDraft((prev) => ({
        ...prev,
        sourceName: names,
        sourcePreviewDataUrl: undefined,
        sourcePreviewMimeType: undefined,
      }));
      setDraftScoresGenerated(false);
      return;
    }

    try {
      const dataUrl = await readImageAsDataUrl(image);
      setSongDraft((prev) => ({
        ...prev,
        title: prev.title || filenameToTitle(image.name) || '업로드 악보 테스트',
        sourceType: 'image',
        sourceName: names || image.name,
        sourcePreviewDataUrl: dataUrl,
        sourcePreviewMimeType: image.type,
        outputTypes: [...DEFAULT_OUTPUT_TYPES],
      }));
      setDraftScoresGenerated(false);
      setMessage('PNG 악보 이미지가 준비되었습니다. 옮길 조를 선택한 뒤 악보생성 하기를 눌러 주세요.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '이미지 미리보기를 만들지 못했습니다.');
    }
  };

  const generateDraftScores = () => {
    if (!songDraft.sourcePreviewDataUrl) {
      setMessage('먼저 PNG/JPG 악보 이미지를 업로드해 주세요.');
      return;
    }

    const inferredOriginalKey = songDraft.originalKey ? undefined : detectLikelyOriginalKey(songDraft.lyrics);
    setSongDraft((prev) => ({
      ...prev,
      originalKey: prev.originalKey || inferredOriginalKey || '',
      targetKey: prev.targetKey || 'D',
      outputTypes: [...DEFAULT_OUTPUT_TYPES],
    }));
    setDraftScoresGenerated(true);
    setMessage(inferredOriginalKey
      ? `가사/코드 초안에서 원조를 ${inferredOriginalKey}로 추정했습니다. 조옮김 코드 악보로 열립니다.`
      : '악보 4가지 미리보기 테스트가 준비되었습니다. 원조를 선택하거나 가사/코드 초안 첫 코드로 원조를 추정할 수 있습니다.');
  };

  const getDraftPreviewSong = (): WorshipContiSongForm => normalizeSong({
    ...songDraft,
    title: songDraft.title.trim()
      || filenameToTitle(songDraft.sourceName.split(',')[0] ?? '')
      || '업로드 악보 테스트',
    outputTypes: songDraft.outputTypes.length ? songDraft.outputTypes : [...DEFAULT_OUTPUT_TYPES],
  });

  const previewDraftScore = (type: GeneratedScoreOutputType) => {
    if (!songDraft.sourcePreviewDataUrl) {
      setMessage('먼저 PNG/JPG 악보 이미지를 업로드해 주세요.');
      return;
    }
    openScorePreview(getDraftPreviewSong(), type);
  };

  const loadSampleScore = () => {
    const flow = analyzeContiFlow(`[1절]\nC        G/B      Am\nAmazing love flows through this place\n\n[후렴]\nF        C/E      Dm   G\nWe sing together, we lift Your name\n\n[2절]\nC        G/B      Am\nGrace is rising in every heart\n\n[후렴]\nF        C/E      Dm   G\nWe sing together, we lift Your name\n\n[브릿지]\nAm       G        F\nHigher and higher our praises rise\n\n[후렴]\nF        C/E      Dm   G\nWe sing together, we lift Your name`);
    setSongDraft((prev) => ({
      ...prev,
      title: prev.title || 'Sample Worship Score',
      lyricist: prev.lyricist || 'UnoLive Test',
      composer: prev.composer || 'UnoLive Test',
      arranger: prev.arranger || 'UnoLive Plus',
      originalKey: prev.originalKey || 'C',
      targetKey: prev.targetKey || 'D',
      tempo: prev.tempo || '72',
      sourceType: 'image',
      sourceName: 'unolive-sample-score.svg',
      sourcePreviewDataUrl: createSampleScoreDataUrl(),
      sourcePreviewMimeType: 'image/svg+xml',
      licenseStatus: 'public-domain',
      lyrics: flow.segments.map((segment) => `[${segment.label}]\n${segment.text}`).join('\n\n'),
      flowPattern: flow.pattern,
      flowSections: flow.segments,
      outputTypes: [...DEFAULT_OUTPUT_TYPES],
    }));
    setDraftScoresGenerated(false);
    setMessage('샘플 악보 이미지가 준비되었습니다. 옮길 조를 선택한 뒤 악보생성 하기를 눌러 주세요.');
  };

  const resetSongDraft = () => {
    setSongDraft(createEmptySong(sortedSongs.length + 1));
    setEditingSongId(null);
    setDraftScoresGenerated(false);
  };

  const addOrUpdateSong = () => {
    if (!songDraft.title.trim()) {
      setMessage('곡 제목을 먼저 입력해 주세요.');
      return;
    }

    const normalizedDraft = normalizeSong(songDraft);
    setForm((prev) => {
      if (editingSongId) {
        return {
          ...prev,
          songs: sortSongs(prev.songs.map((song) => (
            song.id === editingSongId
              ? { ...normalizedDraft, order: song.order }
              : song
          ))),
        };
      }

      const newSong = {
        ...normalizedDraft,
        id: makeSongId(),
        order: prev.songs.length + 1,
      };
      setActiveSongId(newSong.id);
      return { ...prev, songs: sortSongs([...prev.songs, newSong]) };
    });

    setMessage(editingSongId ? '곡 정보를 수정하고 콘티 플로우를 다시 분석했습니다.' : '콘티에 곡을 추가했습니다.');
    resetSongDraft();
  };

  const editSong = (song: WorshipContiSongForm) => {
    setSongDraft(song);
    setEditingSongId(song.id);
    setActiveSongId(song.id);
    setDraftScoresGenerated(Boolean(song.sourcePreviewDataUrl));
    setMessage(null);
  };

  const removeSong = (songId: string) => {
    setForm((prev) => ({
      ...prev,
      songs: sortSongs(prev.songs.filter((song) => song.id !== songId)),
    }));
    if (editingSongId === songId) resetSongDraft();
    if (activeSongId === songId) setActiveSongId(null);
  };

  const moveSong = (songId: string, direction: -1 | 1) => {
    setForm((prev) => {
      const songs = sortSongs(prev.songs);
      const index = songs.findIndex((song) => song.id === songId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= songs.length) return prev;
      const nextSongs = [...songs];
      [nextSongs[index], nextSongs[nextIndex]] = [nextSongs[nextIndex], nextSongs[index]];
      return { ...prev, songs: sortSongs(nextSongs) };
    });
  };

  const saveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(stripPreviewData({ ...form, songs: sortedSongs })));
    setMessage('이 브라우저에 찬양콘티 초안을 저장했습니다.');
  };

  const loadDraft = () => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) {
      setMessage('저장된 초안이 없습니다.');
      return;
    }

    try {
      const draft = hydrateForm(JSON.parse(raw) as Partial<WorshipContiForm>);
      setForm(draft);
      setActiveSongId(draft.songs[0]?.id ?? null);
      resetSongDraft();
      setSubmitResult(null);
      setMessage('저장된 초안을 불러왔습니다.');
    } catch {
      setMessage('초안 파일을 읽지 못했습니다.');
    }
  };

  const submitConti = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitResult(null);
    setMessage(null);

    try {
      const normalized: WorshipContiForm = {
        ...form,
        programName: PROGRAM_NAME,
        songs: sortedSongs.map(normalizeSong),
      };
      const result = await submitWorshipConti(normalized);
      localStorage.setItem(DRAFT_KEY, JSON.stringify(stripPreviewData(normalized)));
      setSubmitResult(result);
      setMessage(result.serverSaved
        ? `${PROGRAM_NAME} 프로그램으로 저장했습니다.`
        : 'UnoLive 셋리스트에는 등록했고, 서버 저장은 인증 상태 확인이 필요합니다.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '찬양콘티 등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const openScorePreview = (song: WorshipContiSongForm, type: GeneratedScoreOutputType) => {
    const flow = getSongFlow(song);
    const win = window.open('', '_blank', 'width=980,height=720');
    if (!win) {
      setMessage('새창을 열 수 없습니다. 브라우저 팝업 설정을 확인해 주세요.');
      return;
    }

    const title = `${song.title} · ${SCORE_OUTPUT_LABELS[type]}`;
    const transposedSheet = buildTransposedChordSheet({
      lyrics: song.lyrics,
      originalKey: song.originalKey,
      targetKey: song.targetKey,
    });
    const notice = scoreGenerationNotice(type, transposedSheet);
    const imageMarkup = song.sourcePreviewDataUrl
      ? `<figure class="source"><img src="${song.sourcePreviewDataUrl}" alt="uploaded score" /><figcaption>${escapeHtml(song.sourceName || '업로드 악보 이미지')}</figcaption></figure>`
      : `<div class="source empty">업로드된 악보 이미지가 없습니다.</div>`;
    const scoreMarkup = type === 'transposed-score' || type === 'congregation-score'
      ? renderGeneratedScoreMarkup(song, transposedSheet, flow, type)
      : imageMarkup;
    const practiceMarkup = type === 'vocal-practice'
      ? `
        <div class="practice">
          <button>▶ 멜로디 가이드</button>
          <div class="bar"><span style="width: 42%"></span></div>
          <p>모바일에서 가사와 멜로디를 보며 한 주간 연습하는 화면 테스트입니다.</p>
        </div>
      `
      : '';
    const body = `
      <html>
        <head>
          <title>${escapeHtml(title)}</title>
          <style>
            body { margin: 0; background: #f8fafc; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
            main { max-width: 980px; margin: 32px auto; background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; }
            h1 { margin: 0 0 8px; font-size: 28px; }
            .meta { color: #64748b; font-size: 14px; margin-bottom: 20px; }
            .badge { display: inline-block; padding: 4px 8px; border-radius: 999px; background: #ecfeff; color: #0f766e; font-size: 12px; font-weight: 700; margin-right: 6px; }
            .notice { margin: 0 0 18px; border: 1px solid #fed7aa; background: #fff7ed; color: #9a3412; border-radius: 10px; padding: 12px 14px; font-size: 13px; line-height: 1.6; font-weight: 700; }
            .flow { display: flex; gap: 8px; flex-wrap: wrap; margin: 18px 0; }
            .box { min-width: 56px; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; text-align: center; font-weight: 800; }
            .grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }
            .score { border: 1px solid #dbe3ef; border-radius: 12px; background: #fff; padding: 18px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08); }
            .score.tablet { aspect-ratio: 4 / 3; background: #111827; padding: 16px; }
            .score.tablet .source { height: 100%; background: #fff; border-radius: 8px; display: grid; place-items: center; overflow: hidden; }
            .score.mobile { max-width: 360px; margin: 0 auto; border-radius: 28px; background: #0f172a; color: #fff; padding: 18px; }
            .score.congregation { background: #fffdf5; }
            .source { margin: 0; border: 1px solid #e5e7eb; border-radius: 8px; background: #f8fafc; padding: 10px; }
            .source img { width: 100%; max-height: 520px; object-fit: contain; display: block; border-radius: 6px; }
            .source figcaption { margin-top: 8px; color: #64748b; font-size: 12px; text-align: center; }
            .source.empty { min-height: 220px; display: grid; place-items: center; color: #94a3b8; font-weight: 700; }
            .generated-sheet { border: 1px solid #dbe3ef; border-radius: 10px; background: #fffefc; padding: 18px; }
            .congregation-sheet { background: #fffdf5; font-size: 1.1em; }
            .sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; border-bottom: 2px solid #111827; padding-bottom: 14px; }
            .sheet-head p { margin: 0 0 6px; color: #64748b; font-size: 12px; font-weight: 800; text-transform: uppercase; }
            .sheet-head h3 { margin: 0; font-size: 26px; line-height: 1.2; }
            .key-stamp { min-width: 74px; border: 2px solid #111827; border-radius: 999px; padding: 10px 12px; text-align: center; font-size: 24px; font-weight: 900; }
            .sheet-meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
            .sheet-meta span { border: 1px solid #e5e7eb; border-radius: 999px; background: #f8fafc; padding: 5px 9px; color: #334155; font-size: 12px; font-weight: 800; }
            .chart { border: 1px solid #e5e7eb; border-radius: 8px; background: white; padding: 16px; }
            .chart-line { min-height: 24px; white-space: pre-wrap; overflow-wrap: anywhere; }
            .chart-line.section { margin: 16px 0 8px; color: #0369a1; font-size: 14px; font-weight: 900; }
            .chart-line.chords { color: #0f766e; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 15px; font-weight: 900; line-height: 1.55; }
            .chart-line.lyrics { color: #111827; font-size: 15px; line-height: 1.65; }
            .chart-line.blank { min-height: 12px; }
            .sheet-empty { display: grid; gap: 16px; margin-top: 16px; }
            .staff-system { border: 1px dashed #cbd5e1; border-radius: 10px; background: #f8fafc; padding: 14px; }
            .staff-title { margin-bottom: 10px; color: #334155; font-size: 12px; font-weight: 900; }
            .staff-lines { display: grid; gap: 8px; margin-bottom: 12px; }
            .staff-lines span { display: block; height: 1px; background: #64748b; }
            .staff-system p { margin: 0; color: #64748b; font-size: 12px; line-height: 1.6; }
            .practice { margin-top: 16px; border-radius: 16px; background: #1e293b; padding: 16px; }
            .practice button { width: 100%; height: 42px; border: 0; border-radius: 999px; background: #38bdf8; color: #082f49; font-weight: 800; }
            .bar { margin-top: 14px; height: 8px; border-radius: 999px; background: #334155; overflow: hidden; }
            .bar span { display: block; height: 100%; background: #facc15; }
            .side { border-left: 1px solid #e5e7eb; padding-left: 18px; }
            pre { white-space: pre-wrap; line-height: 1.7; background: #f8fafc; border: 1px solid #e5e7eb; padding: 18px; border-radius: 8px; }
            @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } .side { border-left: 0; padding-left: 0; } }
          </style>
        </head>
        <body>
          <main>
            <span class="badge">${escapeHtml(SCORE_OUTPUT_LABELS[type])}</span>
            ${type === 'vocal-practice' ? '<span class="badge">모바일 연습용</span>' : ''}
            <h1>${escapeHtml(song.title)}</h1>
            <div class="meta">
              원조 ${escapeHtml(transposedSheet.originalKey || '미지정')}${transposedSheet.inferredOriginalKey ? ' 추정' : ''} → 목표 ${escapeHtml(song.targetKey || '미지정')}
              ${song.tempo ? ` · ${escapeHtml(song.tempo)} BPM` : ''}
              · 저작권 ${escapeHtml(licenseLabel(song.licenseStatus))}
            </div>
            <div class="notice">${escapeHtml(notice)}</div>
            <div class="grid">
              <section class="${scorePreviewClass(type)}">
                <h2>${escapeHtml(outputModeLabel(type))}</h2>
                ${scoreMarkup}
                ${practiceMarkup}
              </section>
              <aside class="side">
                <h2>콘티 구조</h2>
                <div class="flow">
                  ${flow.segments.map((segment) => `<div class="box">${escapeHtml(segment.code.toUpperCase())}<br><small>${escapeHtml(segment.label)}</small></div>`).join('')}
                </div>
                <h2>가사/코드</h2>
                <pre>${escapeHtml(song.lyrics || '가사/코드 입력 대기')}</pre>
              </aside>
            </div>
          </main>
        </body>
      </html>
    `;
    win.document.write(body);
    win.document.close();
  };

  const exportConti = () => {
    const win = window.open('', '_blank', 'width=980,height=720');
    if (!win) {
      setMessage('새창을 열 수 없습니다. 브라우저 팝업 설정을 확인해 주세요.');
      return;
    }

    const rows = sortedSongs.map((song) => {
      const flow = getSongFlow(song);
      return `
        <tr>
          <td>${song.order}</td>
          <td>${escapeHtml(song.title)}</td>
          <td>${escapeHtml(song.originalKey || '-')} → ${escapeHtml(song.targetKey || '-')}</td>
          <td>${escapeHtml(flow.pattern || '-')}</td>
          <td>${escapeHtml(song.memo || '')}</td>
        </tr>
      `;
    }).join('');

    win.document.write(`
      <html>
        <head>
          <title>${escapeHtml(form.worshipTitle)}</title>
          <style>
            body { margin: 0; background: #f8fafc; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
            main { max-width: 960px; margin: 32px auto; background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; }
            h1 { margin: 0 0 6px; font-size: 28px; }
            p { color: #64748b; }
            table { width: 100%; border-collapse: collapse; margin-top: 24px; }
            th, td { border-bottom: 1px solid #e5e7eb; padding: 10px; text-align: left; font-size: 14px; }
            th { background: #f8fafc; color: #334155; }
          </style>
        </head>
        <body>
          <main>
            <h1>${escapeHtml(form.worshipTitle)}</h1>
            <p>${escapeHtml(toDisplayDate(form.worshipDate))} · ${escapeHtml(form.worshipType)} · ${escapeHtml(PROGRAM_NAME)}</p>
            <table>
              <thead><tr><th>#</th><th>곡명</th><th>Key</th><th>구조</th><th>메모</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </main>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <main className="w-full bg-[#f8fafc] px-4 py-4 text-gray-950">
      <section className="mb-4 w-full rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/media/fellowship"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:border-gray-400"
              aria-label="자막협조로 돌아가기"
            >
              <ArrowLeft size={17} />
            </Link>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-sky-700">
                찬양콘티 작성 · {PROGRAM_NAME}
              </p>
              <h1 className="truncate text-xl font-bold text-gray-950">
                {form.worshipTitle || '찬양콘티 작성'}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadDraft}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-[12px] font-semibold text-gray-700 hover:border-gray-400"
            >
              <Library size={15} />
              초안 불러오기
            </button>
            <button
              type="button"
              onClick={saveDraft}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-[12px] font-semibold text-gray-700 hover:border-gray-400"
            >
              <Save size={15} />
              초안 저장
            </button>
            <button
              type="button"
              onClick={exportConti}
              disabled={!sortedSongs.length}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 text-[12px] font-semibold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <MonitorUp size={15} />
              콘티 내보내기
            </button>
            <button
              type="button"
              onClick={submitConti}
              disabled={!canSubmit || submitting}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-gray-950 px-3 text-[12px] font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              <Send size={15} />
              {submitting ? '저장 중' : '전체 저장'}
            </button>
          </div>
        </div>

        <div className="grid gap-3 px-5 py-4 lg:grid-cols-[260px_1fr]">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-gray-600">정기예배</span>
              <select
                value={worshipSelectValue}
                onChange={(e) => handleWorshipTypeSelect(e.target.value)}
                className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none focus:border-sky-600"
              >
                {WORSHIP_SELECT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            {worshipSelectValue === WORSHIP_OTHER_VALUE && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-gray-600">기타 예배/집회명</span>
                <input
                  value={form.worshipType}
                  onChange={(e) => {
                    const value = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      worshipType: value,
                      worshipTitle: value ? `${value} 찬양콘티` : prev.worshipTitle,
                    }));
                  }}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-sky-600"
                  placeholder="예: 부흥회, 찬양집회"
                />
              </label>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <StatusCell label="예배일" value={toDisplayDate(form.worshipDate)} />
            <StatusCell label="설교제목" value={selectedWeeklyWorship?.sermonTitle ?? '주간 주보정보 연동 대기'} />
            <StatusCell label="본문" value={selectedWeeklyWorship?.scripture ?? '주간 주보정보 연동 대기'} />
            <StatusCell label="설교자" value={selectedWeeklyWorship?.preacher ?? '주간 주보정보 연동 대기'} />
            <StatusCell label="주보 찬송" value="찬송 DB 연동 대기" muted />
          </div>
        </div>
      </section>

      <CopyrightComplianceNotice compact className="mb-4" />

      {message && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <CheckCircle2 size={16} />
          <span>{message}</span>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(220px,20%)_minmax(0,1fr)_minmax(300px,28%)]">
        <aside className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <PanelHeader eyebrow="List" title={`곡명 리스트 · ${sortedSongs.length}`} icon={<ClipboardList size={17} />} />
          <div className="space-y-2 p-4">
            <button
              type="button"
              onClick={resetSongDraft}
              className="mb-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-sky-700 px-3 text-[12px] font-semibold text-white hover:bg-sky-600"
            >
              <Plus size={15} />
              곡 추가
            </button>

            {sortedSongs.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-5 text-center">
                <Music2 size={24} className="mx-auto text-gray-400" />
                <p className="mt-2 text-[12px] font-semibold text-gray-600">곡을 추가하세요</p>
              </div>
            ) : (
              sortedSongs.map((song, index) => (
                <div
                  key={song.id}
                  className={`rounded-md border p-3 ${
                    activeSong?.id === song.id
                      ? 'border-sky-300 bg-sky-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveSongId(song.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-950 text-[11px] font-bold text-white">
                        {song.order}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-950">
                        {song.title}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-[11px] text-gray-500">
                      {song.originalKey || '-'} → {song.targetKey || '-'} · {song.flowPattern || '구조 대기'}
                    </p>
                  </button>

                  <div className="mt-3 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => editSong(song)}
                      className="h-7 flex-1 rounded border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:border-sky-300"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSong(song.id, -1)}
                      disabled={index === 0}
                      className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                      aria-label="위로 이동"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSong(song.id, 1)}
                      disabled={index === sortedSongs.length - 1}
                      className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                      aria-label="아래로 이동"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSong(song.id)}
                      className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-gray-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                      aria-label="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <PanelHeader eyebrow="Editor" title={editing ? '선정 곡 수정' : '곡 정보 입력'} icon={<Music2 size={17} />} />
            <div className="grid gap-3 p-4 lg:grid-cols-6">
              <label className="block lg:col-span-2">
                <FieldLabel>곡명</FieldLabel>
                <input
                  value={songDraft.title}
                  onChange={(e) => updateSongDraft('title', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-sky-600"
                  placeholder="곡 제목"
                />
              </label>

              <label className="block">
                <FieldLabel>원조</FieldLabel>
                <select
                  value={songDraft.originalKey}
                  onChange={(e) => {
                    updateSongDraft('originalKey', e.target.value);
                    setDraftScoresGenerated(false);
                  }}
                  className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none focus:border-sky-600"
                >
                  {KEY_OPTIONS.map((key) => (
                    <option key={key || 'none-original'} value={key}>{key || '-'}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <FieldLabel>목표조</FieldLabel>
                <select
                  value={songDraft.targetKey}
                  onChange={(e) => {
                    updateSongDraft('targetKey', e.target.value);
                    setDraftScoresGenerated(false);
                  }}
                  className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none focus:border-sky-600"
                >
                  {KEY_OPTIONS.map((key) => (
                    <option key={key || 'none-target'} value={key}>{key || '-'}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <FieldLabel>템포</FieldLabel>
                <input
                  type="number"
                  min="40"
                  max="240"
                  value={songDraft.tempo}
                  onChange={(e) => updateSongDraft('tempo', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-sky-600"
                  placeholder="BPM"
                />
              </label>

              <label className="block">
                <FieldLabel>저작권</FieldLabel>
                <select
                  value={songDraft.licenseStatus}
                  onChange={(e) => updateSongDraft('licenseStatus', e.target.value as ScoreLicenseStatus)}
                  className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none focus:border-sky-600"
                >
                  {LICENSE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="block lg:col-span-2">
                <FieldLabel>작사</FieldLabel>
                <input
                  value={songDraft.lyricist}
                  onChange={(e) => updateSongDraft('lyricist', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-sky-600"
                />
              </label>

              <label className="block lg:col-span-2">
                <FieldLabel>작곡</FieldLabel>
                <input
                  value={songDraft.composer}
                  onChange={(e) => updateSongDraft('composer', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-sky-600"
                />
              </label>

              <label className="block lg:col-span-2">
                <FieldLabel>편곡</FieldLabel>
                <input
                  value={songDraft.arranger}
                  onChange={(e) => updateSongDraft('arranger', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-sky-600"
                />
              </label>

              <div className="lg:col-span-6">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <FieldLabel>악보 출처</FieldLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-800 hover:bg-sky-100">
                      <Upload size={13} />
                      PNG 악보 업로드
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/*"
                        className="sr-only"
                        onChange={async (e) => {
                          await handleScoreFiles(Array.from(e.target.files ?? []));
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={loadSampleScore}
                      className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-800 hover:bg-sky-100"
                    >
                      샘플 악보 테스트
                    </button>
                  </div>
                </div>
                <div className="grid gap-2 xl:grid-cols-[190px_minmax(220px,1fr)_120px_140px_150px]">
                  <div className="grid grid-cols-4 gap-1 rounded-md bg-gray-100 p-1">
                    {SOURCE_OPTIONS.map((source) => {
                      const Icon = source.icon;
                      const active = songDraft.sourceType === source.type;
                      return (
                        <button
                          key={source.type}
                          type="button"
                          onClick={() => updateSongDraft('sourceType', source.type)}
                          className={`flex h-9 items-center justify-center gap-1 rounded px-1 text-[11px] font-semibold ${
                            active ? 'bg-white text-sky-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          <Icon size={14} />
                          <span>{source.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedSource?.accept ? (
                    <input
                      type="file"
                      accept={selectedSource.accept}
                      multiple
                      onChange={async (e) => {
                        await handleScoreFiles(Array.from(e.target.files ?? []));
                        e.currentTarget.value = '';
                      }}
                      className="block h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-[12px] text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-gray-700"
                    />
                  ) : (
                    <input
                      value={songDraft.sourceName}
                      onChange={(e) => updateSongDraft('sourceName', e.target.value)}
                      className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-sky-600"
                      placeholder={songDraft.sourceType === 'database' ? 'DB 곡명 또는 ID' : '직접 입력'}
                    />
                  )}
                  <select
                    value={songDraft.originalKey}
                    onChange={(e) => {
                      updateSongDraft('originalKey', e.target.value);
                      setDraftScoresGenerated(false);
                    }}
                    className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm font-bold outline-none focus:border-sky-600"
                    aria-label="원조"
                  >
                    {KEY_OPTIONS.map((key) => (
                      <option key={key || 'none-upload-original'} value={key}>{key ? `원조 ${key}` : '원조'}</option>
                    ))}
                  </select>
                  <select
                    value={songDraft.targetKey}
                    onChange={(e) => {
                      updateSongDraft('targetKey', e.target.value);
                      setDraftScoresGenerated(false);
                    }}
                    className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm font-bold outline-none focus:border-sky-600"
                    aria-label="옮길 조"
                  >
                    {KEY_OPTIONS.map((key) => (
                      <option key={key || 'none-upload-target'} value={key}>{key ? `${key}로 조옮김` : '옮길 조'}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={generateDraftScores}
                    disabled={!songDraft.sourcePreviewDataUrl}
                    className="h-10 rounded-md bg-gray-950 px-3 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    악보생성 하기
                  </button>
                </div>
                {songDraft.sourcePreviewDataUrl && (
                  <div className="mt-3 grid gap-3 rounded-md border border-sky-200 bg-sky-50 p-3 md:grid-cols-[120px_1fr]">
                    <div
                      className="h-[92px] overflow-hidden rounded border border-white bg-white bg-contain bg-center bg-no-repeat"
                      aria-label="업로드 악보 미리보기"
                      role="img"
                      style={{ backgroundImage: `url("${songDraft.sourcePreviewDataUrl}")` }}
                    />
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-sky-900">이미지 악보 테스트 준비됨</p>
                      <p className="mt-1 truncate text-[12px] text-sky-700">{songDraft.sourceName}</p>
                      <p className="mt-2 text-[11px] leading-4 text-sky-800">
                        옮길 조: <span className="font-bold">{songDraft.targetKey || '미선택'}</span>.
                        악보생성 하기를 누르면 4가지 미리보기 버튼이 표시됩니다.
                      </p>
                      <p className="mt-1 text-[11px] leading-4 text-amber-800">
                        PNG 원본의 음표/조표 직접 변환은 OMR 연결 후 진행하고, 현재는 가사/코드 초안을 조옮김합니다.
                      </p>
                    </div>
                    {draftScoresGenerated ? (
                      <div className="md:col-span-2">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-[12px] font-bold text-sky-900">생성 미리보기</p>
                          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-sky-800">
                            {songDraft.targetKey || '목표조 미지정'}
                          </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-4">
                          {OUTPUT_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            return (
                              <button
                                key={option.type}
                                type="button"
                                onClick={() => previewDraftScore(option.type)}
                                className="flex min-h-[58px] items-center gap-2 rounded-md border border-white bg-white px-3 py-2 text-left text-[11px] font-bold text-gray-800 shadow-sm hover:border-sky-300"
                              >
                                <Icon size={16} className="shrink-0 text-sky-700" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate">{SCORE_OUTPUT_LABELS[option.type]}</span>
                                  <span className="mt-0.5 block text-[10px] text-amber-700">
                                    {scoreGenerationBadge(option.type)}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="md:col-span-2 rounded-md border border-dashed border-sky-300 bg-white/70 px-3 py-3 text-[12px] font-semibold text-sky-800">
                        업로드 완료. 옮길 조를 고른 뒤 `악보생성 하기`를 눌러 주세요.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <label className="block lg:col-span-4">
                <FieldLabel>가사/코드 초안</FieldLabel>
                <textarea
                  value={songDraft.lyrics}
                  onChange={(e) => {
                    const lyrics = e.target.value;
                    const flow = analyzeContiFlow(lyrics);
                    setSongDraft((prev) => ({
                      ...prev,
                      lyrics,
                      flowPattern: flow.pattern,
                      flowSections: flow.segments,
                    }));
                  }}
                  rows={6}
                  className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 outline-none focus:border-sky-600"
                  placeholder={'[1절]\\nG        D/F#     Em\\n주님 은혜 안에 서네\\n\\n[후렴]\\nC        G/B      Am   D\\n주의 사랑 노래하네'}
                />
              </label>

              <div className="lg:col-span-2">
                <label className="block">
                  <FieldLabel>구조 필드</FieldLabel>
                  <input
                    value={songDraft.flowPattern}
                    onChange={(e) => {
                      const value = e.target.value;
                      const flow = analyzeContiFlow(songDraft.lyrics, value);
                      setSongDraft((prev) => ({
                        ...prev,
                        flowPattern: value,
                        flowSections: flow.segments,
                      }));
                    }}
                    onBlur={() => applyFlowToDraft()}
                    className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm font-bold outline-none focus:border-sky-600"
                    placeholder="v1-c-v2-c-b-c"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => applyFlowToDraft('')}
                  className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-sky-200 bg-sky-50 text-[12px] font-semibold text-sky-800 hover:bg-sky-100"
                >
                  <Wand2 size={15} />
                  자동 구조 분석
                </button>

                <label className="mt-3 block">
                  <FieldLabel>곡 메모</FieldLabel>
                  <textarea
                    value={songDraft.memo}
                    onChange={(e) => updateSongDraft('memo', e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 outline-none focus:border-sky-600"
                    placeholder="도입, 반복, 전환 메모"
                  />
                </label>
              </div>

              <div className="lg:col-span-6">
                <FieldLabel>생성 산출물</FieldLabel>
                <div className="grid gap-2 md:grid-cols-4">
                    {OUTPUT_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const active = songDraft.outputTypes.includes(option.type);
                      return (
                      <button
                        key={option.type}
                        type="button"
                        onClick={() => toggleOutput(option.type)}
                        className={`min-h-[84px] rounded-md border p-3 text-left transition-colors ${
                          active ? option.color : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <Icon size={18} />
                        <span className="mt-2 flex items-center gap-2 text-[12px] font-bold">
                          <span className="min-w-0 flex-1 truncate">{SCORE_OUTPUT_LABELS[option.type]}</span>
                          <span className="shrink-0 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] text-amber-700">
                            {scoreGenerationBadge(option.type)}
                          </span>
                        </span>
                        <span className="mt-1 block text-[11px] leading-4 opacity-80">{option.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={addOrUpdateSong}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-gray-950 px-4 text-sm font-semibold text-white hover:bg-gray-800 lg:col-span-6"
              >
                <Plus size={16} />
                {editing ? '곡 수정 반영' : '콘티에 추가'}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <PanelHeader eyebrow="Flow" title="콘티 플로우 섹션" icon={<Wand2 size={17} />} />
            <div className="space-y-4 p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <FlowMetric label="선정 곡" value={editingSongId ? songDraft.title || '입력 중' : activeSong?.title ?? '선택 대기'} />
                <FlowMetric label="Key 전환" value={activeSong ? `${activeSong.originalKey || '-'} → ${activeSong.targetKey || '-'}` : `${songDraft.originalKey || '-'} → ${songDraft.targetKey || '-'}`} />
                <FlowMetric label="다음곡" value={nextSong?.title ?? '마지막 곡'} />
              </div>

              {currentFlow.segments.length ? (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900">
                      구조: {currentFlow.pattern || '분석 대기'}
                    </p>
                    <span className="rounded-full border border-sky-200 bg-white px-2 py-1 text-[11px] font-bold text-sky-700">
                      신뢰도 {Math.round(currentFlow.confidence * 100)}%
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {currentFlow.segments.map((segment, index) => (
                      <FlowBox key={`${segment.id}-${index}`} segment={segment} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                  <Wand2 size={28} className="mx-auto text-gray-400" />
                  <p className="mt-2 text-sm font-bold text-gray-700">자동 분석 대기</p>
                  <p className="mt-1 text-[12px] text-gray-500">가사 블록을 입력하면 v1-c-v2 구조가 자동으로 채워집니다.</p>
                </div>
              )}

              <div className="rounded-md border border-gray-200 bg-white p-4">
                <p className="mb-3 text-sm font-bold text-gray-900">전체 Key 전환</p>
                {sortedSongs.length ? (
                  <div className="flex flex-wrap gap-2">
                    {sortedSongs.map((song, index) => (
                      <span
                        key={song.id}
                        className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] font-semibold text-gray-700"
                      >
                        {index + 1}. {song.title} · {song.originalKey || '-'} → {song.targetKey || '-'}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-gray-500">곡을 추가하면 전체 조 전환 흐름이 표시됩니다.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <PanelHeader eyebrow="Scores" title="악보 생성 리스트" icon={<BookOpen size={17} />} />
            <div className="space-y-3 p-4">
              {sortedSongs.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-5 text-center">
                  <BookOpen size={24} className="mx-auto text-gray-400" />
                  <p className="mt-2 text-[12px] font-semibold text-gray-600">생성할 악보가 없습니다</p>
                </div>
              ) : (
                sortedSongs.map((song) => (
                  <div key={song.id} className="rounded-md border border-gray-200 p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-950">{song.title}</p>
                        <p className="text-[11px] text-gray-500">
                          {song.originalKey || '-'} → {song.targetKey || '-'} · {song.flowPattern || '구조 대기'}
                        </p>
                      </div>
                      {song.licenseStatus === 'unknown' && (
                        <AlertTriangle size={15} className="shrink-0 text-amber-600" />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {song.outputTypes.map((type) => {
                        const option = OUTPUT_OPTIONS.find((item) => item.type === type);
                        const Icon = option?.icon ?? FileText;
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => openScorePreview(song, type)}
                            className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:border-sky-300 hover:bg-sky-50"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Icon size={15} className="shrink-0 text-gray-500" />
                              <span className="min-w-0">
                                <span className="block truncate text-[12px] font-semibold text-gray-800">
                                  {SCORE_OUTPUT_LABELS[type]}
                                </span>
                                <span className="block text-[10px] font-bold text-amber-700">
                                  {scoreGenerationBadge(type)}
                                </span>
                              </span>
                            </span>
                            <ExternalLink size={14} className="shrink-0 text-gray-400" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <PanelHeader eyebrow="Save" title="저장 상태" icon={<Send size={17} />} />
            <div className="space-y-3 p-4">
              <MetricRow label="ScoreAnalysis" value={`${analyses.length}개`} />
              <MetricRow label="생성 산출물" value={`${outputCount}개`} />
              <MetricRow label="저장 프로그램" value={PROGRAM_NAME} />

              {!submitResult ? (
                <p className="rounded-md border border-gray-200 bg-gray-50 p-3 text-[12px] leading-5 text-gray-600">
                  전체 저장 시 선택한 정기예배의 `{PROGRAM_NAME}` 프로그램으로 저장됩니다.
                </p>
              ) : (
                <div className="space-y-2 text-sm">
                  <ResultRow label="셋리스트" value={submitResult.setlistId} />
                  <ResultRow label="프로그램" value={submitResult.itemId} />
                  <ResultRow label="섹션" value={`${submitResult.sectionCount}개`} />
                  <div className={`rounded-md border px-3 py-2 text-[12px] ${
                    submitResult.serverSaved
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`}>
                    {submitResult.serverSaved
                      ? '서버 프로그램 저장 완료'
                      : `서버 저장 대기: ${submitResult.serverError ?? '인증 필요'}`}
                  </div>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function StatusCell({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 truncate text-[13px] font-bold ${muted ? 'text-gray-400' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function PanelHeader({
  eyebrow,
  title,
  icon,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-700 text-white">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-sky-700">{eyebrow}</p>
        <h2 className="truncate text-base font-bold text-gray-950">{title}</h2>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[12px] font-bold text-gray-600">{children}</span>;
}

function FlowMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-gray-950">{value}</p>
    </div>
  );
}

function FlowBox({ segment }: { segment: ContiFlowSegment }) {
  const tone = segment.code === 'c'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : segment.code === 'b'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : segment.code === 'i' || segment.code === 'e'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-sky-200 bg-sky-50 text-sky-800';

  return (
    <div className={`min-w-[72px] rounded-md border px-3 py-3 text-center ${tone}`}>
      <p className="text-base font-black uppercase">{segment.code}</p>
      <p className="mt-1 text-[11px] font-bold">{segment.label}</p>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
      <span className="text-[12px] font-semibold text-gray-500">{label}</span>
      <span className="text-sm font-bold text-gray-950">{value}</span>
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-[12px] font-semibold text-gray-500">{label}</span>
      <span className="truncate text-right text-[12px] font-bold text-gray-900">{value}</span>
    </div>
  );
}
