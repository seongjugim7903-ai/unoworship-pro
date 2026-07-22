'use client';

/**
 * CameraGrid — 우측 오퍼레이터 패널의 4분할 카메라 프리뷰
 *
 * [FEATURE: CAMERAS_RELAY]
 *
 * 동작:
 *   - 서버 Mac mini 의 /cameras-source 페이지가 ATEM MultiView 캡처 장치를
 *     WebRTC 로 송출 → 이 컴포넌트가 useCamerasVideoStream 으로 구독 → 단일
 *     <video> 로 표시.
 *   - ATEM MultiView 가 이미 하드웨어에서 2×2 (또는 다중) 화면을 조합해서
 *     출력하므로 화면은 "4분할 영상 1개" 로 보임.
 *
 * 장점:
 *   - 원격 Windows 노트북 등 LAN 내 어느 PC 에서도 동일하게 수신
 *   - 서버 카메라에 직접 getUserMedia 할 필요 없음 (HTTP LAN mediaDevices 제약 우회)
 *   - CPU 부하: 단일 비디오 디코딩만
 */

import { useEffect, useRef } from 'react';
import { useCamerasVideoStream } from '@/hooks/useCamerasVideoStream';
import { useStore } from '@/lib/store';
// [FEATURE: CAMERA_SWITCH] 전환 제어는 별도 모듈 — 안전 게이트 포함 (features/camera-switch)
import { useCameraSwitch } from '@/features/camera-switch/useCameraSwitch';

export default function CameraGrid() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tileCanvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const { stream, connected, connectionState } = useCamerasVideoStream();

  // ── ATEM 카메라 전환 제어 (수동 클릭 + 섹션 송출 연동 자동 전환) ────────────
  const {
    atemStatus,
    atemConnected,
    inputMap,
    programMap,
    assignProgram,
    selectCamera,
    switchingSlot,
  } = useCameraSwitch();

  const setlistItems = useStore(
    (s) => s.setlists.find((l) => l.id === s.currentSetlistId)?.items,
  );

  // MediaStream 바인딩
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    } else if (!stream && video.srcObject) {
      video.srcObject = null;
    }
  }, [stream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let raf = 0;
    const draw = () => {
      const sourceW = video.videoWidth || 1920;
      const sourceH = video.videoHeight || 1080;
      const cellW = sourceW / 2;
      const cellH = sourceH / 2;

      for (let slot = 0; slot < 4; slot++) {
        const canvas = tileCanvasRefs.current[slot];
        if (!canvas) continue;
        if (canvas.width !== 480) canvas.width = 480;
        if (canvas.height !== 270) canvas.height = 270;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        const col = slot % 2;
        const row = Math.floor(slot / 2);
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (connected && video.readyState >= 2) {
          ctx.drawImage(
            video,
            col * cellW,
            row * cellH,
            cellW,
            cellH,
            0,
            0,
            canvas.width,
            canvas.height
          );
        }
      }

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [connected, stream]);

  return (
    <div className="px-4 py-3 border-b border-[#222222]">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500">
          카메라 1~4
        </p>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              connected ? 'bg-green-500' :
              connectionState === 'connecting' ? 'bg-yellow-500 animate-pulse' :
              'bg-gray-600'
            }`}
            title={`WebRTC: ${connectionState}`}
          />
          <span className="px-1.5 py-0.5 rounded bg-black/40 border border-[#222] text-[9px] text-gray-500 font-mono">
            {connected ? 'LIVE' : connectionState.toUpperCase()}
          </span>
        </div>
      </div>

      {/* 4분할 수신 영상 — /cameras-source 의 2x2 릴레이를 슬롯별로 잘라 표시 */}
      <div className="relative w-full bg-black rounded-md overflow-hidden border border-[#222222] p-1.5">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="hidden"
        />

        <div className="grid grid-cols-2 gap-1.5">
          {[1, 2, 3, 4].map((n, index) => {
            const input = inputMap[index];
            const clickable = !!input && atemConnected && switchingSlot === null;
            const isProgram = !!input && atemStatus?.programInput === input;
            return (
              <div key={n} className="flex flex-col gap-0.5">
                <div
                  onClick={() => selectCamera(index)}
                  title={
                    !input ? '미사용 슬롯' :
                    !atemConnected ? 'ATEM 미연결 — 연동 설정에서 연결하세요' :
                    `클릭: ATEM 입력 ${input}번으로 전환`
                  }
                  className={`relative aspect-video overflow-hidden rounded-sm bg-[#050505] border transition-colors ${
                    isProgram ? 'border-red-500 border-2' : 'border-white/10'
                  } ${clickable ? 'cursor-pointer hover:border-white/40' : ''} ${
                    switchingSlot === index ? 'opacity-60' : ''
                  }`}
                >
                  <canvas
                    ref={(el) => { tileCanvasRefs.current[index] = el; }}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-black text-white">
                    {n}
                  </span>
                  {isProgram && (
                    <span className="absolute right-1 top-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                      PGM
                    </span>
                  )}
                  {!input && (
                    <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 py-0.5 text-[8px] text-gray-500">
                      미사용
                    </span>
                  )}
                  {!connected && (
                    <div className="absolute inset-0 flex items-center justify-center text-[9px] text-gray-600 pointer-events-none">
                      대기
                    </div>
                  )}
                </div>
                {/* 카메라별 프로그램 지정 — 지정된 프로그램의 섹션이 송출되면 이 카메라로 자동 전환 */}
                {!!input && (
                  <select
                    value={programMap[index] ?? ''}
                    onChange={(e) => assignProgram(index, e.target.value || null)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    title="이 카메라에 프로그램 지정 — 그 프로그램 섹션 송출 시 자동 전환"
                    className="h-5 w-full rounded border border-[#333] bg-[#0a0a0a] px-1 text-[9px] text-gray-400 outline-none focus:border-blue-500"
                  >
                    <option value="">프로그램 지정 없음</option>
                    {(setlistItems ?? []).map((item) => (
                      <option key={item.id} value={item.id}>{item.title}</option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>

        {connected && (
          <div className="mt-1.5 grid grid-cols-4 gap-1 text-[9px] text-gray-500">
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className="truncate text-center">CAM {n}</span>
            ))}
          </div>
        )}

        {/* 대기 상태 — pointer-events-none 필수: 영상(릴레이)이 없어도 타일 클릭(ATEM 전환)은
            동작해야 한다. 이 오버레이가 클릭을 가로채 "마우스 안 먹힘" 사고가 있었음 (2026-07-08) */}
        {!connected && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-gray-500 text-xs">
            <div className="w-5 h-5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mb-2" />
            <span>
              {connectionState === 'idle' && '영상 대기 (전환 클릭은 가능)'}
              {connectionState === 'connecting' && '연결 중...'}
              {connectionState === 'disconnected' && '릴레이 끊김 (전환 클릭은 가능)'}
              {connectionState === 'failed' && '연결 실패'}
              {connectionState === 'closed' && '닫힘'}
            </span>
            <p className="text-[9px] text-gray-600 mt-2 text-center px-4">
              영상 미리보기: 바탕화면 카메라릴레이 아이콘 실행
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
