'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useBroadcastStore } from '@/lib/broadcast/broadcastStore';
import type { RecordingSettings } from '@/lib/broadcast/broadcastTypes';
import { useMediaStore } from '@/lib/media/mediaStore';
import type { RecordingRuntime, SessionClipMarker } from '@/lib/media/mediaTypes';
import {
  buildMarkerRecordingFileName,
  buildRecordingMediaStream,
  extensionForMimeType,
  mimeTypeForOutputFormat,
  pickRecordingMimeType,
} from '@/lib/recording/recordingStream';
import { getMarkerRecordingBridge, type RecordingBridge } from '@/lib/recording/recordingBridge';

const RECORDER_TIMESLICE_MS = 1_000;
const MAX_WRITE_FAILURES = 3;

interface UseClipMarkerRecordingOptions {
  stream: MediaStream | null;
}

export function useClipMarkerRecording({ stream }: UseClipMarkerRecordingOptions) {
  const settings = useBroadcastStore((s) => s.recordingSettings);
  const canControl = useMediaStore((s) => s.canControlBroadcast());
  const activeClip = useMediaStore((s) => s.getActiveClipMarker());
  const updateClipMarker = useMediaStore((s) => s.updateClipMarker);
  const worshipTitle = useMediaStore((s) => {
    const worship = s.worships.find((w) => w.id === s.session.worshipId);
    return worship?.title;
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const bridgeRef = useRef<RecordingBridge | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const clipIdRef = useRef<string | null>(null);
  const startingClipIdRef = useRef<string | null>(null);
  const stoppingRef = useRef(false);
  const bytesRef = useRef(0);
  const fatalErrorRef = useRef<string | null>(null);
  const writeFailuresRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const stopResolverRef = useRef<((ok: boolean) => void) | null>(null);

  const resetMarkerRefs = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    recorderRef.current = null;
    bridgeRef.current = null;
    clipIdRef.current = null;
    stoppingRef.current = false;
    bytesRef.current = 0;
    fatalErrorRef.current = null;
    writeFailuresRef.current = 0;
    writeQueueRef.current = Promise.resolve();
  }, []);

  const finalizeMarkerStop = useCallback(async () => {
    await writeQueueRef.current.catch(() => {
      // The write queue has already copied the failure into fatalErrorRef.
    });

    const bridge = bridgeRef.current;
    const clipId = clipIdRef.current;
    let ok = false;

    try {
      if (!clipId) return;
      if (!bridge) {
        throw new Error('마커 파일 저장 브리지가 준비되지 않았습니다.');
      }
      if (fatalErrorRef.current) {
        throw new Error(fatalErrorRef.current);
      }

      const result = await bridge.stop();
      if (!result.ok || !result.verified || !result.size || !result.filePath) {
        throw new Error(result.error ?? '마커 녹화 파일 검증에 실패했습니다.');
      }

      updateClipMarker(clipId, {
        fileStatus: 'ready',
        filePath: result.filePath,
        fileName: result.fileName,
        fileSize: result.size,
        mimeType: result.mimeType,
        fileError: undefined,
      });
      ok = true;
    } catch (err) {
      const message = (err as Error).message;
      if (clipId) {
        updateClipMarker(clipId, {
          fileStatus: 'failed',
          fileError: message,
        });
      }
      await bridge?.abort().catch(() => undefined);
    } finally {
      resetMarkerRefs();
      stopResolverRef.current?.(ok);
      stopResolverRef.current = null;
    }
  }, [resetMarkerRefs, updateClipMarker]);

  const handleMarkerChunk = useCallback((blob: Blob) => {
    if (blob.size <= 0) return;
    const clipId = clipIdRef.current;
    if (!clipId) return;

    writeQueueRef.current = writeQueueRef.current
      .then(async () => {
        const bridge = bridgeRef.current;
        if (!bridge) {
          throw new Error('마커 파일 저장 브리지가 준비되지 않았습니다.');
        }

        const buffer = await blob.arrayBuffer();
        const result = await bridge.pushChunk(buffer);
        if (!result.ok) {
          writeFailuresRef.current += 1;
          if (writeFailuresRef.current >= MAX_WRITE_FAILURES) {
            throw new Error(result.error ?? '마커 녹화 청크를 파일에 기록하지 못했습니다.');
          }
          return;
        }

        bytesRef.current = result.bytesWritten ?? (bytesRef.current + blob.size);
        updateClipMarker(clipId, { fileSize: bytesRef.current });
      })
      .catch((err) => {
        fatalErrorRef.current = (err as Error).message;
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
          try { recorder.stop(); } catch { /* ignore */ }
        }
      });
  }, [updateClipMarker]);

  const stopMarkerRecording = useCallback(async () => {
    if (stoppingRef.current) return false;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return false;

    stoppingRef.current = true;
    return await new Promise<boolean>((resolve) => {
      stopResolverRef.current = resolve;
      try {
        recorder.stop();
      } catch (err) {
        fatalErrorRef.current = (err as Error).message;
        stoppingRef.current = false;
        resolve(false);
      }
    });
  }, []);

  const startMarkerRecording = useCallback(async (clip: SessionClipMarker) => {
    if (!canControl) return false;
    if (clipIdRef.current === clip.id || startingClipIdRef.current === clip.id) return false;
    if (startingClipIdRef.current) return false;

    const videoTrack = stream?.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== 'live') {
      updateClipMarker(clip.id, {
        fileStatus: 'failed',
        fileError: 'PGM 합성 스트림이 아직 준비되지 않았습니다.',
      });
      return false;
    }

    const bridge = getMarkerRecordingBridge();
    if (!bridge) {
      updateClipMarker(clip.id, {
        fileStatus: 'failed',
        fileError: 'UnoLive 데스크탑 앱에서만 마커 파일을 저장할 수 있습니다.',
      });
      return false;
    }

    startingClipIdRef.current = clip.id;
    let cleanup: (() => void) | null = null;

    try {
      const mimeType = pickRecordingMimeType(settings.format);
      const outputFormat = settings.format;
      const outputMimeType = mimeTypeForOutputFormat(outputFormat);
      const fileName = buildMarkerRecordingFileName({
        worshipTitle,
        markerLabel: clip.label,
        startedAt: clip.startedAt,
        extension: outputFormat || extensionForMimeType(mimeType),
        quality: toRuntimeQuality(settings),
      });

      const media = await buildRecordingMediaStream(stream, settings, {
        skipSystemAudioCapture: true,
      });
      cleanup = media.cleanup;

      const recorder = new MediaRecorder(media.stream, buildRecorderOptions(settings, mimeType));
      const result = await bridge.start({
        fileName,
        mimeType,
        outputFormat,
        videoBitrate: videoBitrateForQuality(settings),
        fps: settings.fps,
      });
      if (!result.ok || !result.filePath) {
        throw new Error(result.error ?? '마커 녹화 파일을 열 수 없습니다.');
      }

      const latestActiveId = useMediaStore.getState().session.activeClipId;
      if (latestActiveId !== clip.id) {
        cleanup();
        await bridge.abort().catch(() => undefined);
        return false;
      }

      recorderRef.current = recorder;
      bridgeRef.current = bridge;
      cleanupRef.current = cleanup;
      clipIdRef.current = clip.id;
      bytesRef.current = 0;
      fatalErrorRef.current = null;
      writeFailuresRef.current = 0;
      writeQueueRef.current = Promise.resolve();

      recorder.ondataavailable = (event) => handleMarkerChunk(event.data);
      recorder.onerror = () => {
        fatalErrorRef.current = 'MediaRecorder 오류로 마커 녹화를 중단했습니다.';
        try { recorder.stop(); } catch { /* ignore */ }
      };
      recorder.onstop = () => {
        void finalizeMarkerStop();
      };

      updateClipMarker(clip.id, {
        fileStatus: 'recording',
        filePath: result.filePath,
        fileName: result.fileName ?? fileName,
        fileSize: 0,
        mimeType: result.mimeType ?? outputMimeType,
        fileError: undefined,
      });
      recorder.start(RECORDER_TIMESLICE_MS);
      return true;
    } catch (err) {
      const message = (err as Error).message;
      cleanup?.();
      await bridge.abort().catch(() => undefined);
      updateClipMarker(clip.id, {
        fileStatus: 'failed',
        fileError: message,
      });
      return false;
    } finally {
      startingClipIdRef.current = null;
    }
  }, [
    canControl,
    finalizeMarkerStop,
    handleMarkerChunk,
    settings,
    stream,
    updateClipMarker,
    worshipTitle,
  ]);

  useEffect(() => {
    if (!canControl) return;

    const runningClipId = clipIdRef.current;
    if (activeClip) {
      if (runningClipId === activeClip.id || startingClipIdRef.current === activeClip.id) return;
      if (runningClipId) {
        void stopMarkerRecording().finally(() => {
          void startMarkerRecording(activeClip);
        });
      } else {
        void startMarkerRecording(activeClip);
      }
      return;
    }

    if (runningClipId) {
      void stopMarkerRecording();
    }
  }, [
    activeClip,
    canControl,
    startMarkerRecording,
    stopMarkerRecording,
  ]);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* ignore */ }
      } else {
        void bridgeRef.current?.abort().catch(() => undefined);
        resetMarkerRefs();
      }
    };
  }, [resetMarkerRefs]);
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
