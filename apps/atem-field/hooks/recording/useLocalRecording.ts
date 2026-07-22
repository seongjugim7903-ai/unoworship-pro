'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBroadcastStore } from '@/lib/broadcast/broadcastStore';
import type { RecordingSettings } from '@/lib/broadcast/broadcastTypes';
import { useMediaStore } from '@/lib/media/mediaStore';
import type { RecordingRuntime } from '@/lib/media/mediaTypes';
import {
  buildRecordingFileName,
  buildRecordingMediaStream,
  downloadBlob,
  extensionForMimeType,
  mimeTypeForOutputFormat,
  pickRecordingMimeType,
} from '@/lib/recording/recordingStream';
import { getRecordingBridge, type RecordingBridge } from '@/lib/recording/recordingBridge';

const RECORDER_TIMESLICE_MS = 1_000;
const MAX_WRITE_FAILURES = 3;

interface UseLocalRecordingOptions {
  stream: MediaStream | null;
}

export function useLocalRecording({ stream }: UseLocalRecordingOptions) {
  const settings = useBroadcastStore((s) => s.recordingSettings);
  const markBroadcastRecordingStart = useBroadcastStore((s) => s.startRecording);
  const markBroadcastRecordingStop = useBroadcastStore((s) => s.stopRecording);

  const session = useMediaStore((s) => s.session);
  const canControl = useMediaStore((s) => s.canControlBroadcast());
  const worshipTitle = useMediaStore((s) => {
    const worship = s.worships.find((w) => w.id === s.session.worshipId);
    return worship?.title;
  });
  const startRecordingSession = useMediaStore((s) => s.startRecordingSession);
  const updateRecordingProgress = useMediaStore((s) => s.updateRecordingProgress);
  const finishRecordingSession = useMediaStore((s) => s.finishRecordingSession);
  const failRecordingSession = useMediaStore((s) => s.failRecordingSession);

  const [isStarting, setIsStarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioWarning, setAudioWarning] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const bridgeRef = useRef<RecordingBridge | null>(null);
  const browserChunksRef = useRef<Blob[]>([]);
  const bytesRef = useRef(0);
  const fileNameRef = useRef<string | null>(null);
  const mimeTypeRef = useRef('video/webm');
  const outputMimeTypeRef = useRef('video/webm');
  const fatalErrorRef = useRef<string | null>(null);
  const writeFailuresRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const stopResolverRef = useRef<((ok: boolean) => void) | null>(null);

  const isRecording = session.recording.active;
  const hasVideoStream = useMemo(() => {
    const track = stream?.getVideoTracks()[0];
    return !!track && track.readyState === 'live';
  }, [stream]);

  useEffect(() => {
    if (!isRecording || !session.recording.startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      setElapsed(Math.floor((Date.now() - session.recording.startedAt!) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRecording, session.recording.startedAt]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return false;

    return await new Promise<boolean>((resolve) => {
      stopResolverRef.current = resolve;
      try {
        recorder.stop();
      } catch (err) {
        fatalErrorRef.current = (err as Error).message;
        resolve(false);
      }
    });
  }, []);

  const finalizeStop = useCallback(async () => {
    await writeQueueRef.current.catch(() => {
      // The failure is already copied to fatalErrorRef in the write queue.
    });

    const bridge = bridgeRef.current;
    const fileName = fileNameRef.current ?? `unolive-recording.${extensionForMimeType(mimeTypeRef.current)}`;
    const endedAt = Date.now();
    let ok = false;

    try {
      if (fatalErrorRef.current) {
        throw new Error(fatalErrorRef.current);
      }

      if (bridge) {
        const result = await bridge.stop();
        if (!result.ok || !result.verified || !result.size || !result.filePath) {
          throw new Error(result.error ?? '녹화 파일 검증에 실패했습니다.');
        }
        finishRecordingSession({
          endedAt: result.endedAt ?? endedAt,
          filePath: result.filePath,
          fileSize: result.size,
          fileName: result.fileName ?? fileName,
          mimeType: result.mimeType ?? outputMimeTypeRef.current,
        });
      } else {
        const blob = new Blob(browserChunksRef.current, { type: mimeTypeRef.current });
        if (blob.size <= 0) {
          throw new Error('녹화 파일 크기가 0 bytes 입니다.');
        }
        downloadBlob(blob, fileName);
        finishRecordingSession({
          endedAt,
          filePath: `browser-download://${fileName}`,
          fileSize: blob.size,
          fileName,
          mimeType: mimeTypeRef.current,
        });
      }
      ok = true;
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      failRecordingSession(message);
      if (bridge) {
        await bridge.abort().catch(() => undefined);
      }
    } finally {
      cleanupRef.current?.();
      cleanupRef.current = null;
      recorderRef.current = null;
      bridgeRef.current = null;
      browserChunksRef.current = [];
      bytesRef.current = 0;
      fileNameRef.current = null;
      outputMimeTypeRef.current = 'video/webm';
      fatalErrorRef.current = null;
      writeFailuresRef.current = 0;
      writeQueueRef.current = Promise.resolve();
      markBroadcastRecordingStop();
      stopResolverRef.current?.(ok);
      stopResolverRef.current = null;
    }
  }, [failRecordingSession, finishRecordingSession, markBroadcastRecordingStop]);

  const handleChunk = useCallback((blob: Blob) => {
    if (blob.size <= 0) return;

    writeQueueRef.current = writeQueueRef.current
      .then(async () => {
        if (bridgeRef.current) {
          const buffer = await blob.arrayBuffer();
          const result = await bridgeRef.current.pushChunk(buffer);
          if (!result.ok) {
            writeFailuresRef.current += 1;
            if (writeFailuresRef.current >= MAX_WRITE_FAILURES) {
              throw new Error(result.error ?? '녹화 청크를 파일에 기록하지 못했습니다.');
            }
            return;
          }
          bytesRef.current = result.bytesWritten ?? (bytesRef.current + blob.size);
        } else {
          browserChunksRef.current.push(blob);
          bytesRef.current += blob.size;
        }
        updateRecordingProgress(bytesRef.current);
      })
      .catch((err) => {
        fatalErrorRef.current = (err as Error).message;
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
          try { recorder.stop(); } catch { /* ignore */ }
        }
      });
  }, [updateRecordingProgress]);

  const start = useCallback(async () => {
    if (!canControl) {
      setError('방송 제어 권한이 없습니다.');
      return false;
    }
    if (isRecording || isStarting) return false;
    if (typeof MediaRecorder === 'undefined') {
      setError('이 브라우저는 MediaRecorder 녹화를 지원하지 않습니다.');
      return false;
    }
    const videoTrack = stream?.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== 'live') {
      setError('PGM 합성 스트림이 아직 준비되지 않았습니다.');
      return false;
    }

    setIsStarting(true);
    setError(null);
    setAudioWarning(null);

    let bridge: RecordingBridge | null = null;
    let recorder: MediaRecorder | null = null;
    let cleanup: (() => void) | null = null;

    try {
      const startedAt = Date.now();
      bridge = getRecordingBridge();
      const mimeType = pickRecordingMimeType(settings.format);
      const outputFormat = bridge ? settings.format : extensionForMimeType(mimeType);
      const extension = outputFormat;
      const outputMimeType = bridge ? mimeTypeForOutputFormat(outputFormat) : mimeType;
      const fileName = buildRecordingFileName({
        worshipTitle,
        startedAt,
        extension,
        quality: toRuntimeQuality(settings),
      });

      const media = await buildRecordingMediaStream(stream, settings, {
        skipSystemAudioCapture: true,
      });
      cleanup = media.cleanup;
      setAudioWarning(media.audioWarning ?? null);

      recorder = new MediaRecorder(media.stream, buildRecorderOptions(settings, mimeType));
      let outputPath = bridge ? '로컬 녹화 파일 준비 중' : '브라우저 다운로드';
      let actualFileName = fileName;

      if (bridge) {
        const result = await bridge.start({
          fileName,
          mimeType,
          outputFormat,
          videoBitrate: videoBitrateForQuality(settings),
          fps: settings.fps,
        });
        if (!result.ok || !result.filePath) {
          throw new Error(result.error ?? '녹화 파일을 열 수 없습니다.');
        }
        outputPath = result.filePath;
        actualFileName = result.fileName ?? fileName;
      }

      recorderRef.current = recorder;
      cleanupRef.current = cleanup;
      bridgeRef.current = bridge;
      browserChunksRef.current = [];
      bytesRef.current = 0;
      fileNameRef.current = actualFileName;
      mimeTypeRef.current = mimeType;
      outputMimeTypeRef.current = outputMimeType;
      fatalErrorRef.current = null;
      writeFailuresRef.current = 0;
      writeQueueRef.current = Promise.resolve();

      recorder.ondataavailable = (event) => handleChunk(event.data);
      recorder.onerror = () => {
        fatalErrorRef.current = 'MediaRecorder 오류로 녹화를 중단했습니다.';
        setError(fatalErrorRef.current);
        try { recorder?.stop(); } catch { /* ignore */ }
      };
      recorder.onstop = () => {
        void finalizeStop();
      };

      startRecordingSession({
        startedAt,
        quality: toRuntimeQuality(settings),
        outputPath,
        fileName: actualFileName,
        mimeType: outputMimeType,
      });
      markBroadcastRecordingStart();
      recorder.start(RECORDER_TIMESLICE_MS);
      return true;
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      cleanup?.();
      await bridge?.abort().catch(() => undefined);
      failRecordingSession(message);
      return false;
    } finally {
      setIsStarting(false);
    }
  }, [
    canControl,
    failRecordingSession,
    finalizeStop,
    handleChunk,
    isRecording,
    isStarting,
    markBroadcastRecordingStart,
    settings,
    startRecordingSession,
    stream,
    worshipTitle,
  ]);

  const revealOutput = useCallback(async () => {
    const bridge = getRecordingBridge();
    if (!bridge?.reveal) {
      setError('데스크탑 앱에서만 녹화 파일 위치를 열 수 있습니다.');
      return false;
    }
    const result = await bridge.reveal(session.recording.outputPath);
    if (!result.ok) {
      setError(result.error ?? '녹화 파일 위치를 열지 못했습니다.');
      return false;
    }
    return true;
  }, [session.recording.outputPath]);

  const canRevealOutput = useMemo(() => {
    const bridge = getRecordingBridge();
    return !!bridge?.reveal && !!session.recording.outputPath;
  }, [session.recording.outputPath]);

  return {
    isAvailable: canControl && hasVideoStream,
    unavailableReason: !canControl
      ? '방송 제어 권한이 없습니다.'
      : !hasVideoStream
      ? 'PGM 합성 스트림 대기 중입니다.'
      : null,
    isStarting,
    isRecording,
    elapsed,
    elapsedFormatted: formatElapsed(elapsed),
    error: error ?? session.recording.lastError ?? null,
    audioWarning,
    fileSize: session.recording.fileSize,
    fileName: session.recording.fileName,
    outputPath: session.recording.outputPath,
    settings,
    start,
    stop,
    revealOutput,
    canRevealOutput,
  };
}

function buildRecorderOptions(
  settings: RecordingSettings,
  mimeType: string
): MediaRecorderOptions {
  const options: MediaRecorderOptions = {
    mimeType,
    videoBitsPerSecond: videoBitrateForQuality(settings),
  };
  if (settings.audioSource !== 'none') {
    options.audioBitsPerSecond = 128_000;
  }
  return options;
}

function videoBitrateForQuality(settings: RecordingSettings): number {
  if (settings.quality === '480p') return 2_500_000;
  if (settings.quality === '720p') return settings.fps === 60 ? 6_000_000 : 4_500_000;
  return settings.fps === 60 ? 10_000_000 : 8_000_000;
}

function toRuntimeQuality(settings: RecordingSettings): RecordingRuntime['quality'] {
  if (settings.quality === '720p') return settings.fps === 60 ? '720p60' : '720p30';
  return settings.fps === 60 ? '1080p60' : '1080p30';
}

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
