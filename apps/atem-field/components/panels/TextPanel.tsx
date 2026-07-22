'use client';

/**
 * TextPanel.tsx
 * 선택된 TextElement 의 폰트·색상·정렬·행간 편집 패널
 */

import React, { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { TextElement, DEFAULT_TEXT_SHADOW } from '@/lib/canvasTypes';
import { undoManager } from '@/lib/undoManager';
import { KOREAN_WEB_FONTS, KOREAN_CDN_FONT_FAMILIES, fontDisplayName } from '@/lib/webFonts';

/* ── 공통 UI ─────────────────────────────── */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-[5px] border-b border-[#1a1a1a] last:border-b-0">
      <span className="w-[54px] flex-shrink-0 text-[10px] text-gray-500 leading-none">{label}</span>
      <div className="flex flex-1 items-center gap-1.5 min-w-0">{children}</div>
    </div>
  );
}

function Val({ v }: { v: string }) {
  return <span className="w-9 flex-shrink-0 text-right text-[10px] text-gray-400 font-mono tabular-nums">{v}</span>;
}

function Slider({ min, max, step = 1, value, onChange }: {
  min: number; max: number; step?: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="flex-1 h-[3px] accent-blue-500 cursor-pointer"
    />
  );
}

function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative flex items-center gap-1 cursor-pointer">
      <span className="w-[18px] h-[18px] rounded-sm border border-[#444] flex-shrink-0"
        style={{ backgroundColor: value }} />
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        className="absolute left-0 top-0 w-[18px] h-[18px] opacity-0 cursor-pointer"
        onFocus={(e) => e.preventDefault()}
      />
      <span className="text-[10px] text-gray-500">{label}</span>
    </label>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative flex items-center gap-1.5 cursor-pointer select-none">
      <span className={`relative inline-flex w-8 h-4 rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-[#333]'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        tabIndex={-1}
        className="absolute left-0 top-0 w-8 h-4 opacity-0 cursor-pointer"
        onFocus={(e) => e.preventDefault()}
      />
      <span className="text-[10px] text-gray-400">{checked ? 'ON' : 'OFF'}</span>
    </label>
  );
}

function SegGroup<T extends string>({ options, value, onChange }: {
  options: { v: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded overflow-hidden border border-[#2a2a2a]">
      {options.map(({ v, label }) => (
        <button key={v} onClick={() => onChange(v)}
          className={`flex-1 py-[3px] text-[10px] transition-colors ${
            value === v ? 'bg-blue-600 text-white' : 'bg-[#1a1a1a] text-gray-500 hover:bg-[#252525] hover:text-gray-300'
          }`}>
          {label}
        </button>
      ))}
    </div>
  );
}

const SYSTEM_FONTS = ['Arial', 'Helvetica', 'Georgia', 'monospace'];

/**
 * 폰트 목록 관리
 * - 기본: 시스템 폰트 + 웹폰트(Google Fonts 38개) — 항상 표시
 * - "로컬" 버튼: queryLocalFonts() 또는 Canvas 프로빙으로 추가 시스템 폰트 감지
 */
let _cachedFonts: string[] | null = null;

/** 기본 폰트 목록: 시스템 + 인기 CDN 폰트 + 웹폰트 (항상 사용 가능) */
function buildDefaultFontList(): string[] {
  const merged = [...SYSTEM_FONTS];
  KOREAN_CDN_FONT_FAMILIES.forEach((f) => { if (!merged.includes(f)) merged.push(f); });
  KOREAN_WEB_FONTS.forEach((f) => { if (!merged.includes(f)) merged.push(f); });
  return merged;
}

const DEFAULT_FONT_LIST = buildDefaultFontList();

/** Canvas measureText 로 로컬 설치 폰트 감지 (프로빙) */
const PROBE_FONTS = [
  // macOS
  'Apple SD Gothic Neo', 'SF Pro', 'SF Pro Display', 'Helvetica Neue',
  'Avenir', 'Avenir Next', 'Futura', 'Gill Sans', 'Optima',
  'Palatino', 'Baskerville', 'Didot', 'Menlo', 'Monaco',
  'American Typewriter', 'Rockwell', 'Copperplate',
  // Windows
  'Segoe UI', 'Calibri', 'Cambria', 'Consolas', 'Verdana',
  'Tahoma', 'Trebuchet MS', 'Century Gothic', 'Garamond',
  'Bahnschrift', 'Cascadia Code', 'Lucida Console',
  // 한글 (로컬 설치용 — 웹폰트에 없는 것)
  'Pretendard', 'Spoqa Han Sans Neo',
  '맑은 고딕', 'Malgun Gothic',
  '돋움', 'Dotum', '굴림', 'Gulim', '바탕', 'Batang', '궁서', 'Gungsuh',
  'D2Coding', 'Gmarket Sans',
  '배달의민족 주아', 'BMJUA', '배달의민족 도현', 'BMDOHYEON',
  '빙그레체', 'Binggrae', '교보손글씨', 'KyoboHandwriting',
  '카페24 써라운드', 'Cafe24Ssurround',
  '나눔스퀘어', 'NanumSquare', 'NanumSquareRound',
  '잘난체', 'Jalnan',
];

function probeFonts(): string[] {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const testStr = '가나다라ABC123!@#%&';
  const base = 'monospace';
  ctx.font = `72px ${base}`;
  const baseW = ctx.measureText(testStr).width;
  const found: string[] = [];
  const seen = new Set<string>();
  for (const family of PROBE_FONTS) {
    if (seen.has(family)) continue;
    seen.add(family);
    ctx.font = `72px "${family}", ${base}`;
    if (ctx.measureText(testStr).width !== baseW) found.push(family);
  }
  return found;
}

function useLocalFonts() {
  const [fonts, setFonts] = useState<string[]>(_cachedFonts ?? DEFAULT_FONT_LIST);
  const [loaded, setLoaded] = useState(!!_cachedFonts);

  // 이전에 queryLocalFonts 권한 granted 된 경우 자동 로드
  useEffect(() => {
    if (_cachedFonts) { setFonts(_cachedFonts); setLoaded(true); return; }
    if (typeof window === 'undefined' || !('queryLocalFonts' in window)) return;
    navigator.permissions?.query?.({ name: 'local-fonts' as any })
      .then(async (status) => {
        if (status.state === 'granted') {
          try {
            const result = await queryAndMerge();
            setFonts(result); setLoaded(true);
          } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** "로컬" 버튼 클릭 — 시스템 폰트 추가 감지 */
  const loadFonts = async () => {
    // 1차: queryLocalFonts API (Electron / localhost / HTTPS)
    if ('queryLocalFonts' in window) {
      try {
        const result = await queryAndMerge();
        setFonts(result); setLoaded(true);
        return;
      } catch { /* 프로빙으로 폴백 */ }
    }
    // 2차: Canvas 프로빙 폴백
    const probed = probeFonts();
    const merged = [...DEFAULT_FONT_LIST];
    probed.forEach((f) => { if (!merged.includes(f)) merged.push(f); });
    _cachedFonts = merged;
    setFonts(merged);
    setLoaded(true);
  };

  return { fonts, loaded, loadFonts };
}

async function queryAndMerge(): Promise<string[]> {
  const localFonts: { family: string }[] = await (window as any).queryLocalFonts();
  const families = [...new Set(localFonts.map((f) => f.family))].sort((a, b) =>
    a.localeCompare(b, 'ko'),
  );
  const merged = [...DEFAULT_FONT_LIST];
  families.forEach((f) => { if (!merged.includes(f)) merged.push(f); });
  _cachedFonts = merged;
  return merged;
}

/* ── 메인 컴포넌트 ────────────────────────────── */
export default function TextPanel() {
  const { fonts: fontOptions, loaded: fontsLoaded, loadFonts } = useLocalFonts();
  const {
    currentSetlistId, activeItemId, activeSectionId,
    selectedElementId, setlists, updateElement,
  } = useStore();

  const setlist = setlists.find((sl) => sl.id === currentSetlistId);
  const item    = setlist?.items.find((it) => it.id === activeItemId);
  const section = item?.sections.find((sec) => sec.id === activeSectionId);
  const raw = section?.elements?.find((e) => e.id === selectedElementId);
  const el = raw?.type === 'text' ? (raw as TextElement) : undefined;

  if (!el) {
    return (
      <div className="flex items-center justify-center h-full text-[11px] text-gray-600 px-4 text-center">
        텍스트 요소를 선택하면<br />여기서 편집할 수 있습니다
      </div>
    );
  }

  const allElements = section?.elements ?? [];
  function upd(updates: Partial<TextElement>) {
    undoManager.pushState(allElements);
    updateElement(currentSetlistId!, activeItemId!, activeSectionId!, el!.id, updates as Partial<import('@/lib/canvasTypes').CanvasElement>);
  }

  return (
    <div className="flex flex-col text-white overflow-y-auto">

      {/* 가사 연결 */}
      <Row label="가사 연결">
        <Toggle checked={el.linked} onChange={(v) => upd({ linked: v })} />
      </Row>

      {/* 폰트 */}
      <Row label="폰트">
        <select
          value={el.fontFamily}
          onChange={(e) => upd({ fontFamily: e.target.value })}
          className="flex-1 bg-[#1c1c1c] border border-[#2a2a2a] rounded px-1.5 py-[3px]
                     text-[11px] text-gray-300 focus:outline-none focus:border-blue-500"
        >
          {fontOptions.map((f) => <option key={f} value={f}>{fontDisplayName(f)}</option>)}
        </select>
        {!fontsLoaded && (
          <button
            onClick={loadFonts}
            className="flex-shrink-0 px-1.5 py-[3px] rounded text-[9px] bg-[#2a2a2a] text-gray-400
                       hover:bg-[#333] hover:text-gray-200 border border-[#3a3a3a] transition-colors"
            title="시스템에 설치된 로컬 폰트 불러오기"
          >
            로컬
          </button>
        )}
      </Row>

      {/* 크기 */}
      <Row label="크기">
        <Slider min={1} max={1296} value={el.fontSize} onChange={(v) => upd({ fontSize: v })} />
        <input
          type="number"
          min={1}
          max={1296}
          value={el.fontSize}
          onChange={(e) => {
            const v = Math.max(1, Math.min(1296, Number(e.target.value) || 1));
            upd({ fontSize: v });
          }}
          className="w-14 bg-[#1e1e1e] border border-[#3a3a3a] rounded px-1.5 py-0.5 text-[11px] text-gray-200 text-center"
        />
      </Row>

      {/* 박스 자동맞춤(autoFit) — 켜지면 송출 시 박스에 맞춰 폰트를 줄인다(=지정 크기가 최대값). 끄면 지정 크기 그대로. */}
      <Row label="자동맞춤">
        <button
          onClick={() => upd({ autoFit: !el.autoFit })}
          title="켜짐: 송출 시 텍스트가 박스를 넘치면 폰트를 자동 축소 · 꺼짐: 지정한 크기 그대로 송출"
          className={`px-2 h-6 rounded text-[10px] border transition-colors flex-shrink-0 ${
            el.autoFit
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:border-[#444]'
          }`}
        >
          {el.autoFit ? '켜짐 · 박스에 맞춰 축소' : '꺼짐 · 지정 크기 유지'}
        </button>
      </Row>

      {/* 정렬 + Bold/Italic */}
      <Row label="정렬/서식">
        <SegGroup
          options={[
            { v: 'left'   as const, label: '←' },
            { v: 'center' as const, label: '≡' },
            { v: 'right'  as const, label: '→' },
          ]}
          value={el.textAlign}
          onChange={(v) => upd({ textAlign: v })}
        />
        <div className="w-px h-4 bg-[#2a2a2a] flex-shrink-0" />
        <button
          onClick={() => upd({ fontWeight: el.fontWeight === 'bold' ? 'normal' : 'bold' })}
          className={`w-7 h-6 rounded text-sm font-bold border transition-colors flex-shrink-0 ${
            el.fontWeight === 'bold'
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:border-[#444]'
          }`}
        >B</button>
        <button
          onClick={() => upd({ fontStyle: el.fontStyle === 'italic' ? 'normal' : 'italic' })}
          className={`w-7 h-6 rounded text-sm italic border transition-colors flex-shrink-0 ${
            el.fontStyle === 'italic'
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:border-[#444]'
          }`}
        >I</button>
      </Row>

      {/* 수직 정렬 */}
      <Row label="수직 정렬">
        <SegGroup
          options={[
            { v: 'top'    as const, label: '상' },
            { v: 'middle' as const, label: '중' },
            { v: 'bottom' as const, label: '하' },
          ]}
          value={el.verticalAlign}
          onChange={(v) => upd({ verticalAlign: v })}
        />
      </Row>

      {/* 색상 */}
      <Row label="색상">
        <div className="flex gap-4 flex-1">
          <ColorSwatch label="글자"  value={el.color}       onChange={(v) => upd({ color: v })} />
          <ColorSwatch label="외곽"  value={el.strokeColor} onChange={(v) => upd({ strokeColor: v })} />
        </div>
      </Row>

      {/* 외곽 두께 */}
      <Row label="외곽 두께">
        <Slider min={0} max={20} step={0.5} value={el.strokeWidth} onChange={(v) => upd({ strokeWidth: v })} />
        <Val v={`${el.strokeWidth}px`} />
      </Row>

      {/* 행간 */}
      <Row label="행간">
        <Slider min={0.8} max={2.5} step={0.05} value={el.lineHeight} onChange={(v) => upd({ lineHeight: v })} />
        <Val v={el.lineHeight.toFixed(2)} />
      </Row>

      {/* 자간 */}
      <Row label="자간">
        <Slider min={-5} max={20} step={0.5} value={el.letterSpacing} onChange={(v) => upd({ letterSpacing: v })} />
        <Val v={`${el.letterSpacing}px`} />
      </Row>

      {/* ── 그림자 (드롭 쉐도우) ─────────────── */}
      <Row label="그림자">
        <Toggle
          checked={el.useShadow ?? false}
          onChange={(v) => upd({
            useShadow: v,
            shadow: el.shadow ?? { ...DEFAULT_TEXT_SHADOW },
          })}
        />
      </Row>

      {el.useShadow && (() => {
        const sh = el.shadow ?? { ...DEFAULT_TEXT_SHADOW };
        const updShadow = (patch: Partial<typeof sh>) => upd({ shadow: { ...sh, ...patch } });
        return (
          <>
            <Row label="그림자 색">
              <ColorSwatch label="" value={sh.color.slice(0, 7)} onChange={(v) => updShadow({ color: v + sh.color.slice(7) })} />
            </Row>
            <Row label="X 오프셋">
              <Slider min={-20} max={20} step={1} value={sh.offsetX} onChange={(v) => updShadow({ offsetX: v })} />
              <Val v={`${sh.offsetX}px`} />
            </Row>
            <Row label="Y 오프셋">
              <Slider min={-20} max={20} step={1} value={sh.offsetY} onChange={(v) => updShadow({ offsetY: v })} />
              <Val v={`${sh.offsetY}px`} />
            </Row>
            <Row label="블러">
              <Slider min={0} max={30} step={1} value={sh.blur} onChange={(v) => updShadow({ blur: v })} />
              <Val v={`${sh.blur}px`} />
            </Row>
          </>
        );
      })()}

    </div>
  );
}
