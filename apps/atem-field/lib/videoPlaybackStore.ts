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
  /**
   * [FEATURE: PAUSED_BROADCAST] 운영자가 컨트롤 바에서 **직접 멈춰 둔** 상태인가.
   *
   * `isPlaying: false` 로는 판단할 수 없다. 한 번도 재생하지 않은 새 영상도
   * `isPlaying: false` 라서, 그것까지 "멈춤"으로 보면 정상 자동재생이 막힌다.
   * 그래서 ⏸·■ 를 누른 경우에만 켜고, ▶ 를 누르면 끈다.
   *
   * 이 값이 true 면 섹션을 송출해도 자동재생하지 않고 **멈춘 그 화면 그대로**
   * 내보낸다(정지 화면 송출).
   */
  pausedByOperator: boolean;
}

const DEFAULT_STATE: PlaybackState = {
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  pausedByOperator: false,
};

const store = new Map<string, PlaybackState>();

/** 재생 상태 업데이트 (VideoControlBar 에서 호출) */
export function setPlaybackState(youtubeId: string, state: Partial<PlaybackState>): void {
  const prev = store.get(youtubeId) ?? DEFAULT_STATE;
  store.set(youtubeId, { ...prev, ...state });
}

/** 재생 상태 읽기 (SetlistPanel 에서 송출 시 호출) */
export function getPlaybackState(youtubeId: string): PlaybackState {
  return store.get(youtubeId) ?? DEFAULT_STATE;
}

/** 특정 영상의 재생 상태 초기화 */
export function clearPlaybackState(youtubeId: string): void {
  store.delete(youtubeId);
}
