/**
 * lib/youtube.ts
 * 유튜브 링크 파싱 및 임베드 URL 변환 유틸리티
 */

/**
 * 유튜브 URL 에서 video ID 추출
 * 지원 형식:
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *   https://youtu.be/VIDEO_ID
 *   https://www.youtube.com/embed/VIDEO_ID
 *   https://youtube.com/shorts/VIDEO_ID
 */
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** 유튜브 임베드 URL 생성 (자동재생, 컨트롤 표시) */
export function getEmbedUrl(videoId: string, options?: {
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  start?: number;
}): string {
  const params = new URLSearchParams({
    enablejsapi: '1',
    rel: '0',
  });

  // origin: localhost 에서는 일부 유튜브 영상이 임베드 차단되므로 LAN IP일 때만 설정
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      params.set('origin', origin);
    }
  }

  if (options?.autoplay) params.set('autoplay', '1');
  if (options?.muted) params.set('mute', '1');
  if (options?.loop) {
    params.set('loop', '1');
    params.set('playlist', videoId);
  }
  if (options?.start) params.set('start', String(options.start));

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

/** 유튜브 썸네일 URL */
export function getThumbnailUrl(videoId: string, quality: 'default' | 'hq' | 'maxres' = 'hq'): string {
  const qualityMap = {
    default: 'default',
    hq: 'hqdefault',
    maxres: 'maxresdefault',
  };
  return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}.jpg`;
}
