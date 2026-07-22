'use client';

import { useStore } from '@/lib/store';

/* ─────────────────────────────────────────────
   공통 UI 헬퍼
───────────────────────────────────────────── */

/** 라벨 + 컨트롤 한 줄 행 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-[5px] border-b border-[#1a1a1a] last:border-b-0">
      <span className="w-[54px] flex-shrink-0 text-[10px] text-gray-500 leading-none">{label}</span>
      <div className="flex flex-1 items-center gap-1.5 min-w-0">{children}</div>
    </div>
  );
}

/** 숫자 값 표시 */
function Val({ v }: { v: string }) {
  return (
    <span className="w-9 flex-shrink-0 text-right text-[10px] text-gray-400 font-mono tabular-nums">
      {v}
    </span>
  );
}

/** 슬라이더 */
function Slider({
  min, max, step = 1, value, onChange, disabled,
}: {
  min: number; max: number; step?: number;
  value: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <input
      type="range" min={min} max={max} step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled}
      className="flex-1 h-[3px] accent-blue-500 disabled:opacity-30 cursor-pointer"
    />
  );
}

/** 색상 스와치 클릭 피커 */
function ColorSwatch({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1 cursor-pointer">
      <span
        className="w-[18px] h-[18px] rounded-sm border border-[#444] flex-shrink-0"
        style={{ backgroundColor: value }}
      />
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" />
      <span className="text-[10px] text-gray-500">{label}</span>
    </label>
  );
}

/** 토글 스위치 */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none">
      <span className={`relative inline-flex w-8 h-4 rounded-full transition-colors ${
        checked ? 'bg-blue-500' : 'bg-[#333]'
      }`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`} />
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <span className="text-[10px] text-gray-400">{checked ? 'ON' : 'OFF'}</span>
    </label>
  );
}

/** 세그먼트 버튼 그룹 */
function SegGroup<T extends string>({
  options, value, onChange,
}: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded overflow-hidden border border-[#2a2a2a]">
      {options.map(({ v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 py-[3px] text-[10px] transition-colors ${
            value === v
              ? 'bg-blue-600 text-white'
              : 'bg-[#1a1a1a] text-gray-500 hover:bg-[#252525] hover:text-gray-300'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const FONT_OPTIONS = ['Noto Sans KR', 'Arial', 'Helvetica', 'Georgia', 'monospace'];

/* ─────────────────────────────────────────────
   StyleEditor 본체
───────────────────────────────────────────── */
export default function StyleEditor({ panel = 'text' }: { panel?: 'element' | 'text' }) {
  const { globalStyle, setGlobalStyle } = useStore();
  const s = globalStyle;
  const set = setGlobalStyle;

  /* ── 요소 설정 패널 ── */
  if (panel === 'element') {
    return (
      <div className="flex flex-col text-white">

        {/* 위치 X */}
        <Row label="위치 X">
          <Slider min={0} max={1} step={0.01} value={s.positionX} onChange={(v) => set({ positionX: v })} />
          <Val v={`${Math.round(s.positionX * 100)}%`} />
        </Row>

        {/* 위치 Y */}
        <Row label="위치 Y">
          <Slider min={0.05} max={0.97} step={0.01} value={s.positionY} onChange={(v) => set({ positionY: v })} />
          <Val v={`${Math.round(s.positionY * 100)}%`} />
        </Row>

        {/* 전체 투명도 */}
        <Row label="투명도">
          <Slider min={0} max={1} step={0.05} value={s.opacity} onChange={(v) => set({ opacity: v })} />
          <Val v={`${Math.round(s.opacity * 100)}%`} />
        </Row>

        {/* 배경 바 토글 */}
        <Row label="배경 바">
          <Toggle checked={s.backgroundBar} onChange={(v) => set({ backgroundBar: v })} />
        </Row>

        {/* 배경 색 */}
        <Row label="배경 색">
          <ColorSwatch
            label={s.backgroundBarColor}
            value={s.backgroundBarColor}
            onChange={(v) => set({ backgroundBarColor: v })}
          />
        </Row>

        {/* 배경 불투명도 */}
        <Row label="배경 농도">
          <Slider
            min={0} max={0.95} step={0.05}
            value={s.backgroundOpacity}
            onChange={(v) => set({ backgroundOpacity: v })}
            disabled={!s.backgroundBar}
          />
          <Val v={`${Math.round(s.backgroundOpacity * 100)}%`} />
        </Row>

      </div>
    );
  }

  /* ── 텍스트 설정 패널 ── */
  return (
    <div className="flex flex-col text-white">

      {/* 폰트 */}
      <Row label="폰트">
        <select
          value={s.fontFamily}
          onChange={(e) => set({ fontFamily: e.target.value })}
          className="flex-1 bg-[#1c1c1c] border border-[#2a2a2a] rounded px-1.5 py-[3px]
                     text-[11px] text-gray-300 focus:outline-none focus:border-blue-500"
        >
          {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Row>

      {/* 크기 */}
      <Row label="크기">
        <Slider min={12} max={120} value={s.fontSize} onChange={(v) => set({ fontSize: v })} />
        <Val v={`${s.fontSize}px`} />
      </Row>

      {/* 정렬 + 굵기/기울기 — 한 줄 */}
      <Row label="정렬/서식">
        <SegGroup
          options={[
            { v: 'left'   as const, label: '←' },
            { v: 'center' as const, label: '≡' },
            { v: 'right'  as const, label: '→' },
          ]}
          value={s.textAlign}
          onChange={(v) => set({ textAlign: v })}
        />
        <div className="w-px h-4 bg-[#2a2a2a] flex-shrink-0" />
        <button
          onClick={() => set({ fontWeight: s.fontWeight === 'bold' ? 'normal' : 'bold' })}
          className={`w-7 h-6 rounded text-sm font-bold border transition-colors flex-shrink-0 ${
            s.fontWeight === 'bold'
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:border-[#444]'
          }`}
        >B</button>
        <button
          onClick={() => set({ fontStyle: s.fontStyle === 'italic' ? 'normal' : 'italic' })}
          className={`w-7 h-6 rounded text-sm italic border transition-colors flex-shrink-0 ${
            s.fontStyle === 'italic'
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:border-[#444]'
          }`}
        >I</button>
      </Row>

      {/* 글자색 + 외곽색 */}
      <Row label="색상">
        <div className="flex gap-4 flex-1">
          <ColorSwatch label="글자" value={s.color}       onChange={(v) => set({ color: v })} />
          <ColorSwatch label="외곽" value={s.strokeColor} onChange={(v) => set({ strokeColor: v })} />
        </div>
      </Row>

      {/* 외곽 두께 */}
      <Row label="외곽 두께">
        <Slider min={0} max={12} step={0.5} value={s.strokeWidth} onChange={(v) => set({ strokeWidth: v })} />
        <Val v={`${s.strokeWidth}px`} />
      </Row>

      {/* 행간 */}
      <Row label="행간">
        <Slider min={0.8} max={2.5} step={0.05} value={s.lineHeight} onChange={(v) => set({ lineHeight: v })} />
        <Val v={s.lineHeight.toFixed(2)} />
      </Row>

      {/* 자간 */}
      <Row label="자간">
        <Slider min={-5} max={20} step={0.5} value={s.letterSpacing} onChange={(v) => set({ letterSpacing: v })} />
        <Val v={`${s.letterSpacing}px`} />
      </Row>

    </div>
  );
}
