'use client';

/**
 * _fields.tsx
 * 설정 카테고리 패널에서 공용으로 쓰는 Field/Row/Section 헬퍼
 */

import React from 'react';

/** 섹션 헤더 (카테고리 내부 그룹) */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h3 className="text-[13px] font-semibold text-gray-200 mb-1">{title}</h3>
      {description && (
        <p className="text-[11px] text-gray-500 mb-3">{description}</p>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** 한 줄 필드 (좌측 라벨, 우측 컨트롤) */
export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[#1a1a1a] last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-gray-300">{label}</div>
        {hint && <div className="text-[10px] text-gray-500 mt-0.5">{hint}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

/** 토글 스위치 */
export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        checked ? 'bg-blue-500' : 'bg-[#2a2a2a]'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}

/** 드롭다운 셀렉트 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={`h-7 px-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded text-[11px] text-gray-200 outline-none focus:border-blue-500 cursor-pointer ${className ?? ''}`}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/** 숫자 입력 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        className="w-16 h-7 px-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded text-[11px] text-gray-200 outline-none focus:border-blue-500 text-right"
      />
      {suffix && <span className="text-[10px] text-gray-500">{suffix}</span>}
    </div>
  );
}

/** 색상 입력 */
export function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer bg-transparent border border-[#2a2a2a]"
      />
      <span className="text-[10px] font-mono text-gray-500">{value}</span>
    </div>
  );
}
