// unoworship-pro 설교대지 화면이 저장한 데이터의 형태.
// 저쪽 lib/sermon-compose/types.ts · subProgram.ts 와 같은 모양이어야 한다.

/** 대지 하나 — 타이틀 + 그 대지에 딸린 인용구절 */
export interface ParsedPoint {
  number: string;
  title: string;
  verseRange: string;
  quotes: string[];
}

export interface ParsedSermonOutline {
  serviceTypeHint: string;
  sermonTitle: string;
  scriptureRef: string;
  points: ParsedPoint[];
  praiseLine: string;
  hymnNumbers: string[];
  praiseSongs: string[];
  unresolved: string[];
}

/** sermon_outlines.metadata — 화면에서 사람이 고친 최종값이 함께 들어 있다 */
export interface SermonOutlineMetadata {
  savedBy?: string;
  parserVersion?: number;
  parsed?: ParsedSermonOutline;
  /** 협조문 파싱값보다 우선한다 — 화면에서 확인·수정을 거친 값이기 때문이다 */
  sermonTitle?: string;
  scriptureRef?: string;
  preacher?: string;
  /** 설교자 자막의 소속 슬롯 — 입력웹이 churches 레코드에서 읽어 보낸다 */
  churchName?: string;
  serviceOrder?: string;
}

export interface CloudSermonOutline {
  id: string;
  created_at: string;
  updated_at: string;
  service_date: string | null;
  service_type: string;
  content: string;
  hymn: string;
  metadata?: SermonOutlineMetadata;
}

export type SubProgramKind = 'image' | 'youtube' | 'hymn' | 'praise' | 'news';

export interface SubHymnItem {
  number: number;
  caption?: string;
}

export interface SubPraiseItem {
  songName: string;
  caption?: string;
}

export interface CloudSubProgram {
  id: string;
  kind: SubProgramKind;
  service_date: string | null;
  service_type: string;
  title: string;
  items: unknown[];
  created_at: string;
  updated_at: string;
}

/** 컴포저 목록에 띄울 후보 한 건 */
export interface SermonComposeCandidate {
  outline: CloudSermonOutline;
  /** 같은 예배·같은 날짜로 저장된 부속 프로그램 */
  subPrograms: CloudSubProgram[];
}
