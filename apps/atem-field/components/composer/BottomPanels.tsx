'use client';

/**
 * BottomPanels.tsx
 * 에디터 하단 설정 패널 — 요소 설정 / 텍스트 설정 / 레이어
 *
 * - 넓을 때 : 3열 나란히 (각 1/3 너비)
 * - 좁을 때 : 탭 전환 (ResizeObserver 감지)
 *
 * 탭 전환 임계값: TAB_BREAKPOINT px 미만
 */

import { useState, useRef, useEffect } from 'react';
import ElementPanel from '@/components/panels/ElementPanel';
import TextPanel    from '@/components/panels/TextPanel';
import LayerPanel   from '@/components/editor/LayerPanel';
// [FEATURE: INSPECTOR_V2] 신형 통합 속성창 — 토글로 신/구형 전환, 기존 패널은 무변경
// (components/composer/inspector/README.md 참조. 롤백 = 토글 끄기 또는 이 분기 제거)
import ElementInspector from '@/components/composer/inspector/ElementInspector';

/* ── 상수 ─────────────────────────────────────────── */
const TAB_BREAKPOINT = 480; // px — 이 너비 미만이면 탭 모드
const INSPECTOR_V2_KEY = 'unolive-inspector-v2';

const PANELS = [
  { id: 'element' as const, label: '요소 설정' },
  { id: 'text'    as const, label: '텍스트 설정' },
  { id: 'layer'   as const, label: '레이어' },
];

type PanelId = (typeof PANELS)[number]['id'];

/* ── 각 패널 콘텐츠 ──────────────────────────────── */
function PanelContent({ id, v2, setV2 }: { id: PanelId; v2: boolean; setV2: (v: boolean) => void }) {
  if (id === 'element') {
    if (v2) return <ElementInspector onSwitchLegacy={() => setV2(false)} />;
    return (
      <div className="flex flex-col h-full">
        <button
          onClick={() => setV2(true)}
          className="flex-shrink-0 mx-3 mt-2 rounded border border-blue-900 bg-blue-950/40 px-2 py-1 text-[10px] text-blue-300 hover:bg-blue-900/40"
        >
          ✨ 신형 속성창 사용해 보기
        </button>
        <ElementPanel />
      </div>
    );
  }
  if (id === 'text') {
    if (v2) {
      return (
        <div className="flex h-full items-center justify-center px-4 text-center text-[10px] text-gray-600">
          신형 속성창 사용 중 —<br />타이포그래피는 &quot;요소 설정&quot; 열에 통합됨
        </div>
      );
    }
    return <TextPanel />;
  }
  return <LayerPanel />;
}

/* ── 섹션 헤더 라벨 ─────────────────────────────── */
function SectionHeader({ label }: { label: string }) {
  return (
    <p className="flex-shrink-0 px-3 py-[7px] text-[9px] font-semibold
                  text-gray-600 uppercase tracking-widest
                  border-b border-[#1a1a1a] bg-[#0d0d0d]">
      {label}
    </p>
  );
}

/* ── BottomPanels ────────────────────────────────── */
export default function BottomPanels() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isTabMode, setIsTabMode] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelId>('element');
  // [FEATURE: INSPECTOR_V2] 신형 속성창 토글 (localStorage 유지)
  const [inspectorV2, setInspectorV2] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(INSPECTOR_V2_KEY) === '1';
  });
  const setV2 = (v: boolean) => {
    setInspectorV2(v);
    try { localStorage.setItem(INSPECTOR_V2_KEY, v ? '1' : '0'); } catch { /* 무시 */ }
  };

  /* ResizeObserver: 너비에 따라 탭 모드 전환 */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setIsTabMode(entry.contentRect.width < TAB_BREAKPOINT);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-[#0d0d0d]">

      {isTabMode ? (
        /* ── 탭 모드 ── */
        <>
          {/* 탭 헤더 */}
          <div className="flex flex-shrink-0 border-b border-[#1a1a1a]">
            {PANELS.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveTab(p.id)}
                className={`flex-1 py-1.5 text-[9px] font-semibold uppercase tracking-widest
                            transition-colors border-b-2 -mb-px ${
                  activeTab === p.id
                    ? 'text-blue-400 border-blue-500'
                    : 'text-gray-600 border-transparent hover:text-gray-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* 활성 탭 콘텐츠 */}
          <div className="flex-1 overflow-y-auto">
            <PanelContent id={activeTab} v2={inspectorV2} setV2={setV2} />
          </div>
        </>

      ) : (
        /* ── 3열 모드 ── */
        <div className="flex h-full divide-x divide-[#1a1a1a]">
          {PANELS.map((p) => (
            <div key={p.id} className="flex-1 flex flex-col overflow-y-auto">
              <SectionHeader label={p.label} />
              <PanelContent id={p.id} v2={inspectorV2} setV2={setV2} />
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
