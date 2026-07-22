'use client';

// ATEM/외부 모니터 없이 듀얼아웃 출력을 제어용 모니터 한 화면에서 확인하는 개발용 멀티뷰
// 레이아웃: 상단 = SUB(좌)·PGM(우), 하단 = FILL(좌)·KEY(우) — 뷰포트(32인치 기준)에 스크롤 없이 꽉 참

import { useEffect, useRef, useState } from 'react';
import ProgramMirror from '@/components/composer/operator/ProgramMirror';

// 각 출력을 실해상도(1920x1080)로 렌더한 뒤 셀 크기에 맞춰 CSS scale로 축소 표시.
// iframe마다 소켓이 독립 연결되므로 실제 출력창을 띄운 것과 동일하게 동작한다.
function OutputPane({ path, label }: { path: string; label: string }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      // 너비·높이 중 더 빡빡한 쪽 기준으로 16:9 박스를 셀 안에 맞춘다
      setScale(Math.min(el.clientWidth / 1920, el.clientHeight / 1080));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1">
      <div className="flex shrink-0 items-baseline gap-2">
        <span className="text-sm font-semibold text-neutral-200">{label}</span>
        <span className="text-xs text-neutral-500">{path}</span>
      </div>
      <div ref={areaRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
        {scale > 0 && (
          <div
            className="relative overflow-hidden rounded-md border border-neutral-700 bg-black"
            style={{ width: 1920 * scale, height: 1080 * scale }}
          >
            <iframe
              src={path}
              title={label}
              width={1920}
              height={1080}
              className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
              style={{ transform: `scale(${scale})` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// 컴포즈 우측 패널 상단과 동일한 PGM 미러(WebRTC 내부 합성 / ATEM USB 캡처)를 그대로 임베드.
// ProgramMirror는 자체 헤더(소스 선택기)를 포함하므로 셀 높이에 맞춰 너비만 제한한다.
function PgmMirrorPane() {
  const areaRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fillFrameRef = useRef<HTMLIFrameElement>(null);
  const keyFrameRef = useRef<HTMLIFrameElement>(null);
  const compRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  // 자막 키 합성 — ATEM 클린 영상(자막 없는 카메라) 수신 시 켜면 FILL·KEY로 리니어 키를
  // 로컬 시뮬레이션: 결과 = 카메라x(1-키) + 필x키. 검정 자막·불투명 박스도 실제 키와 동일하게 표현.
  // PGM에 자막이 이미 구워져 있으면 꺼 둘 것(이중 자막).
  const [overlayOn, setOverlayOn] = useState(false);
  const [videoRect, setVideoRect] = useState<{ left: number; top: number; width: number } | null>(null);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      // 56px ≈ ProgramMirror 헤더 + 패딩 — 비디오(16:9)가 셀 높이를 넘지 않게 너비 역산
      setWidth(Math.min(el.clientWidth, ((el.clientHeight - 56) * 16) / 9));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ProgramMirror 내부 비디오 영역 위치를 읽어 합성 캔버스를 정확히 겹친다
  useEffect(() => {
    if (!overlayOn) {
      setVideoRect(null);
      return;
    }
    const box = boxRef.current;
    if (!box) return;
    const update = () => {
      // video는 ProgramMirror 마운트 후에 생기므로 매번 조회 (토글 시점 race 방지)
      const video = box.querySelector('video');
      if (!video) return;
      const b = box.getBoundingClientRect();
      const v = video.getBoundingClientRect();
      setVideoRect({ left: v.left - b.left, top: v.top - b.top, width: v.width });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [overlayOn, width]);

  // 리니어 키 합성 루프 — 숨김 iframe(/atem-fill, /atem-key)의 캔버스와 PGM 비디오를 매 프레임 합성
  useEffect(() => {
    if (!overlayOn) return;
    const comp = compRef.current;
    const box = boxRef.current;
    if (!comp || !box) return;
    const ctx = comp.getContext('2d');
    if (!ctx) return;
    const video = box.querySelector('video');
    const W = 1920;
    const H = 1080;
    const keyInv = document.createElement('canvas'); // 키 반전 (1-키)
    keyInv.width = W;
    keyInv.height = H;
    const fillKeyed = document.createElement('canvas'); // 필x키
    fillKeyed.width = W;
    fillKeyed.height = H;
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      // 배경 = 카메라 (스트림 없으면 검정)
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);
      if (video && video.readyState >= 2) ctx.drawImage(video, 0, 0, W, H);

      const fillCanvas = fillFrameRef.current?.contentDocument?.querySelector('canvas');
      const keyCanvas = keyFrameRef.current?.contentDocument?.querySelector('canvas');
      if (!fillCanvas || !keyCanvas) return;

      const ki = keyInv.getContext('2d');
      const fk = fillKeyed.getContext('2d');
      if (!ki || !fk) return;

      ki.filter = 'invert(1)';
      ki.drawImage(keyCanvas, 0, 0, W, H);

      fk.globalCompositeOperation = 'source-over';
      fk.fillStyle = '#000000';
      fk.fillRect(0, 0, W, H);
      // fill 창의 영상 DOM 오버레이 먼저, 그 위에 캔버스(자막) — 실제 창의 레이어 순서와 동일
      const fillDoc = fillFrameRef.current?.contentDocument;
      if (fillDoc) {
        for (const vid of Array.from(fillDoc.querySelectorAll('video'))) {
          if (vid.readyState < 2) continue;
          const r = vid.getBoundingClientRect(); // iframe 내부 좌표 = 1920x1080 실해상도
          try {
            fk.drawImage(vid, r.left, r.top, r.width, r.height);
          } catch { /* 프레임 미준비 등은 스킵 */ }
        }
      }
      fk.drawImage(fillCanvas, 0, 0, W, H); // 영상 재생 중엔 투명 배경 + 자막
      fk.globalCompositeOperation = 'multiply';
      fk.drawImage(keyCanvas, 0, 0, W, H);

      ctx.globalCompositeOperation = 'multiply'; // 카메라 x (1-키)
      ctx.drawImage(keyInv, 0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter'; // + 필 x 키
      ctx.drawImage(fillKeyed, 0, 0, W, H);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [overlayOn, videoRect]);

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1">
      <div className="flex shrink-0 items-baseline gap-3">
        <span className="text-sm font-semibold text-neutral-200">PGM (컴포즈 미러와 동일 소스)</span>
        <label className="flex cursor-pointer items-center gap-1 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={overlayOn}
            onChange={(e) => setOverlayOn(e.target.checked)}
          />
          자막 키 합성 (클린 영상용)
        </label>
      </div>
      <div ref={areaRef} className="flex min-h-0 min-w-0 flex-1 items-start justify-center">
        {width > 0 && (
          <div
            ref={boxRef}
            style={{ width }}
            className="relative overflow-hidden rounded-md border border-neutral-700 bg-neutral-900"
          >
            <ProgramMirror />
            {overlayOn && (
              <>
                {/* 합성 소스 수신용 숨김 iframe — 화면 밖에 두되 렌더는 유지 */}
                <iframe
                  ref={fillFrameRef}
                  src="/atem-fill"
                  title="키 합성 소스 (FILL)"
                  width={1920}
                  height={1080}
                  aria-hidden
                  className="pointer-events-none absolute border-0"
                  style={{ left: -99999, top: 0 }}
                />
                <iframe
                  ref={keyFrameRef}
                  src="/atem-key"
                  title="키 합성 소스 (KEY)"
                  width={1920}
                  height={1080}
                  aria-hidden
                  className="pointer-events-none absolute border-0"
                  style={{ left: -99999, top: 0 }}
                />
                {videoRect && (
                  <canvas
                    ref={compRef}
                    width={1920}
                    height={1080}
                    className="pointer-events-none absolute"
                    style={{
                      left: videoRect.left,
                      top: videoRect.top,
                      width: videoRect.width,
                      zIndex: 30, // ProgramMirror 대기 UI(z-20)보다 위
                    }}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AtemDevPage() {
  // ?debug=1 → 각 출력창의 진단 오버레이(socket/room/mode) 함께 표시
  const [debugSuffix, setDebugSuffix] = useState('');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('debug') === '1') {
      setDebugSuffix('?debug=1');
    }
  }, []);

  return (
    <main className="flex h-dvh w-screen flex-col overflow-hidden bg-neutral-950 p-3">
      <div className="mb-2 flex shrink-0 items-baseline gap-3">
        <h1 className="text-base font-bold text-neutral-100">듀얼아웃 개발 멀티뷰</h1>
        <p className="text-xs text-neutral-500">
          ATEM 미연결 개발용 — 실제 송출 창과 동일한 소켓 수신. 컴포즈에서 송출하면 여기에 그대로 뜬다.
        </p>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3">
        <OutputPane path={`/atem-sub${debugSuffix}`} label="SUB (무대 · ATEM 입력6)" />
        <PgmMirrorPane />
        <OutputPane path={`/atem-fill${debugSuffix}`} label="FILL (메인 · ATEM 입력4)" />
        <OutputPane path={`/atem-key${debugSuffix}`} label="KEY (메인 · ATEM 입력5)" />
      </div>
    </main>
  );
}
