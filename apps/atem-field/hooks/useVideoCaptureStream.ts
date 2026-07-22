'use client';

// 선택한 비디오 캡처 장치(예: ATEM USB-C 웹캠 출력)의 MediaStream 을 관리하는 훅.
// composer 는 localhost(보안 컨텍스트)라 getUserMedia 직접 사용 가능.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface CaptureDevice {
  deviceId: string;
  label: string;
}

export interface VideoCaptureState {
  devices: CaptureDevice[];
  stream: MediaStream | null;
  status: 'idle' | 'starting' | 'live' | 'error';
  error: string | null;
  refreshDevices: () => void;
  /** 카메라/캡처 권한을 요청한다. 허용 전에는 deviceId 가 비어 장치 선택이 불가하다. */
  requestPermission: () => Promise<void>;
}

/** deviceId 가 null 이면 캡처를 끈다. deviceId 지정 시 그 장치의 스트림을 연다. */
export function useVideoCaptureStream(deviceId: string | null): VideoCaptureState {
  const [devices, setDevices] = useState<CaptureDevice[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'live' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const refreshDevices = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => {
        // 권한 허용 전에는 deviceId 가 빈 문자열이라 선택이 불가하다 → 유효한 장치만 노출.
        setDevices(
          all
            .filter((d) => d.kind === 'videoinput' && d.deviceId)
            .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `비디오 장치 ${i + 1}` })),
        );
      })
      .catch(() => {});
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach((t) => t.stop()); // 권한 확보 + 라벨 노출용, 스트림은 즉시 정리
      refreshDevices();
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : '카메라 권한이 거부되었습니다.');
    }
  }, [refreshDevices]);

  useEffect(() => {
    refreshDevices();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    navigator.mediaDevices.addEventListener?.('devicechange', refreshDevices);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    let cancelled = false;

    const stopCurrent = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    if (!deviceId) {
      stopCurrent();
      // effect 동기 setState 회피(cascading render 규칙) — 마이크로태스크로 반영
      queueMicrotask(() => {
        if (cancelled) return;
        setStream(null);
        setStatus('idle');
        setError(null);
      });
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      if (!cancelled) setStatus('starting');
    });
    navigator.mediaDevices
      .getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stopCurrent();
        streamRef.current = s;
        setStream(s);
        setStatus('live');
        setError(null);
        refreshDevices(); // 권한 허용 후에는 라벨이 채워진다
      })
      .catch((e) => {
        if (cancelled) return;
        setStream(null);
        setStatus('error');
        setError(e instanceof Error ? e.message : '캡처 장치를 열 수 없습니다.');
      });

    return () => {
      cancelled = true;
    };
  }, [deviceId, refreshDevices]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  return { devices, stream, status, error, refreshDevices, requestPermission };
}
