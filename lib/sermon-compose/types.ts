// 설교대지 협조문 파싱 결과와 참고자료(사진·유튜브)의 공용 타입

/** 참고자료가 프로그램 어디에 놓일지 */
export type MediaPlacement =
  /** 말씀찾기(인용) 프로그램 맨 뒤에 섹션으로 붙인다 (기본) */
  | 'quote-tail'
  /** 별도 프로그램으로 분리한다 */
  | 'own-program';

export interface SermonImageRef {
  /** Supabase Storage 경로 — churches/{churchId}/{outlineId}/{n}.webp */
  path: string;
  width: number;
  height: number;
  placement: MediaPlacement;
  caption: string;
}

export interface SermonYoutubeRef {
  /** 사용자가 입력한 원본 링크 */
  url: string;
  /** 11자리 유튜브 영상 ID */
  videoId: string;
  placement: MediaPlacement;
  caption: string;
}

export interface SermonMedia {
  images: SermonImageRef[];
  youtube: SermonYoutubeRef[];
}

/** 대지 하나 — 타이틀 + 그 대지에 딸린 인용구절들 */
export interface ParsedPoint {
  /** 원문의 대지 번호. 예: '1' */
  number: string;
  /** 대지 제목. 끝의 절범위 괄호는 제거된 상태. 예: '마음에 근심하지 말라 하심' */
  title: string;
  /** 원문 제목 끝 괄호 안의 값. 예: '1', '2-3'. 자막에는 쓰지 않는다 */
  verseRange: string;
  /** 인용 성경 표기. 원문 순서·중복 그대로 보존한다 */
  quotes: string[];
}

export interface ParsedSermonOutline {
  /** 첫 줄에서 추론한 예배 종류. 못 찾으면 '' */
  serviceTypeHint: string;
  /** '제목:' 줄 */
  sermonTitle: string;
  /** '성경:' 또는 '본문:' 줄 */
  scriptureRef: string;
  points: ParsedPoint[];
  /** '찬양:' 줄 원문 — 참고 표시용. 이 기능에서 프로그램을 만들지는 않는다 */
  praiseLine: string;
  /** 찬양 줄에서 뽑은 찬송가 장 번호. 예: ['310', '493', '382'] */
  hymnNumbers: string[];
  /** 찬양 줄에서 장 번호가 아닌 곡명 */
  praiseSongs: string[];
  /** 어느 분류에도 걸리지 않은 줄 — 검수 화면에서 사용자가 배정한다 */
  unresolved: string[];
}

/** Supabase sermon_outlines.metadata 에 얹는 구조 */
export interface SermonComposeMetadata {
  savedBy: 'sermon-compose';
  parserVersion: number;
  parsed: ParsedSermonOutline;
  preacher: string;
  churchName: string;
  media: SermonMedia;
}

export const PARSER_VERSION = 1;

export function emptyMedia(): SermonMedia {
  return { images: [], youtube: [] };
}
