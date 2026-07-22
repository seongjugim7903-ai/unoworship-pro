'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ATEM_USB_DEVICE_LABEL_STORAGE_KEY,
  chooseAtemUsbDevice,
  isSupportedCaptureLabel,
} from './deviceSelection';
import type {
  AtemUsbCaptureDiagnostics,
  AtemUsbDeviceOption,
} from './types';

const WAIT_FOR_DEVICE_MS = 2_000;
const MUTED_RECOVERY_MS = 8_000;
const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;
const TARGET_FRAME_RATE = 30;

function readStoredDeviceLabel(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ATEM_USB_DEVICE_LABEL_STORAGE_KEY);
}

function toDeviceOptions(devices: MediaDeviceInfo[]): AtemUsbDeviceOption[] {
  return devices
    .filter(
      (device) =>
        device.kind === 'videoinput' &&
        device.label &&
        isSupportedCaptureLabel(device.label),
    )
    .map((device) => ({ deviceId: device.deviceId, label: device.label }));
}

async function enumerateLabeledVideoDevices(): Promise<MediaDeviceInfo[]> {
  let devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter((device) => device.kind === 'videoinput');

  if (videoDevices.length > 0 && videoDevices.every((device) => !device.label)) {
    const permissionStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 320 }, height: { ideal: 180 } },
      audio: false,
    });
    permissionStream.getTracks().forEach((track) => track.stop());
    devices = await navigator.mediaDevices.enumerateDevices();
  }

  return devices;
}

function emptyDiagnostics(): AtemUsbCaptureDiagnostics {
  return {
    status: 'checking-permission',
    selectedDeviceLabel: null,
    selectedDeviceId: null,
    width: null,
    height: null,
    frameRate: null,
    trackState: 'none',
    muted: false,
    acquireAttempts: 0,
    recoveries: 0,
    lastRecoveryReason: null,
    lastAcquiredAt: null,
  };
}

export function useAtemUsbCapture() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<AtemUsbDeviceOption[]>([]);
  const [preferredLabel, setPreferredLabelState] = useState<string | null>(
    readStoredDeviceLabel,
  );
  const [diagnostics, setDiagnostics] =
    useState<AtemUsbCaptureDiagnostics>(emptyDiagnostics);
  const [error, setError] = useState<string | null>(null);
  const [restartNonce, setRestartNonce] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const mutedTimerRef = useRef<number | null>(null);

  const stopCurrentStream = useCallback(() => {
    if (mutedTimerRef.current !== null) {
      window.clearTimeout(mutedTimerRef.current);
      mutedTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const requestRecovery = useCallback((reason: string) => {
    setDiagnostics((current) => ({
      ...current,
      status: 'recovering',
      recoveries: current.recoveries + 1,
      lastRecoveryReason: reason,
    }));
    setRestartNonce((current) => current + 1);
  }, []);

  const setPreferredLabel = useCallback((label: string | null) => {
    if (label) {
      window.localStorage.setItem(ATEM_USB_DEVICE_LABEL_STORAGE_KEY, label);
    } else {
      window.localStorage.removeItem(ATEM_USB_DEVICE_LABEL_STORAGE_KEY);
    }
    setPreferredLabelState(label);
    setRestartNonce((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
      setDiagnostics((current) => ({ ...current, status: 'unsupported' }));
      setError('이 브라우저는 카메라 장치 API를 지원하지 않습니다.');
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;
    let currentDeviceId: string | null = null;
    let detachTrackListeners: (() => void) | null = null;

    const scheduleDeviceRetry = () => {
      if (cancelled) return;
      retryTimer = window.setTimeout(() => {
        setRestartNonce((current) => current + 1);
      }, WAIT_FOR_DEVICE_MS);
    };

    const acquire = async () => {
      stopCurrentStream();
      setError(null);
      setDiagnostics((current) => ({
        ...current,
        status: 'checking-permission',
        acquireAttempts: current.acquireAttempts + 1,
        trackState: 'none',
        muted: false,
      }));

      try {
        const allDevices = await enumerateLabeledVideoDevices();
        if (cancelled) return;
        setDevices(toDeviceOptions(allDevices));

        const selected = chooseAtemUsbDevice(allDevices, preferredLabel);
        if (!selected) {
          setDiagnostics((current) => ({
            ...current,
            status: 'waiting-device',
            selectedDeviceId: null,
            selectedDeviceLabel: preferredLabel,
          }));
          setError(
            preferredLabel
              ? `저장된 장치 '${preferredLabel}'를 기다리는 중입니다.`
              : 'Blackmagic/ATEM USB 영상 장치를 기다리는 중입니다.',
          );
          scheduleDeviceRetry();
          return;
        }

        currentDeviceId = selected.deviceId;
        setDiagnostics((current) => ({
          ...current,
          status: 'connecting',
          selectedDeviceId: selected.deviceId,
          selectedDeviceLabel: selected.label,
        }));

        if (!preferredLabel) {
          window.localStorage.setItem(
            ATEM_USB_DEVICE_LABEL_STORAGE_KEY,
            selected.label,
          );
        }

        const capture = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: selected.deviceId },
            width: { ideal: TARGET_WIDTH },
            height: { ideal: TARGET_HEIGHT },
            frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
          },
          audio: false,
        });

        if (cancelled) {
          capture.getTracks().forEach((track) => track.stop());
          return;
        }

        const track = capture.getVideoTracks()[0];
        if (!track) throw new Error('ATEM USB 비디오 트랙을 찾지 못했습니다.');
        track.contentHint = 'motion';
        const settings = track.getSettings();

        const handleEnded = () => requestRecovery('capture-track-ended');
        const handleMute = () => {
          setDiagnostics((current) => ({ ...current, muted: true }));
          if (mutedTimerRef.current !== null) {
            window.clearTimeout(mutedTimerRef.current);
          }
          mutedTimerRef.current = window.setTimeout(() => {
            if (track.muted || track.readyState !== 'live') {
              requestRecovery('capture-track-muted');
            }
          }, MUTED_RECOVERY_MS);
        };
        const handleUnmute = () => {
          if (mutedTimerRef.current !== null) {
            window.clearTimeout(mutedTimerRef.current);
            mutedTimerRef.current = null;
          }
          setDiagnostics((current) => ({ ...current, muted: false }));
        };

        track.addEventListener('ended', handleEnded, { once: true });
        track.addEventListener('mute', handleMute);
        track.addEventListener('unmute', handleUnmute);

        streamRef.current = capture;
        setStream(capture);
        setDiagnostics((current) => ({
          ...current,
          status: 'live',
          selectedDeviceId: selected.deviceId,
          selectedDeviceLabel: selected.label,
          width: settings.width ?? null,
          height: settings.height ?? null,
          frameRate: settings.frameRate ?? null,
          trackState: track.readyState,
          muted: track.muted,
          lastAcquiredAt: Date.now(),
        }));

        detachTrackListeners = () => {
          track.removeEventListener('ended', handleEnded);
          track.removeEventListener('mute', handleMute);
          track.removeEventListener('unmute', handleUnmute);
        };
      } catch (caught) {
        if (cancelled) return;
        const domError = caught instanceof DOMException ? caught : null;
        const message = caught instanceof Error ? caught.message : String(caught);
        const permissionBlocked =
          domError?.name === 'NotAllowedError' || domError?.name === 'SecurityError';

        setDiagnostics((current) => ({
          ...current,
          status: permissionBlocked ? 'permission-blocked' : 'error',
          trackState: 'none',
        }));
        setError(message);
        if (!permissionBlocked) scheduleDeviceRetry();
      }
    };

    void acquire();

    const handleDeviceChange = async () => {
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setDevices(toDeviceOptions(allDevices));
        if (
          !currentDeviceId ||
          !allDevices.some((device) => device.deviceId === currentDeviceId)
        ) {
          setRestartNonce((current) => current + 1);
        }
      } catch {
        // 다음 자동 재시도에서 다시 확인한다.
      }
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      detachTrackListeners?.();
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      stopCurrentStream();
    };
  }, [preferredLabel, requestRecovery, restartNonce, stopCurrentStream]);

  return {
    stream,
    devices,
    preferredLabel,
    diagnostics,
    error,
    setPreferredLabel,
    restart: requestRecovery,
  };
}
