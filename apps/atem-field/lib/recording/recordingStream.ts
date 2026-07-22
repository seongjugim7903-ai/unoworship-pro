'use client';

import type { RecordingSettings } from '@/lib/broadcast/broadcastTypes';

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=h264,opus',
  'video/webm',
];

export function pickRecordingMimeType(preferredFormat: RecordingSettings['format']): string {
  if (preferredFormat === 'mp4') {
    // Browser MediaRecorder MP4 support is inconsistent. Electron writes the
    // chosen MP4/MOV container by piping these WebM chunks through ffmpeg.
  }
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  for (const mimeType of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
    } catch {
      // Ignore invalid platform probes.
    }
  }
  return 'video/webm';
}

export function extensionForMimeType(mimeType: string): 'webm' | 'mp4' {
  return mimeType.includes('mp4') ? 'mp4' : 'webm';
}

export function mimeTypeForOutputFormat(format: RecordingSettings['format']): string {
  if (format === 'mp4') return 'video/mp4';
  if (format === 'mov') return 'video/quicktime';
  return 'video/webm';
}

export function buildRecordingFileName(input: {
  worshipTitle?: string;
  startedAt: number;
  extension: string;
  quality?: string;
}): string {
  const title = sanitizeFileName(input.worshipTitle?.trim() || 'UnoLive');
  const stamp = formatFileStamp(input.startedAt);
  return [stamp, title].filter(Boolean).join('_') + `.${input.extension}`;
}

export function buildMarkerRecordingFileName(input: {
  worshipTitle?: string;
  markerLabel?: string;
  startedAt: number;
  extension: string;
  quality?: string;
}): string {
  const marker = sanitizeFileName(input.markerLabel?.trim() || 'Marker');
  const stamp = formatFileStamp(input.startedAt);
  return [stamp, marker].filter(Boolean).join('_') + `.${input.extension}`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export async function buildRecordingMediaStream(
  videoStream: MediaStream,
  settings: RecordingSettings,
  options: { skipSystemAudioCapture?: boolean } = {}
): Promise<{ stream: MediaStream; cleanup: () => void; audioWarning?: string }> {
  const videoTracks = videoStream.getVideoTracks().filter((track) => track.readyState === 'live');
  const cleanupTasks: Array<() => void> = [];
  const audioTracks: MediaStreamTrack[] = [];
  const sourceAudioTracks = videoStream.getAudioTracks().filter((track) => track.readyState === 'live');
  let audioWarning: string | undefined;

  if (settings.audioSource !== 'none') {
    audioTracks.push(...sourceAudioTracks);
  }

  if (settings.audioSource === 'microphone' || settings.audioSource === 'both') {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioTracks.push(...mic.getAudioTracks());
      cleanupTasks.push(() => mic.getTracks().forEach((track) => track.stop()));
    } catch (err) {
      audioWarning = `마이크 오디오를 가져오지 못해 무음 트랙으로 녹화합니다: ${(err as Error).message}`;
    }
  }

  if (
    (settings.audioSource === 'system' || settings.audioSource === 'both') &&
    !options.skipSystemAudioCapture
  ) {
    const displayAudio = await tryCaptureDisplayAudio();
    if (displayAudio.stream) {
      audioTracks.push(...displayAudio.stream.getAudioTracks());
      cleanupTasks.push(() => displayAudio.stream?.getTracks().forEach((track) => track.stop()));
    } else if (!audioWarning) {
      audioWarning = displayAudio.warning;
    }
  } else if (
    (settings.audioSource === 'system' || settings.audioSource === 'both') &&
    sourceAudioTracks.length === 0 &&
    !audioWarning
  ) {
    audioWarning = options.skipSystemAudioCapture
      ? 'PGM canvas 녹화에서는 시스템 오디오 화면캡처를 사용하지 않습니다.'
      : '화면 캡처에서 시스템 오디오 트랙이 제공되지 않았습니다.';
  }

  let finalAudioTracks = audioTracks;
  if (settings.audioSource !== 'none' && finalAudioTracks.length === 0) {
    const silent = createSilentAudioTrack();
    if (silent) {
      finalAudioTracks = silent.stream.getAudioTracks();
      cleanupTasks.push(silent.cleanup);
    }
  }

  if (finalAudioTracks.length > 1) {
    const mixed = mixAudioTracks(finalAudioTracks);
    if (mixed) {
      finalAudioTracks = mixed.stream.getAudioTracks();
      cleanupTasks.push(mixed.cleanup);
    }
  }

  return {
    stream: new MediaStream([...videoTracks, ...finalAudioTracks]),
    cleanup: () => {
      cleanupTasks.forEach((cleanup) => cleanup());
    },
    audioWarning,
  };
}

function createSilentAudioTrack(): { stream: MediaStream; cleanup: () => void } | null {
  const AudioCtx = window.AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  const audioContext = new AudioCtx();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const destination = audioContext.createMediaStreamDestination();
  gain.gain.value = 0;
  oscillator.connect(gain).connect(destination);
  oscillator.start();

  return {
    stream: destination.stream,
    cleanup: () => {
      try { oscillator.stop(); } catch { /* ignore */ }
      try { oscillator.disconnect(); } catch { /* ignore */ }
      try { gain.disconnect(); } catch { /* ignore */ }
      try { void audioContext.close(); } catch { /* ignore */ }
    },
  };
}

function mixAudioTracks(tracks: MediaStreamTrack[]): { stream: MediaStream; cleanup: () => void } | null {
  const AudioCtx = window.AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  const audioContext = new AudioCtx();
  const destination = audioContext.createMediaStreamDestination();
  const sources = tracks.map((track) => {
    const source = audioContext.createMediaStreamSource(new MediaStream([track]));
    source.connect(destination);
    return source;
  });

  return {
    stream: destination.stream,
    cleanup: () => {
      sources.forEach((source) => {
        try { source.disconnect(); } catch { /* ignore */ }
      });
      try { void audioContext.close(); } catch { /* ignore */ }
    },
  };
}

async function tryCaptureDisplayAudio(): Promise<{ stream: MediaStream | null; warning?: string }> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return { stream: null, warning: '이 브라우저는 시스템 오디오 캡처를 지원하지 않습니다.' };
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    stream.getVideoTracks().forEach((track) => track.stop());
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      return { stream: null, warning: '시스템 오디오 트랙이 선택되지 않았습니다.' };
    }
    return { stream };
  } catch (err) {
    return {
      stream: null,
      warning: `시스템 오디오를 가져오지 못했습니다: ${(err as Error).message}`,
    };
  }
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[-_]|[-_]$/g, '')
    .slice(0, 80) || 'unolive-recording';
}

function formatFileStamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
