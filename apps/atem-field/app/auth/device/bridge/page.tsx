'use client';

/**
 * /auth/device/bridge
 *
 * Electron 로그인 창 전용 브릿지 페이지.
 * 로그인이 완료된 상태에서 이 페이지가 뜨면:
 *   1. /api/auth/device/issue 호출 → 토큰 발급
 *   2. window.unolive.device.issued(...) 로 Electron main 에 전달
 *   3. main 이 창을 닫음
 *
 * 브라우저(비-Electron)에서 실수로 이 URL 에 접근하면 안내 메시지만 표시.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface Win {
  unolive?: {
    device?: {
      type?: string;
      name?: string;
      osPlatform?: string;
      issued?: (payload: unknown) => void;
      cancelled?: () => void;
    };
  };
}

function DeviceBridgePageInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'not_electron'>('loading');
  const [message, setMessage] = useState('기기를 인증하는 중...');

  useEffect(() => {
    const w = (typeof window !== 'undefined' ? window : {}) as Win;
    const device = w.unolive?.device;

    // Electron 가 아니면 안내만 하고 종료
    if (!device?.issued) {
      queueMicrotask(() => {
        setStatus('not_electron');
        setMessage('이 페이지는 UnoLive 앱에서만 열 수 있습니다.');
      });
      return;
    }

    const deviceType   = device.type       ?? params.get('device_type')   ?? 'server';
    const deviceName   = device.name       ?? params.get('device_name')   ?? 'Unknown Device';
    const osPlatform   = device.osPlatform ?? params.get('os_platform')   ?? undefined;

    (async () => {
      try {
        const res = await fetch('/api/auth/device/issue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_type: deviceType,
            device_name: deviceName,
            os_platform: osPlatform,
            app_version: '0.1.0',
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setStatus('error');
          setMessage(`인증 실패: ${body.error ?? res.status}`);
          return;
        }

        const body = await res.json();
        device.issued!(body);
        setStatus('success');
        setMessage('인증 완료. 잠시 후 창이 닫힙니다.');
      } catch (err) {
        setStatus('error');
        setMessage(`네트워크 오류: ${(err as Error).message}`);
      }
    })();
  }, [params]);

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: '#f8fafc', colorScheme: 'light' }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
        {status === 'loading' && (
          <div className="space-y-3">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
            <p className="text-sm text-gray-600">{message}</p>
          </div>
        )}
        {status === 'success' && (
          <div className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">✓</div>
            <h1 className="text-lg font-bold text-gray-900">인증 완료</h1>
            <p className="text-sm text-gray-600">{message}</p>
          </div>
        )}
        {status === 'error' && (
          <div className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">!</div>
            <h1 className="text-lg font-bold text-gray-900">인증 실패</h1>
            <p className="text-sm text-gray-600">{message}</p>
            <button
              onClick={() => {
                const w = (typeof window !== 'undefined' ? window : {}) as Win;
                w.unolive?.device?.cancelled?.();
              }}
              className="mt-4 rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
            >
              창 닫기
            </button>
          </div>
        )}
        {status === 'not_electron' && (
          <div className="space-y-3">
            <h1 className="text-lg font-bold text-gray-900">UnoLive 앱에서 접근 필요</h1>
            <p className="text-sm text-gray-600">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DeviceBridgePage() {
  return (
    <Suspense fallback={null}>
      <DeviceBridgePageInner />
    </Suspense>
  );
}
