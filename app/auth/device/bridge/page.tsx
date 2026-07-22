'use client';

/**
 * /auth/device/bridge
 *
 * Electron 로그인 창 전용 브릿지 페이지 (apps/atem-field 에서 클라우드로 이식).
 * 로그인이 완료된 상태에서 이 페이지가 뜨면:
 *   1. /api/auth/device/issue 호출 → 토큰 발급
 *   2. window.unolive.device.issued(...) 로 Electron main 에 전달
 *   3. main 이 창을 닫음
 *
 * 브라우저(비-Electron)에서 접근하면 안내 메시지만 표시.
 * 로그인 세션이 없어 401 이면 /login 으로 보낸다.
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

const card: React.CSSProperties = {
  width: '100%',
  maxWidth: '420px',
  background: '#ffffff',
  borderRadius: '16px',
  padding: '32px',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
  textAlign: 'center',
  fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
};

function DeviceBridgeInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'not_electron'>('loading');
  const [message, setMessage] = useState('기기를 인증하는 중...');

  useEffect(() => {
    const w = (typeof window !== 'undefined' ? window : {}) as Win;
    const device = w.unolive?.device;

    if (!device?.issued) {
      queueMicrotask(() => {
        setStatus('not_electron');
        setMessage('이 페이지는 UnoWorship Pro 앱에서만 열 수 있습니다.');
      });
      return;
    }

    const deviceType = device.type ?? params.get('device_type') ?? 'server';
    const deviceName = device.name ?? params.get('device_name') ?? 'Unknown Device';
    const osPlatform = device.osPlatform ?? params.get('os_platform') ?? undefined;

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

        if (res.status === 401) {
          // 세션 없음 — 로그인으로
          const bridge = window.location.pathname + window.location.search;
          window.location.href = `/login?redirectTo=${encodeURIComponent(bridge)}`;
          return;
        }

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
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: '#f8fafc',
        colorScheme: 'light',
      }}
    >
      <div style={card}>
        {status === 'loading' && <p style={{ color: '#475569', fontSize: '14px' }}>{message}</p>}
        {status === 'success' && (
          <>
            <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>인증 완료</h1>
            <p style={{ color: '#475569', fontSize: '14px' }}>{message}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#b91c1c' }}>인증 실패</h1>
            <p style={{ color: '#475569', fontSize: '14px' }}>{message}</p>
            <button
              onClick={() => {
                const w = (typeof window !== 'undefined' ? window : {}) as Win;
                w.unolive?.device?.cancelled?.();
              }}
              style={{
                marginTop: '16px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                background: '#f1f5f9',
                color: '#334155',
                fontSize: '13px',
                padding: '8px 16px',
                cursor: 'pointer',
              }}
            >
              창 닫기
            </button>
          </>
        )}
        {status === 'not_electron' && (
          <>
            <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>앱에서 접근 필요</h1>
            <p style={{ color: '#475569', fontSize: '14px' }}>{message}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function DeviceBridgePage() {
  return (
    <Suspense fallback={null}>
      <DeviceBridgeInner />
    </Suspense>
  );
}
