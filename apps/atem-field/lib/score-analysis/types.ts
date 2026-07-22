/**
 * lib/score-analysis/types.ts
 *
 * 찬양콘티 악보 분석/산출물 공통 타입.
 * 실제 OCR/OMR 엔진을 붙이기 전에도 수동 입력 데이터를 같은 구조로 저장한다.
 */

export type ScoreSourceType = 'image' | 'pdf' | 'database' | 'manual';

export type ScoreLicenseStatus =
  | 'unknown'
  | 'church-owned'
  | 'licensed'
  | 'public-domain';

export type ScoreLyricsBlockLabel =
  | 'verse'
  | 'chorus'
  | 'bridge'
  | 'ending'
  | 'other';

export type GeneratedScoreOutputType =
  | 'transposed-score'
  | 'tablet-score'
  | 'vocal-practice'
  | 'congregation-score';

export interface ScoreAnalysis {
  id: string;
  sourceType: ScoreSourceType;
  sourceAssetId?: string;
  title: string;
  lyricist?: string;
  composer?: string;
  arranger?: string;
  originalKey?: string;
  detectedKey?: string;
  targetKey?: string;
  tempo?: number;
  timeSignature?: string;
  lyricsBlocks: Array<{
    label: ScoreLyricsBlockLabel;
    text: string;
  }>;
  chordTimeline: Array<{
    beat?: number;
    chord: string;
    lyricOffset?: number;
  }>;
  melodyHints: Array<{
    lyric: string;
    pitch?: string;
    duration?: number;
  }>;
  pageImages: Array<{
    page: number;
    assetId: string;
    width: number;
    height: number;
  }>;
  confidence: {
    metadata: number;
    lyrics: number;
    chords: number;
    melody: number;
  };
  copyright: {
    licenseStatus: ScoreLicenseStatus;
    provider?: string;
    reportCode?: string;
  };
}

export interface GeneratedScoreAsset {
  id: string;
  contiId: string;
  songId: string;
  type: GeneratedScoreOutputType;
  targetKey?: string;
  fileAssetId?: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export const SCORE_OUTPUT_LABELS: Record<GeneratedScoreOutputType, string> = {
  'transposed-score': '조옮김 악보 DB 저장',
  'tablet-score': '태블릿 전자 악보',
  'vocal-practice': '보컬 모바일 멜로디 연습',
  'congregation-score': '회중용 악보',
};
