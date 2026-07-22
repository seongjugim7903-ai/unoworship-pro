/**
 * broadcastTypes.ts
 * 송출(Broadcast) 도메인 타입 정의 — 녹화 + 라이브 스트리밍
 *
 * 원맨 방송 교회용 설계:
 * - YouTube Live를 1순위 타겟 (RTMP)
 * - 로컬 녹화는 브라우저 단독으로 처리 (MediaRecorder)
 * - 라이브는 서버 ffmpeg-static 경유 (Phase 3)
 */

// ─────────────────────────────────────────
// 녹화
// ─────────────────────────────────────────
export type RecordingQuality = '1080p' | '720p' | '480p';

export interface RecordingSettings {
  quality: RecordingQuality;
  fps: 30 | 60;
  /** 오디오 소스 */
  audioSource: 'none' | 'microphone' | 'system' | 'both';
  /** 파일 포맷 */
  format: 'mp4' | 'mov' | 'webm';
}

export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  quality: '1080p',
  fps: 30,
  audioSource: 'microphone',
  format: 'mp4',
};

// ─────────────────────────────────────────
// 라이브 스트리밍
// ─────────────────────────────────────────
export type LiveProvider = 'youtube' | 'custom';

export type LivePrivacy = 'public' | 'unlisted' | 'private';

/** YouTube Live 설정 */
export interface YouTubeLiveConfig {
  /** 스트림 키 (민감 정보 — localStorage 저장 시 경고) */
  streamKey: string;
  /** 기본: rtmp://a.rtmp.youtube.com/live2 */
  streamUrl: string;
  /** 로컬 UI 표시용 방송 제목 (YouTube API 미사용 시) */
  title: string;
  /** 공개 범위 */
  privacy: LivePrivacy;
  /** 저지연 모드 (YouTube 기본 지원) */
  lowLatency: boolean;
}

export const DEFAULT_YOUTUBE_CONFIG: YouTubeLiveConfig = {
  streamKey: '',
  streamUrl: 'rtmp://a.rtmp.youtube.com/live2',
  title: '',
  privacy: 'unlisted',
  lowLatency: true,
};

/** 커스텀 RTMP 엔드포인트 (Twitch, Facebook 등) */
export interface CustomLiveConfig {
  streamKey: string;
  streamUrl: string;
  title: string;
}

export const DEFAULT_CUSTOM_CONFIG: CustomLiveConfig = {
  streamKey: '',
  streamUrl: '',
  title: '',
};

// ─────────────────────────────────────────
// 라이브 상태
// ─────────────────────────────────────────
/** 라이브 스트림 런타임 상태 */
export type LiveStatus =
  | 'idle'          // 대기
  | 'connecting'    // 서버 연결 중
  | 'live'          // 송출 중
  | 'reconnecting'  // 재연결 시도 중
  | 'error';        // 오류 상태

/** 라이브 실시간 통계 (Phase 3에서 서버로부터 수신) */
export interface LiveStats {
  bitrate: number;    // kbps
  fps: number;
  uptime: number;     // seconds
  droppedFrames: number;
}

export const EMPTY_LIVE_STATS: LiveStats = {
  bitrate: 0,
  fps: 0,
  uptime: 0,
  droppedFrames: 0,
};

// ─────────────────────────────────────────
// 전체 Broadcast 상태
// ─────────────────────────────────────────
export interface BroadcastState {
  // 녹화
  isRecording: boolean;
  recordingStartedAt: number | null;   // timestamp (ms)
  recordingSettings: RecordingSettings;

  // 라이브
  liveStatus: LiveStatus;
  liveStartedAt: number | null;         // timestamp (ms)
  liveProvider: LiveProvider;
  youtubeConfig: YouTubeLiveConfig;
  customConfig: CustomLiveConfig;
  liveStats: LiveStats;
  /** 라이브 오류 메시지 (liveStatus === 'error') */
  liveError: string | null;
}
