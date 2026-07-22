'use client';

// 신형 속성창 공용 소형 컨트롤 — 접이식 섹션, 숫자/색상/세그먼트/토글/셀렉트 필드

import { useState, type ReactNode } from 'react';

/** 접이식 섹션 — 디자인 툴 인스펙터 관행 */
export function Section({ title, children, defaultOpen = true }: {
  title: string; children: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#1a1a1a]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300"
      >
        {title}
        <span className="text-[9px]">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="px-3 pb-3 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

/** 라벨 + 컨트롤 한 줄 */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 flex-shrink-0 text-[10px] text-gray-500">{label}</span>
      <div className="flex-1 min-w-0 flex items-center gap-1.5">{children}</div>
    </div>
  );
}

/** 숫자 필드 — 접미사 표시, 소수/스텝 지원 */
export function Num({ value, onChange, suffix, step = 1, min, max, w = 'w-full' }: {
  value: number; onChange: (v: number) => void; suffix?: string;
  step?: number; min?: number; max?: number; w?: string;
}) {
  return (
    <div className={`relative ${w}`}>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-full h-6 rounded border border-[#2a2a2a] bg-[#111] px-1.5 pr-6 text-[11px] text-gray-200 outline-none focus:border-blue-500"
      />
      {suffix && (
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-600">
          {suffix}
        </span>
      )}
    </div>
  );
}

/** 색상 스와치 + hex 입력 병행 */
export function ColorIn({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff';
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-7 flex-shrink-0 cursor-pointer rounded border border-[#2a2a2a] bg-transparent p-0"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-6 min-w-0 rounded border border-[#2a2a2a] bg-[#111] px-1.5 text-[10px] font-mono text-gray-300 outline-none focus:border-blue-500"
      />
    </div>
  );
}

/** 세그먼트 컨트롤 — 배타 선택 버튼 그룹 */
export function Seg<T extends string>({ value, options, onChange }: {
  value: T; options: { v: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-1 rounded border border-[#2a2a2a] overflow-hidden">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`flex-1 h-6 text-[10px] transition-colors ${
            value === o.v ? 'bg-blue-600 text-white' : 'bg-[#111] text-gray-500 hover:text-gray-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 토글 (체크박스 + 라벨) */
export function Toggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-gray-400 select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-blue-600"
      />
      {label}
    </label>
  );
}

/** 셀렉트 */
export function Sel<T extends string>({ value, options, onChange }: {
  value: T; options: { v: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="flex-1 h-6 min-w-0 rounded border border-[#2a2a2a] bg-[#111] px-1 text-[10px] text-gray-300 outline-none focus:border-blue-500"
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>{o.label}</option>
      ))}
    </select>
  );
}
