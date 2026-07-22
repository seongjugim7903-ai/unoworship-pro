'use client';

/**
 * CamerasSourcePage — 서버 측 MultiView 캡처 퍼블리셔
 *
 * 동작:
 *   1. 비디오 장치 목록 조회 (enumerateDevices)
 *   2. 사용자가 "ATEM MultiView 캡처 디바이스" 선택 → localStorage 저장
 *   3. 해당 장치로 getUserMedia → <video> 에 바인딩
 *   4. 동시에 1920×1080 캔버스에 rAF 루프로 draw
 *   5. canvas.captureStream() → useCamerasPublisher 로 WebRTC 송출
 *
 * 화면 UI 는 진단/모니터링용 (장치 선택, 연결 상태, 현재 캡처 프리뷰).
 * 실제 서비스 시점에는 Mac mini 백그라운드 탭으로 두면 됨.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamerasPublisher } from '@/hooks/useCamerasPublisher';

const STORAGE_KEY = 'unoLive-cameras-source-device';
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const CAMERA_FRAME_RATE = 60;

// 카메라 릴레이 우선 장치 — FEELWORLD(멀티뷰/카메라 캡처 브릿지)를 최우선으로.
// Blackmagic(ATEM USB)은 컴포즈 PGM 미러가 쓰므로 이 페이지에선 후순위.
const PREFERRED_KEYWORDS = ['feelworld', 'livepro'];

// ATEM/Blackmagic 장치 자동 감지 키워드
const ATEM_KEYWORDS = [
  ...PREFERRED_KEYWORDS,
  'atem', 'blackmagic', 'decklink', 'intensity', 'ultrastudio',
  // 일반 캡처 디바이스 식별 키워드 추가
  'capture', 'hdmi', 'video capture', 'usb video', 'avermedia', 'elgato',
];

function isLikelyCaptureDevice(label: string): boolean {
  const lower = label.toLowerCase();
  return ATEM_KEYWORDS.some((kw) => lower.includes(kw));
}

function isPreferredCaptureDevice(label: string): boolean {
  const lower = label.toLowerCase();
  return PREFERRED_KEYWORDS.some((kw) => lower.includes(kw));
}

function LegacyCamerasSourcePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 캡처 스트림 → 캔버스 publish
  useCamerasPublisher(canvasRef, { enabled: status === 'live' });

  // 장치 목록 로드 + 자동 선택
  const loadDevices = useCallback(async () => {
    try {
      // 권한 얻기
      const temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      temp.getTracks().forEach((t) => t.stop());

      const all = await navigator.mediaDevices.enumerateDevices();
      const vids = all.filter((d) => d.kind === 'videoinput');
      setDevices(vids);

      // 우선 장치(FEELWORLD) 탐색 — 새로 연결되면 저장된 일반 장치보다 우선한다.
      // (케이블 연결 전 Blackmagic이 저장돼 있어도, 필월드를 꽂으면 자동 전환)
      const preferred = vids.find((d) => isPreferredCaptureDevice(d.label));

      // localStorage 저장된 ID 우선 — 단, 저장 장치가 일반 장치인데 우선 장치가 있으면 양보
      const saved = localStorage.getItem(STORAGE_KEY);
      const savedDevice = saved ? vids.find((d) => d.deviceId === saved) : undefined;
      if (savedDevice && (!preferred || isPreferredCaptureDevice(savedDevice.label))) {
        setSelectedId(savedDevice.deviceId);
        return;
      }

      // 자동 감지 — FEELWORLD(카메라 브릿지) 최우선, 다음 Blackmagic/Elgato/UVC 캡처
      const auto = preferred ?? vids.find((d) => isLikelyCaptureDevice(d.label));
      if (auto) {
        setSelectedId(auto.deviceId);
        localStorage.setItem(STORAGE_KEY, auto.deviceId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    const handler = () => loadDevices();
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', handler);
      return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
    }
  }, [loadDevices]);

  // 선택된 장치로 스트림 시작
  useEffect(() => {
    if (!selectedId) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('connecting');
    setErrorMsg(null);

    const cleanup = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: selectedId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: CAMERA_FRAME_RATE },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus('live');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(msg);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [selectedId]);

  // Video → Canvas rAF 복사 루프
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    let raf = 0;
    const draw = () => {
      if (video.readyState >= 2 && status === 'live') {
        ctx.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#444';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          status === 'connecting' ? '연결 중...' :
          status === 'error' ? '장치 오류' : '장치 미선택',
          CANVAS_WIDTH / 2,
          CANVAS_HEIGHT / 2,
        );
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [status]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">ATEM 카메라 릴레이 (소스)</h1>
          <p className="text-xs text-gray-400 mt-1">
            이 페이지는 서버 Mac mini 에서 열어두세요. 원격 composer 가 이 스트림을 받습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${
            status === 'live' ? 'bg-green-500 animate-pulse' :
            status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            status === 'error' ? 'bg-red-500' : 'bg-gray-500'
          }`} />
          <span className="text-xs font-bold tracking-wider uppercase">
            {status === 'live' ? 'LIVE' :
             status === 'connecting' ? 'CONNECTING' :
             status === 'error' ? 'ERROR' : 'IDLE'}
          </span>
        </div>
      </header>

      {/* 장치 선택 */}
      <div className="mb-4 bg-[#141414] rounded-lg p-4 border border-[#222]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">캡처 장치 선택</h2>
          <button
            onClick={loadDevices}
            className="px-2 py-1 rounded bg-[#222] hover:bg-[#2a2a2a] text-xs"
          >
            ↻ 새로고침
          </button>
        </div>
        <div className="grid gap-2">
          {devices.length === 0 && (
            <p className="text-xs text-gray-500">비디오 장치 없음</p>
          )}
          {devices.map((d) => (
            <button
              key={d.deviceId}
              onClick={() => handleSelect(d.deviceId)}
              className={`text-left px-3 py-2 rounded border transition-colors ${
                d.deviceId === selectedId
                  ? 'bg-violet-600/20 border-violet-500 text-violet-200'
                  : 'bg-[#1a1a1a] border-[#333] hover:border-[#555]'
              }`}
            >
              <div className="text-sm font-medium">
                {d.label || '(라벨 없음 — 권한 필요)'}
              </div>
              <div className="text-[10px] text-gray-500 font-mono mt-0.5 truncate">
                {d.deviceId.slice(0, 32)}...
              </div>
              {isLikelyCaptureDevice(d.label) && (
                <div className="text-[10px] text-emerald-400 mt-0.5">
                  캡처 장치로 감지됨
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 에러 */}
      {errorMsg && (
        <div className="mb-4 bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-200">
          {errorMsg}
        </div>
      )}

      {/* 프리뷰 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-semibold text-gray-400 mb-1.5">
            원본 비디오 (getUserMedia)
          </h3>
          <div className="bg-black rounded-lg overflow-hidden aspect-video border border-[#222]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
          </div>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-gray-400 mb-1.5">
            송출 캔버스 (WebRTC publish)
          </h3>
          <div className="bg-black rounded-lg overflow-hidden aspect-video border border-[#222]">
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              style={{ objectFit: 'contain' }}
            />
          </div>
        </div>
      </div>

      <footer className="mt-6 text-[11px] text-gray-500">
        원격 composer(CameraGrid) → <code className="font-mono">CAMERAS_VIEWER_JOIN</code> → 이 페이지가 <code className="font-mono">CAMERAS_READY</code> 발송 → WebRTC 연결
      </footer>
    </main>
  );
}

const MULTI_STORAGE_KEY = 'unoLive-cameras-source-devices-v2';
const MULTI_LEGACY_STORAGE_KEY = 'unoLive-cameras-source-device';
const SOURCE_MODE_STORAGE_KEY = 'unoLive-cameras-source-mode';
const MULTI_CAMERA_COUNT = 4;

type MultiSlotStatus = 'idle' | 'connecting' | 'live' | 'error';
type SourceMode = 'single-multiview' | 'multi-device';

function makeEmptySelections(): Array<string | null> {
  return Array.from({ length: MULTI_CAMERA_COUNT }, () => null);
}

function makeEmptyStatuses(): MultiSlotStatus[] {
  return Array.from({ length: MULTI_CAMERA_COUNT }, () => 'idle');
}

function makeEmptyErrors(): Array<string | null> {
  return Array.from({ length: MULTI_CAMERA_COUNT }, () => null);
}

function MultiCameraSourcePage() {
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRefs = useRef<Array<MediaStream | null>>(
    Array.from({ length: MULTI_CAMERA_COUNT }, () => null)
  );

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Array<string | null>>(makeEmptySelections);
  const [slotStatuses, setSlotStatuses] = useState<MultiSlotStatus[]>(makeEmptyStatuses);
  const [slotErrors, setSlotErrors] = useState<Array<string | null>>(makeEmptyErrors);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>(() => {
    if (typeof window === 'undefined') return 'single-multiview';
    const saved = window.localStorage.getItem(SOURCE_MODE_STORAGE_KEY);
    return saved === 'multi-device' || saved === 'single-multiview'
      ? saved
      : 'single-multiview';
  });

  const liveCount = slotStatuses.filter((status) => status === 'live').length;
  const connectingCount = slotStatuses.filter((status) => status === 'connecting').length;
  const errorCount = slotStatuses.filter((status) => status === 'error').length;
  const overallStatus: MultiSlotStatus =
    liveCount > 0 ? 'live' :
    connectingCount > 0 ? 'connecting' :
    errorCount > 0 ? 'error' :
    'idle';

  // 페이지가 열려 있으면 항상 cameras-source 룸에 붙고 캔버스를 publish 한다.
  // 장치 선택이 비어 있어도 원격 Composer/Broadcast 쪽이 무한 로딩 대신
  // "장치 미선택/대기" 상태를 영상으로 받을 수 있어 현장 진단이 쉬워진다.
  useCamerasPublisher(canvasRef, { enabled: true });

  const saveSelections = useCallback((next: Array<string | null>) => {
    localStorage.setItem(MULTI_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const saveSourceMode = useCallback((next: SourceMode) => {
    setSourceMode(next);
    localStorage.setItem(SOURCE_MODE_STORAGE_KEY, next);
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      temp.getTracks().forEach((track) => track.stop());

      const all = await navigator.mediaDevices.enumerateDevices();
      const vids = all.filter((device) => device.kind === 'videoinput');
      setDevices(vids);

      const savedMode = localStorage.getItem(SOURCE_MODE_STORAGE_KEY);
      if (savedMode === 'single-multiview' || savedMode === 'multi-device') {
        setSourceMode(savedMode);
      }
      const hasSavedMode = savedMode === 'single-multiview' || savedMode === 'multi-device';

      const saved = localStorage.getItem(MULTI_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as unknown;
          if (Array.isArray(parsed)) {
            let next = makeEmptySelections().map((_, index) => {
              const id = typeof parsed[index] === 'string' ? parsed[index] : null;
              return id && vids.some((device) => device.deviceId === id) ? id : null;
            });
            const modeForSaved = hasSavedMode ? savedMode : 'single-multiview';
            if (modeForSaved === 'single-multiview' && !next[0]) {
              const firstValid = next.find(Boolean) ?? null;
              next = [firstValid, null, null, null];
            }
            if (next.some(Boolean)) {
              setSelectedIds(next);
              saveSelections(next);
              return;
            }
          }
        } catch {
          /* ignore invalid storage */
        }
      }

      const legacy = localStorage.getItem(MULTI_LEGACY_STORAGE_KEY);
      if (legacy && vids.some((device) => device.deviceId === legacy)) {
        const next = [legacy, null, null, null];
        if (!hasSavedMode) {
          setSourceMode('single-multiview');
          localStorage.setItem(SOURCE_MODE_STORAGE_KEY, 'single-multiview');
        }
        setSelectedIds(next);
        saveSelections(next);
        return;
      }

      const auto = vids.filter((device) => isLikelyCaptureDevice(device.label)).slice(0, MULTI_CAMERA_COUNT);
      if (auto.length > 0) {
        const modeForAuto = hasSavedMode ? savedMode : 'single-multiview';
        const next = modeForAuto === 'multi-device'
          ? makeEmptySelections().map((_, index) => auto[index]?.deviceId ?? null)
          : [auto[0]?.deviceId ?? null, null, null, null];
        if (!hasSavedMode) {
          setSourceMode('single-multiview');
          localStorage.setItem(SOURCE_MODE_STORAGE_KEY, 'single-multiview');
        }
        setSelectedIds(next);
        saveSelections(next);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [saveSelections]);

  useEffect(() => {
    loadDevices();
    const handler = () => loadDevices();
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', handler);
      return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
    }
  }, [loadDevices]);

  // [FIX: RELAY_WATCHDOG] 프레임 정지/행 걸림 시 재획득 트리거 — 값이 바뀌면 아래 획득 effect 재실행
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const setSlotStatus = (slot: number, status: MultiSlotStatus) => {
      setSlotStatuses((current) => current.map((value, index) => index === slot ? status : value));
    };

    const setSlotError = (slot: number, message: string | null) => {
      setSlotErrors((current) => current.map((value, index) => index === slot ? message : value));
    };

    const cleanupSlot = (slot: number) => {
      streamRefs.current[slot]?.getTracks().forEach((track) => track.stop());
      streamRefs.current[slot] = null;
      const video = videoRefs.current[slot];
      if (video) video.srcObject = null;
    };

    streamRefs.current.forEach((_stream, slot) => cleanupSlot(slot));
    setSlotStatuses(makeEmptyStatuses());
    setSlotErrors(makeEmptyErrors());
    setErrorMsg(null);

    selectedIds.forEach((selectedId, slot) => {
      if (sourceMode === 'single-multiview' && slot > 0) return;
      if (!selectedId) return;
      setSlotStatus(slot, 'connecting');
      setSlotError(slot, null);

      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: selectedId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: CAMERA_FRAME_RATE },
            },
            audio: false,
          });
          if (cancelled) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          streamRefs.current[slot] = stream;
          const video = videoRefs.current[slot];
          if (video) {
            video.srcObject = stream;
            await video.play().catch(() => {});
          }
          setSlotStatus(slot, 'live');
        } catch (err) {
          setSlotError(slot, err instanceof Error ? err.message : String(err));
          setSlotStatus(slot, 'error');
        }
      })();
    });

    return () => {
      cancelled = true;
      streamRefs.current.forEach((_stream, slot) => cleanupSlot(slot));
    };
  }, [selectedIds, sourceMode, retryNonce]);

  // [FIX: RELAY_WATCHDOG] 부팅 직후 ATEM USB가 늦게 준비되거나 트랙이 프레임을 안 주는 상태로
  //   고착되면(재부팅 사고 2026-07-10), 4초 간격으로 진행을 점검해 3회 연속 정지 시 전체 재획득.
  //   video.currentTime 이 전진하면 정상 — 스트라이크 리셋.
  useEffect(() => {
    const lastTimes: number[] = new Array(MULTI_CAMERA_COUNT).fill(-1);
    let strikes = 0;
    const timer = setInterval(() => {
      const active = selectedIds
        .map((id, slot) => ({ id, slot }))
        .filter(({ id, slot }) => id && !(sourceMode === 'single-multiview' && slot > 0));
      if (active.length === 0) return;
      let anyProgress = false;
      for (const { slot } of active) {
        const video = videoRefs.current[slot];
        const t = video?.currentTime ?? 0;
        if (video && video.readyState >= 2 && t > lastTimes[slot]) anyProgress = true;
        lastTimes[slot] = t;
      }
      if (anyProgress) { strikes = 0; return; }
      strikes += 1;
      if (strikes >= 3) {
        strikes = 0;
        console.warn('[camerasRelay] 프레임 정지 감지 — 캡처 재획득');
        setRetryNonce((n) => n + 1);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [selectedIds, sourceMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // [FIX: RELAY_OCCLUDED] rAF → setInterval. 이 창은 SUB 키오스크 뒤에 숨겨 실행되는데,
    //   완전히 가려지면 rAF가 멈춰 captureStream 프레임이 0이 됨(재부팅 사고 2026-07-10 원인).
    //   실행 플래그(--disable-background-timer-throttling)로 타이머는 가려져도 그대로 돈다.
    const draw = () => {
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const cellW = CANVAS_WIDTH / 2;
      const cellH = CANVAS_HEIGHT / 2;
      if (sourceMode === 'single-multiview') {
        const video = videoRefs.current[0];
        const status = slotStatuses[0];
        if (video && video.readyState >= 2 && status === 'live') {
          ctx.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        } else {
          ctx.fillStyle = '#0f0f0f';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.fillStyle = status === 'error' ? '#f87171' : '#555';
          ctx.font = 'bold 44px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            status === 'connecting' ? 'MultiView 연결 중...' :
            status === 'error' ? 'MultiView 장치 오류' :
            selectedIds[0] ? 'MultiView 대기 중' : 'MultiView 장치 미선택',
            CANVAS_WIDTH / 2,
            CANVAS_HEIGHT / 2
          );
        }
        return;
      }

      for (let slot = 0; slot < MULTI_CAMERA_COUNT; slot++) {
        const col = slot % 2;
        const row = Math.floor(slot / 2);
        const x = col * cellW;
        const y = row * cellH;
        const video = videoRefs.current[slot];
        const status = slotStatuses[slot];

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cellW, cellH);
        ctx.clip();

        if (video && video.readyState >= 2 && status === 'live') {
          ctx.drawImage(video, x, y, cellW, cellH);
        } else {
          ctx.fillStyle = '#0f0f0f';
          ctx.fillRect(x, y, cellW, cellH);
          ctx.fillStyle = status === 'error' ? '#f87171' : '#555';
          ctx.font = 'bold 34px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            status === 'connecting' ? '연결 중...' :
            status === 'error' ? '장치 오류' :
            selectedIds[slot] ? '대기 중' : '장치 미선택',
            x + cellW / 2,
            y + cellH / 2
          );
        }

        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(x + 18, y + 18, 92, 52);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(slot + 1), x + 64, y + 44);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
        ctx.restore();
      }
    };
    draw();
    const timer = setInterval(draw, 1000 / 30);
    return () => clearInterval(timer);
  }, [selectedIds, slotStatuses, sourceMode]);

  const handleSelect = (slot: number, id: string) => {
    const next = selectedIds.map((value, index) => index === slot ? (id || null) : value);
    setSelectedIds(next);
    saveSelections(next);
  };

  const handleSourceModeChange = (nextMode: SourceMode) => {
    saveSourceMode(nextMode);
    if (nextMode !== 'single-multiview') return;

    const firstSelected = selectedIds[0]
      ?? selectedIds.find(Boolean)
      ?? devices.find((device) => isLikelyCaptureDevice(device.label))?.deviceId
      ?? devices[0]?.deviceId
      ?? null;
    const normalized = [firstSelected, null, null, null];
    setSelectedIds(normalized);
    saveSelections(normalized);
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">카메라 1~4 릴레이 (소스)</h1>
          <p className="text-xs text-gray-400 mt-1">
            이 페이지는 서버 Mac mini 에서 열어두세요. ATEM은 보통 입력 1~4가 각각 브라우저 카메라로 뜨지 않으므로, HDMI OUT MultiView 1개를 캡처해 CAM 1~4로 나누는 방식이 기본입니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${
            overallStatus === 'live' ? 'bg-green-500 animate-pulse' :
            overallStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            overallStatus === 'error' ? 'bg-red-500' : 'bg-gray-500'
          }`} />
          <span className="text-xs font-bold tracking-wider uppercase">
            {overallStatus === 'live' ? `LIVE ${liveCount}/${sourceMode === 'single-multiview' ? 1 : 4}` :
             overallStatus === 'connecting' ? 'CONNECTING' :
             overallStatus === 'error' ? 'ERROR' : 'IDLE'}
          </span>
        </div>
      </header>

      <div className="mb-4 bg-[#141414] rounded-lg p-4 border border-[#222]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">카메라 소스 방식</h2>
          <button
            onClick={loadDevices}
            className="px-2 py-1 rounded bg-[#222] hover:bg-[#2a2a2a] text-xs"
          >
            새로고침
          </button>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => handleSourceModeChange('single-multiview')}
            className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
              sourceMode === 'single-multiview'
                ? 'border-violet-500 bg-violet-600/20 text-violet-100'
                : 'border-[#333] bg-[#101010] text-gray-400 hover:border-[#555]'
            }`}
          >
            <span className="block font-bold">ATEM MultiView 1개 입력 (권장)</span>
            <span className="mt-0.5 block text-[10px] opacity-75">ATEM HDMI OUT을 MultiView로 설정하고, 그 캡처 화면을 CAM 1~4로 잘라 표시</span>
          </button>
          <button
            onClick={() => handleSourceModeChange('multi-device')}
            className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
              sourceMode === 'multi-device'
                ? 'border-violet-500 bg-violet-600/20 text-violet-100'
                : 'border-[#333] bg-[#101010] text-gray-400 hover:border-[#555]'
            }`}
          >
            <span className="block font-bold">캡처카드 4개 직접 연결</span>
            <span className="mt-0.5 block text-[10px] opacity-75">ATEM 입력이 아니라, 컴퓨터에 꽂힌 캡처 장치 4개를 직접 합성</span>
          </button>
        </div>
        {sourceMode === 'multi-device' && devices.length < MULTI_CAMERA_COUNT && (
          <div className="mb-3 rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
            현재 브라우저가 인식한 비디오 장치는 {devices.length}개입니다. ATEM 입력 1~4는 보통 여기서 4개 장치로 나오지 않습니다.
            실제 캡처카드 4개를 꽂은 경우가 아니라면 왼쪽의 ATEM MultiView 1개 입력을 사용하세요.
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {Array.from({ length: sourceMode === 'single-multiview' ? 1 : MULTI_CAMERA_COUNT }).map((_, slot) => {
            const selected = selectedIds[slot];
            const status = slotStatuses[slot];
            return (
              <div
                key={slot}
                className={`rounded-lg border p-3 ${
                  status === 'live' ? 'border-emerald-500/50 bg-emerald-500/5' :
                  status === 'error' ? 'border-red-500/50 bg-red-500/5' :
                  'border-[#2a2a2a] bg-[#101010]'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-black text-xs font-black text-white">
                      {slot + 1}
                    </span>
                    <span className="text-sm font-semibold">
                      {sourceMode === 'single-multiview' ? 'MultiView 입력' : `카메라 ${slot + 1}`}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold uppercase ${
                    status === 'live' ? 'text-emerald-400' :
                    status === 'connecting' ? 'text-amber-400' :
                    status === 'error' ? 'text-red-300' :
                    'text-gray-500'
                  }`}>
                    {status}
                  </span>
                </div>
                <select
                  value={selected ?? ''}
                  onChange={(event) => handleSelect(slot, event.target.value)}
                  className="w-full rounded border border-[#333] bg-[#181818] px-2 py-2 text-xs text-gray-100 outline-none focus:border-violet-500"
                >
                  <option value="">장치 선택 안 함</option>
                  {devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || '(라벨 없음 - 권한 필요)'}
                    </option>
                  ))}
                </select>
                {selected && (
                  <div className="mt-1 truncate text-[10px] text-gray-500 font-mono">
                    {selected.slice(0, 40)}...
                  </div>
                )}
                {selected && devices.find((device) => device.deviceId === selected && isLikelyCaptureDevice(device.label)) && (
                  <div className="mt-1 text-[10px] text-emerald-400">
                    캡처 장치로 감지됨
                  </div>
                )}
                {slotErrors[slot] && (
                  <div className="mt-2 rounded bg-red-950/40 px-2 py-1 text-[10px] text-red-200">
                    {slotErrors[slot]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-200">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-semibold text-gray-400 mb-1.5">
            {sourceMode === 'single-multiview' ? '원본 MultiView 입력' : '원본 비디오 1~4 (getUserMedia)'}
          </h3>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#222] bg-black p-2">
            {Array.from({ length: sourceMode === 'single-multiview' ? 1 : MULTI_CAMERA_COUNT }).map((_, slot) => (
              <div key={slot} className="relative aspect-video overflow-hidden rounded bg-[#050505]">
                <video
                  ref={(el) => { videoRefs.current[slot] = el; }}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold">
                  {sourceMode === 'single-multiview' ? 'MV' : slot + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-gray-400 mb-1.5">
            송출 캔버스 (WebRTC publish)
          </h3>
          <div className="bg-black rounded-lg overflow-hidden aspect-video border border-[#222]">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="w-full h-full"
              style={{ objectFit: 'contain' }}
            />
          </div>
        </div>
      </div>

      <footer className="mt-6 text-[11px] text-gray-500">
        원격 Composer(CameraGrid) → <code className="font-mono">CAMERAS_VIEWER_JOIN</code> → 이 페이지가 <code className="font-mono">CAMERAS_READY</code> 발송 → WebRTC 연결
      </footer>
    </main>
  );
}

export default function CamerasSourcePage() {
  return <MultiCameraSourcePage />;
}
