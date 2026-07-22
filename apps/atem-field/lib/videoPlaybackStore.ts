/**
 * lib/videoPlaybackStore.ts
 * 영상 재생 위치를 모듈 레벨에서 관리하는 경량 저장소
 *
 * - Zustand 에 넣으면 매초 리렌더링이 발생하므로 별도 관리
 * - VideoControlBar 가 currentTime 을 기록
 * - SetlistPanel 이 송출 시 현재 위치를 읽어서 출력 PC 에 전달
 */

interface PlaybackState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

const store = new Map<string, PlaybackState>();

/** 재생 상태 업데이트 (VideoControlBar 에서 호출) */
export function setPlaybackState(youtubeId: string, state: Partial<PlaybackState>): void {
  const prev = store.get(youtubeId) ?? { currentTime: 0, duration: 0, isPlaying: false };
  store.set(youtubeId, { ...prev, ...state });
}

/** 재생 상태 읽기 (SetlistPanel 에서 송출 시 호출) */
export function getPlaybackState(youtubeId: string): PlaybackState {
  return store.get(youtubeId) ?? { currentTime: 0, duration: 0, isPlaying: false };
}

/** 특정 영상의 재생 상태 초기화 */
export function clearPlaybackState(youtubeId: string): void {
  store.delete(youtubeId);
}
