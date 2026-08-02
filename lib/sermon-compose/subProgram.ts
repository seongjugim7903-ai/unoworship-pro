// 설교대지에 딸린 '부속 프로그램'의 공용 타입과 규칙.
// 네 종류 모두 설교대지 3종(말씀찾기 본문·설교대지·말씀찾기 인용)과 별개로 자기 프로그램이 된다.
//
//   image   — 참고 사진. 여기서 Storage 에 올린 파일
//   youtube — 참고 영상 링크
//   hymn    — 찬송가 장 번호. 가사는 현장 UnoLive 가 /api/hymn 으로 채운다
//   praise  — 찬양 곡명. 슬라이드는 현장 UnoLive 가 PPT 변환본에서 찾아 채운다
//
// hymn·praise 는 이 앱에 원본 데이터가 없어서 '무엇을 쓸지'만 적어 보내는 주문서다.

export type SubProgramKind = 'image' | 'youtube' | 'hymn' | 'praise';

/** kind='image' */
export interface SubImageItem {
  /** Supabase Storage 경로 — churches/{churchId}/{programId}/{n}.webp */
  path: string;
  width: number;
  height: number;
  caption: string;
}

/** kind='youtube' */
export interface SubYoutubeItem {
  /** 사용자가 붙여넣은 원본 링크 */
  url: string;
  /** 11자리 유튜브 영상 ID */
  videoId: string;
  caption: string;
}

/** kind='hymn' — 가사는 현장에서 장 번호로 조회한다 */
export interface SubHymnItem {
  /** 찬송가 장 번호 */
  number: number;
  /** 입력자 메모(예: '설교 전'). 없으면 빈 문자열 */
  caption: string;
}

/** kind='praise' — 슬라이드는 현장에서 곡명으로 찾는다 */
export interface SubPraiseItem {
  /** PPT 변환본을 찾을 곡명 */
  songName: string;
  caption: string;
}

export type SubProgramItem = SubImageItem | SubYoutubeItem | SubHymnItem | SubPraiseItem;

export interface SermonSubProgram {
  id: string;
  kind: SubProgramKind;
  serviceType: string;
  serviceDate: string;
  title: string;
  items: SubProgramItem[];
  createdAt: string;
  updatedAt: string;
}

export const MEDIA_BUCKET = 'sermon-outline-media';

/** 한 프로그램에 담을 수 있는 최대 개수 — 실수로 수백 개를 넣는 사고를 막는다 */
export const MAX_ITEMS_PER_PROGRAM = 30;

const KIND_SUFFIX: Record<SubProgramKind, string> = {
  image: '참고이미지',
  youtube: '참고영상',
  hymn: '찬송가',
  praise: '찬양',
};

/**
 * 제목을 비워두면 날짜·예배·종류로 자동 생성한다.
 * 예: '20260805-수요예배-찬송가'
 */
export function defaultSubProgramTitle(
  serviceDate: string,
  serviceType: string,
  kind: SubProgramKind,
): string {
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(serviceDate) ? serviceDate.replaceAll('-', '') : '';
  return [dateKey, serviceType.trim(), KIND_SUFFIX[kind]].filter(Boolean).join('-');
}

/** 새찬송가 마지막 장 */
const MAX_HYMN_NUMBER = 645;

/** '310장' · '찬송가 310장' · '310' → 310. 장 번호로 못 읽으면 null */
export function parseHymnNumber(raw: string): number | null {
  const matched = /^(?:찬송가?\s*)?(\d{1,3})\s*장?$/.exec(raw.trim());
  if (!matched) return null;
  const num = Number(matched[1]);
  return num >= 1 && num <= MAX_HYMN_NUMBER ? num : null;
}
