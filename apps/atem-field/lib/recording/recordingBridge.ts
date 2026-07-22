'use client';

export interface RecordingBridgeStartOptions {
  fileName: string;
  mimeType: string;
  outputFormat: 'mp4' | 'mov' | 'webm';
  videoBitrate?: number;
  fps?: 30 | 60;
}

export interface RecordingBridgeStartResult {
  ok: boolean;
  error?: string;
  filePath?: string;
  fileName?: string;
  directory?: string;
  startedAt?: number;
  mimeType?: string;
  outputFormat?: 'mp4' | 'mov' | 'webm';
}

export interface RecordingBridgeWriteResult {
  ok: boolean;
  error?: string;
  bytesWritten?: number;
}

export interface RecordingBridgeStopResult {
  ok: boolean;
  error?: string;
  filePath?: string;
  fileName?: string;
  size?: number;
  verified?: boolean;
  startedAt?: number;
  endedAt?: number;
  mimeType?: string;
  outputFormat?: 'mp4' | 'mov' | 'webm';
}

export interface RecordingBridgeStatusResult {
  active: boolean;
  filePath?: string;
  bytesWritten?: number;
  startedAt?: number;
}

export interface RecordingBridgeRevealResult {
  ok: boolean;
  error?: string;
  path?: string;
}

export interface RecordingBridge {
  start: (opts: RecordingBridgeStartOptions) => Promise<RecordingBridgeStartResult>;
  pushChunk: (chunk: ArrayBuffer) => Promise<RecordingBridgeWriteResult>;
  stop: () => Promise<RecordingBridgeStopResult>;
  abort: () => Promise<{ ok: boolean; error?: string }>;
  status: () => Promise<RecordingBridgeStatusResult>;
  reveal?: (targetPath?: string) => Promise<RecordingBridgeRevealResult>;
}

export function getRecordingBridge(): RecordingBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    unolive?: {
      recording?: RecordingBridge;
      markerRecording?: RecordingBridge;
    };
  };
  return w.unolive?.recording ?? null;
}

export function getMarkerRecordingBridge(): RecordingBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    unolive?: {
      markerRecording?: RecordingBridge;
    };
  };
  return w.unolive?.markerRecording ?? null;
}
