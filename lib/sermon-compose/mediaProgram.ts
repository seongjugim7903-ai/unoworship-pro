// 설교 참고자료 프로그램(사진 · 유튜브)의 공용 타입과 규칙.
// 두 종류 모두 설교대지 3종과 별개로 자기 프로그램이 된다.

export type MediaProgramKind = 'image' | 'youtube';

/** kind='image' 의 items 한 칸 */
export interface MediaImageItem {
  /** Supabase Storage 경로 — churches/{churchId}/{programId}/{n}.webp */
  path: string;
  width: number;
  height: number;
  caption: string;
}

/** kind='youtube' 의 items 한 칸 */
export interface MediaYoutubeItem {
  /** 사용자가 붙여넣은 원본 링크 */
  url: string;
  /** 11자리 유튜브 영상 ID */
  videoId: string;
  caption: string;
}

export interface SermonMediaProgram {
  id: string;
  kind: MediaProgramKind;
  serviceType: string;
  serviceDate: string;
  title: string;
  items: MediaImageItem[] | MediaYoutubeItem[];
  createdAt: string;
  updatedAt: string;
}

export const MEDIA_BUCKET = 'sermon-outline-media';

/** 한 프로그램에 담을 수 있는 최대 개수 — 실수로 수백 개를 올리는 사고를 막는다 */
export const MAX_ITEMS_PER_PROGRAM = 30;

const KIND_SUFFIX: Record<MediaProgramKind, string> = {
  image: '참고이미지',
  youtube: '참고영상',
};

/**
 * 제목을 비워두면 날짜·예배·종류로 자동 생성한다.
 * 예: '20260802-주일낮예배-참고이미지'
 */
export function defaultMediaProgramTitle(
  serviceDate: string,
  serviceType: string,
  kind: MediaProgramKind,
): string {
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(serviceDate) ? serviceDate.replaceAll('-', '') : '';
  return [dateKey, serviceType.trim(), KIND_SUFFIX[kind]].filter(Boolean).join('-');
}
