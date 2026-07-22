'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, Eye, EyeOff, RefreshCw, Usb, Video } from 'lucide-react';
import { useAtemUsbCapture } from './useAtemUsbCapture';
import { useDirectCamerasPublisher } from './useDirectCamerasPublisher';

function formatAge(timestamp: number | null, now: number): string {
  if (!timestamp) return '-';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  return seconds < 60 ? `${seconds}초 전` : `${Math.floor(seconds / 60)}분 전`;
}

function statusLabel(status: ReturnType<typeof useAtemUsbCapture>['diagnostics']['status']) {
  switch (status) {
    case 'checking-permission':
      return '장치 확인';
    case 'waiting-device':
      return 'ATEM 대기';
    case 'connecting':
      return '연결 중';
    case 'live':
      return '정상 송출';
    case 'recovering':
      return '자동 복구';
    case 'permission-blocked':
      return '권한 필요';
    case 'unsupported':
      return '미지원';
    default:
      return '오류';
  }
}

export default function AtemUsbRelayV2Page() {
  const capture = useAtemUsbCapture();
  const publisher = useDirectCamerasPublisher(capture.stream, capture.restart);
  const [showPreview, setShowPreview] = useState(false);
  const [now, setNow] = useState(0);
  const previewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    if (showPreview && capture.stream) {
      preview.srcObject = capture.stream;
      void preview.play().catch(() => {});
    } else {
      preview.pause();
      preview.srcObject = null;
    }
  }, [capture.stream, showPreview]);

  const isLive = capture.diagnostics.status === 'live';

  return (
    <main className="min-h-screen bg-[#090a0c] p-5 text-gray-100">
      <header className="mb-4 flex items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-400">
            ATEM USB Relay v2
          </p>
          <h1 className="mt-1 truncate text-lg font-semibold">저부하 Clean Feed 릴레이</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isLive ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          <span className="text-xs font-semibold">
            {statusLabel(capture.diagnostics.status)}
          </span>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-md border border-white/10 bg-[#111318] p-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Usb className="h-4 w-4" /> 입력 장치
          </div>
          <p className="mt-2 truncate text-sm font-semibold">
            {capture.diagnostics.selectedDeviceLabel ?? 'Blackmagic/ATEM 검색 중'}
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            deviceId 변경 시 이름으로 자동 복구
          </p>
        </article>

        <article className="rounded-md border border-white/10 bg-[#111318] p-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Video className="h-4 w-4" /> 캡처 형식
          </div>
          <p className="mt-2 text-sm font-semibold">
            {capture.diagnostics.width && capture.diagnostics.height
              ? `${capture.diagnostics.width}x${capture.diagnostics.height}`
              : '-'}
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            {capture.diagnostics.frameRate
              ? `${Math.round(capture.diagnostics.frameRate)} fps · 원본 트랙 직접 전달`
              : '30 fps 저부하 설정'}
          </p>
        </article>

        <article className="rounded-md border border-white/10 bg-[#111318] p-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Activity className="h-4 w-4" /> WebRTC 송출
          </div>
          <p className="mt-2 text-sm font-semibold">
            시청자 {publisher.connectedViewerCount}/{publisher.viewerCount}
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            마지막 프레임 {formatAge(publisher.lastFrameProgressAt, now)}
          </p>
        </article>

        <article className="rounded-md border border-white/10 bg-[#111318] p-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <RefreshCw className="h-4 w-4" /> 자동 복구
          </div>
          <p className="mt-2 text-sm font-semibold">
            {capture.diagnostics.recoveries}회
          </p>
          <p className="mt-1 truncate text-[11px] text-gray-500">
            {capture.diagnostics.lastRecoveryReason ?? '정지 감지 12초 후 재획득'}
          </p>
        </article>
      </section>

      <section className="mt-3 rounded-md border border-white/10 bg-[#111318] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-400" htmlFor="atem-device-select">
            고정 장치
          </label>
          <select
            id="atem-device-select"
            value={capture.preferredLabel ?? capture.diagnostics.selectedDeviceLabel ?? ''}
            onChange={(event) => capture.setPreferredLabel(event.target.value || null)}
            className="h-8 min-w-64 rounded border border-white/15 bg-[#090a0c] px-2 text-xs outline-none focus:border-cyan-500"
          >
            <option value="">Blackmagic/ATEM 자동 선택</option>
            {capture.devices.map((device) => (
              <option key={device.deviceId} value={device.label}>
                {device.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            title="ATEM USB 장치를 다시 찾습니다"
            onClick={() => capture.restart('manual-reconnect')}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-white/15 bg-white/5 px-2.5 text-xs hover:bg-white/10"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 재연결
          </button>
          <button
            type="button"
            title={showPreview ? '영상 미리보기를 끕니다' : '진단용 영상 미리보기를 켭니다'}
            onClick={() => setShowPreview((current) => !current)}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-white/15 bg-white/5 px-2.5 text-xs hover:bg-white/10"
          >
            {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            미리보기
          </button>
        </div>

        {capture.error && (
          <p className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {capture.error}
          </p>
        )}

        {showPreview && (
          <div className="mt-3 aspect-video max-w-2xl overflow-hidden rounded border border-white/10 bg-black">
            <video
              ref={previewRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-contain"
            />
          </div>
        )}
      </section>

      <footer className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-gray-600">
        <span>Canvas 복사 0회</span>
        <span>획득 시도 {capture.diagnostics.acquireAttempts}회</span>
        <span>Track {capture.diagnostics.trackState}</span>
        <span>Muted {capture.diagnostics.muted ? 'yes' : 'no'}</span>
        <span>Encoded {publisher.framesEncoded.toLocaleString()} frames</span>
        <span>Sent {(publisher.bytesSent / 1024 / 1024).toFixed(1)} MB</span>
      </footer>
    </main>
  );
}
