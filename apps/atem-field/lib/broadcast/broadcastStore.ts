/**
 * broadcastStore.ts
 * 송출(Broadcast) 전용 Zustand 스토어
 *
 * UnoLive 기존 store(lib/store.ts)와 완전히 독립:
 * - 향후 미디어 웹포털에서도 독립적으로 재사용 가능
 * - localStorage persist: 민감하지 않은 설정만 저장
 * - 스트림 키는 저장은 하되, 향후 서버 암호화로 마이그레이션 가능한 구조
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  BroadcastState,
  RecordingSettings,
  YouTubeLiveConfig,
  CustomLiveConfig,
  LiveProvider,
  LiveStatus,
  LiveStats,
  DEFAULT_RECORDING_SETTINGS,
  DEFAULT_YOUTUBE_CONFIG,
  DEFAULT_CUSTOM_CONFIG,
  EMPTY_LIVE_STATS,
} from './broadcastTypes';

// ─────────────────────────────────────────
// 노옵 스토리지 (SSR 가드)
// ─────────────────────────────────────────
const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

// ─────────────────────────────────────────
// Store 인터페이스
// ─────────────────────────────────────────
interface BroadcastStoreState extends BroadcastState {
  // ── 녹화 액션 ──
  startRecording: () => void;
  stopRecording: () => void;
  updateRecordingSettings: (settings: Partial<RecordingSettings>) => void;

  // ── 라이브 액션 ──
  setLiveStatus: (status: LiveStatus) => void;
  startLive: () => void;
  stopLive: () => void;
  setLiveError: (message: string | null) => void;
  updateLiveStats: (stats: Partial<LiveStats>) => void;

  // ── 라이브 설정 액션 ──
  setLiveProvider: (provider: LiveProvider) => void;
  updateYouTubeConfig: (config: Partial<YouTubeLiveConfig>) => void;
  updateCustomConfig: (config: Partial<CustomLiveConfig>) => void;

  // ── 헬퍼 ──
  /** 라이브 설정이 유효한지 (스트림 키가 있는지) */
  isLiveConfigValid: () => boolean;
}

// ─────────────────────────────────────────
// Store 구현
// ─────────────────────────────────────────
export const useBroadcastStore = create<BroadcastStoreState>()(
  persist(
    (set, get) => ({
      // ── 초기 상태 ──
      isRecording: false,
      recordingStartedAt: null,
      recordingSettings: { ...DEFAULT_RECORDING_SETTINGS },

      liveStatus: 'idle',
      liveStartedAt: null,
      liveProvider: 'youtube',
      youtubeConfig: { ...DEFAULT_YOUTUBE_CONFIG },
      customConfig: { ...DEFAULT_CUSTOM_CONFIG },
      liveStats: { ...EMPTY_LIVE_STATS },
      liveError: null,

      // ── 녹화 액션 ──
      startRecording: () =>
        set({
          isRecording: true,
          recordingStartedAt: Date.now(),
        }),

      stopRecording: () =>
        set({
          isRecording: false,
          recordingStartedAt: null,
        }),

      updateRecordingSettings: (settings) =>
        set((state) => ({
          recordingSettings: { ...state.recordingSettings, ...settings },
        })),

      // ── 라이브 액션 ──
      setLiveStatus: (status) => set({ liveStatus: status }),

      startLive: () =>
        set({
          liveStatus: 'connecting',
          liveStartedAt: Date.now(),
          liveError: null,
          liveStats: { ...EMPTY_LIVE_STATS },
        }),

      stopLive: () =>
        set({
          liveStatus: 'idle',
          liveStartedAt: null,
          liveError: null,
          liveStats: { ...EMPTY_LIVE_STATS },
        }),

      setLiveError: (message) =>
        set({
          liveStatus: message ? 'error' : 'idle',
          liveError: message,
        }),

      updateLiveStats: (stats) =>
        set((state) => ({
          liveStats: { ...state.liveStats, ...stats },
        })),

      // ── 라이브 설정 액션 ──
      setLiveProvider: (provider) => set({ liveProvider: provider }),

      updateYouTubeConfig: (config) =>
        set((state) => ({
          youtubeConfig: { ...state.youtubeConfig, ...config },
        })),

      updateCustomConfig: (config) =>
        set((state) => ({
          customConfig: { ...state.customConfig, ...config },
        })),

      // ── 헬퍼 ──
      isLiveConfigValid: () => {
        const s = get();
        if (s.liveProvider === 'youtube') {
          return s.youtubeConfig.streamKey.trim().length > 0;
        }
        return (
          s.customConfig.streamKey.trim().length > 0 &&
          s.customConfig.streamUrl.trim().length > 0
        );
      },
    }),
    {
      name: 'unoLive-broadcast-store',
      version: 2,
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : noopStorage
      ),
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<BroadcastStoreState>;
        if (version < 2) {
          return {
            ...state,
            recordingSettings: {
              ...DEFAULT_RECORDING_SETTINGS,
              ...state.recordingSettings,
              format: 'mp4',
            },
          };
        }
        return state;
      },
      // 런타임 상태(isRecording, liveStatus 등)는 persist 하지 않음
      partialize: (state) => ({
        recordingSettings: state.recordingSettings,
        liveProvider: state.liveProvider,
        youtubeConfig: state.youtubeConfig,
        customConfig: state.customConfig,
      }),
    }
  )
);
