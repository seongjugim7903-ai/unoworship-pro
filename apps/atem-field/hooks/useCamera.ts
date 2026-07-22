'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export function useCamera(deviceId?: string, options?: { skip?: boolean }) {
  const skip = options?.skip ?? false;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const startCamera = useCallback(async (targetDeviceId?: string) => {
    try {
      // Stop existing stream
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: targetDeviceId
          ? {
              deviceId: { exact: targetDeviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 60 },
            }
          : {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 60 },
            },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[Camera] 스트림 획득:', targetDeviceId ?? 'default', mediaStream.getVideoTracks()[0]?.label);
      setStream(mediaStream);
      setError(null);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // 스트림 교체 후 명시적으로 재생 시작
        try {
          await videoRef.current.play();
        } catch {
          // autoPlay 정책으로 막히는 경우 무시 (muted이므로 보통 허용됨)
        }
      }

      // Enumerate devices after getting permission
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(allDevices.filter((d) => d.kind === 'videoinput'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera access failed');
    }
  }, [stream]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  useEffect(() => {
    if (skip) return;
    startCamera(deviceId);
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      stream?.getTracks().forEach((track) => track.stop());
    };
    // Only run on mount and deviceId change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, skip]);

  // ── 핫플러그: 카메라 연결/해제 시 devices 갱신 + 트랙 종료 감지 시 재시작 ──
  useEffect(() => {
    if (skip) return;
    const handleDeviceChange = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === 'videoinput'));

        // 현재 스트림의 트랙이 끊긴 경우 재시작 (케이블 재연결 등)
        if (stream) {
          const track = stream.getVideoTracks()[0];
          if (track && track.readyState === 'ended') {
            console.log('[useCamera] 트랙 종료 감지 — 재시작');
            startCamera(deviceId);
          }
        } else if (deviceId) {
          // stream 이 없지만 deviceId 는 있는 경우 → 재시도
          console.log('[useCamera] 스트림 없음 — 재시도');
          startCamera(deviceId);
        }
      } catch { /* ignore */ }
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, stream, skip]);

  return { videoRef, stream, error, devices, startCamera, stopCamera };
}
