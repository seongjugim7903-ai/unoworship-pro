// 설교 참고용 유튜브 링크를 videoId·썸네일로 푼다.
// 정규식은 UnoLive `lib/youtube.ts` 의 extractYouTubeId 와 같은 규칙이라
// 여기서 통과한 링크는 컴포저에서도 그대로 임베드된다.

const YOUTUBE_ID = /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

/** 링크에서 11자리 영상 ID 추출. 못 찾으면 null */
export function extractYoutubeId(url: string): string | null {
  return YOUTUBE_ID.exec(url.trim())?.[1] ?? null;
}

/** 미리보기용 썸네일 (UnoLive getThumbnailUrl 의 'hq' 와 동일) */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export interface YoutubeLinkResult {
  ok: boolean;
  videoId: string;
  thumbnailUrl: string;
  /** ok 가 false 일 때 사용자에게 보여줄 사유 */
  message: string;
}

/** 입력창에서 바로 쓰는 검사 — 실패해도 던지지 않고 사유를 돌려준다 */
export function parseYoutubeLink(url: string): YoutubeLinkResult {
  const trimmed = url.trim();
  if (!trimmed) {
    return { ok: false, videoId: '', thumbnailUrl: '', message: '링크를 입력해 주세요.' };
  }

  const videoId = extractYoutubeId(trimmed);
  if (!videoId) {
    return {
      ok: false,
      videoId: '',
      thumbnailUrl: '',
      message: '유튜브 링크를 알아보지 못했습니다. 주소창의 링크를 그대로 붙여넣어 주세요.',
    };
  }

  return { ok: true, videoId, thumbnailUrl: youtubeThumbnailUrl(videoId), message: '' };
}
