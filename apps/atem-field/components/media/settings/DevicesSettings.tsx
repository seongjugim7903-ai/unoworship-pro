'use client';

/**
 * components/media/settings/DevicesSettings.tsx
 * 설정 > 연결된 기기
 *
 * - 내 계정으로 발급된 모든 device_token 목록 표시
 * - 해제 버튼으로 즉시 revoke (soft delete)
 * - 현재 접속 중인 기기에 체크 표시 (window.unolive.device.token 와 매칭)
 */

import { useCallback, useEffect, useState } from 'react';

interface DeviceRow {
  id: string;
  device_name: string;
  device_type: 'server' | 'composer';
  os_platform: string | null;
  app_version: string | null;
  last_verified_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
  subscription_snapshot: {
    plan?: string;
    status?: string;
    expires_at?: string | null;
  } | null;
}

export default function DevicesSettings() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/auth/device');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setDevices(body.devices ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const revoke = async (id: string) => {
    if (!confirm('이 기기의 접근을 해제합니다. 해당 PC 는 다음 실행 시 재로그인이 필요합니다.\n계속하시겠습니까?')) return;
    setRevokingId(id);
    try {
      const res = await fetch(`/api/auth/device/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      alert(`해제 실패: ${(e as Error).message}`);
    } finally {
      setRevokingId(null);
    }
  };

  const active = devices.filter((d) => !d.revoked_at);
  const revoked = devices.filter((d) => d.revoked_at);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">연결된 기기</h2>
        <p className="text-sm text-gray-500 mt-1">
          UnoLive 앱이 설치된 PC 목록입니다. 사용하지 않는 기기는 해제해 주세요.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">불러오는 중...</p>}
      {error && <p className="text-sm text-red-600">오류: {error}</p>}

      {!loading && active.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">아직 연결된 기기가 없습니다.</p>
          <p className="text-xs text-gray-400 mt-1">
            서버 또는 컴포저 PC 에 UnoLive 앱을 설치하면 여기에 표시됩니다.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-2">
          {active.map((d) => (
            <DeviceCard
              key={d.id}
              device={d}
              revoking={revokingId === d.id}
              onRevoke={() => revoke(d.id)}
            />
          ))}
        </div>
      )}

      {revoked.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
            해제된 기기 ({revoked.length})
          </summary>
          <div className="mt-3 space-y-2">
            {revoked.map((d) => (
              <DeviceCard key={d.id} device={d} revoking={false} onRevoke={() => {}} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function DeviceCard({ device, revoking, onRevoke }: {
  device: DeviceRow; revoking: boolean; onRevoke: () => void;
}) {
  const isRevoked = !!device.revoked_at;
  const lastVerified = new Date(device.last_verified_at);
  const daysSince = Math.floor((Date.now() - lastVerified.getTime()) / 86400000);

  return (
    <div className={`rounded-lg border p-4 flex items-start justify-between gap-4 ${
      isRevoked ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200 bg-white'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">{device.device_type === 'server' ? '🖥️' : '💻'}</span>
          <span className="font-semibold text-gray-900 truncate">{device.device_name}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            device.device_type === 'server'
              ? 'bg-indigo-100 text-indigo-700'
              : 'bg-sky-100 text-sky-700'
          }`}>
            {device.device_type === 'server' ? '서버' : '컴포저'}
          </span>
          {isRevoked && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
              해제됨
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>OS: {device.os_platform ?? '–'}</span>
          <span>버전: v{device.app_version ?? '–'}</span>
          <span>
            마지막 확인:{' '}
            {daysSince === 0 ? '오늘' : daysSince === 1 ? '어제' : `${daysSince}일 전`}
          </span>
          <span>등록: {new Date(device.created_at).toLocaleDateString('ko-KR')}</span>
        </div>
      </div>
      {!isRevoked && (
        <button
          onClick={onRevoke}
          disabled={revoking}
          className="flex-shrink-0 px-3 py-1.5 rounded-md border border-red-300 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          {revoking ? '해제 중...' : '해제'}
        </button>
      )}
    </div>
  );
}
