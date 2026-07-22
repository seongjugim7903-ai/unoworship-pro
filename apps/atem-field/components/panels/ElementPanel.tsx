'use client';

/**
 * ElementPanel.tsx — 요소 설정 패널 (미리캔버스 스타일)
 *
 * 상단: 요소 추가 미니 툴바 (텍스트 / 사각형 / 원 / 둥근 사각 / 라인)
 * 하단: 선택된 요소의 공통 속성 편집
 *  - 위치·크기·회전·투명도
 *  - 그라데이션 (토글 + 색상 스탑 + 방향)
 *  - 도형 전용: 채움·테두리
 *  - 잠금·표시
 */

import React, { useState, useCallback, useRef } from 'react';
import { useStore } from '@/lib/store';
import { undoManager } from '@/lib/undoManager';
import {
  CanvasElement, ShapeElement, TextElement, ImageElement,
  ShapeType, GradientConfig, DEFAULT_GRADIENT,
  GradientMaskConfig, DEFAULT_GRADIENT_MASK,
  BoxShadowConfig, DEFAULT_BOX_SHADOW,
  OuterGlowConfig, DEFAULT_OUTER_GLOW,
  createTextElement, createShapeElement, createImageElement,
  CanvasRenderTarget,
  CanvasLayerRole,
  CANVAS_LAYER_ROLE_OPTIONS,
  CANVAS_RENDER_TARGET_OPTIONS,
  getDefaultLayerRoleForElement,
  getElementVisibleOn,
  resolveCornerRadii,
} from '@/lib/canvasTypes';
import {
  alignLeft, alignCenterH, alignRight,
  alignTop, alignMiddleV, alignBottom,
  distributeH, distributeV,
  type AlignUpdate,
} from '@/lib/alignActions';
import { BLEND_MODES, DEFAULT_BLEND_MODE } from '@/lib/imageProcessing/blendModes';
import { createDefaultImageFill } from '@/lib/imageProcessing/shapeFill';

/* ── 공통 UI 컴포넌트 ───────────────────────────── */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-[5px] border-b border-[#1a1a1a] last:border-b-0">
      <span className="w-[54px] flex-shrink-0 text-[10px] text-gray-500">{label}</span>
      <div className="flex flex-1 items-center gap-1.5 min-w-0">{children}</div>
    </div>
  );
}

function Val({ v }: { v: string }) {
  return (
    <span className="w-9 flex-shrink-0 text-right text-[10px] text-gray-400 font-mono tabular-nums">{v}</span>
  );
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

function ColorBtn({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <label className="relative flex items-center gap-1.5 cursor-pointer group">
      <span
        className="w-5 h-5 rounded border border-[#444] shadow-inner flex-shrink-0 transition-transform group-hover:scale-110"
        style={{ background: value }}
      />
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        className="absolute left-0 top-0 w-5 h-5 opacity-0 cursor-pointer"
        onFocus={(e) => e.preventDefault()}
      />
      {label && <span className="text-[10px] text-gray-500">{label}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
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
      {label && <span className="text-[10px] text-gray-400">{label}</span>}
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-[9px] font-semibold text-gray-600 uppercase tracking-widest bg-[#111] border-b border-[#1a1a1a]">
      {children}
    </div>
  );
}

/** 숫자 입력 (작은 사이즈) */
function NumInput({ value, onChange, min = 0, max = 200, placeholder }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; placeholder?: string;
}) {
  return (
    <input
      type="number" min={min} max={max} value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
      className="w-12 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1 py-[2px]
                 text-[10px] text-gray-300 text-center focus:outline-none focus:border-blue-500
                 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

/** 피그마 스타일 코너 래디우스 컨트롤 — 전체 값 + 개별 4코너 토글 */
function CornerRadiusControl({ shape, onChange }: {
  shape: ShapeElement;
  onChange: (updates: Partial<ShapeElement>) => void;
}) {
  const [showIndividual, setShowIndividual] = useState(!!shape.cornerRadii);
  const radii = resolveCornerRadii(shape);

  // 전체 값 (cornerRadii 가 있으면 모두 같을 때만 표시, 아니면 첫번째 값)
  const allSame = radii.every((r) => r === radii[0]);
  const uniformValue = allSame ? radii[0] : radii[0];

  const handleUniformChange = (v: number) => {
    onChange({ cornerRadius: v, cornerRadii: undefined });
  };

  const handleIndividualChange = (index: number, v: number) => {
    const next: [number, number, number, number] = [...radii];
    next[index] = v;
    onChange({ cornerRadii: next, cornerRadius: next[0] });
  };

  const toggleIndividual = () => {
    if (showIndividual) {
      // 개별 → 전체: 현재 값 중 첫번째로 통일
      setShowIndividual(false);
      onChange({ cornerRadius: radii[0], cornerRadii: undefined });
    } else {
      // 전체 → 개별: 현재 전체 값을 4개로 확장
      setShowIndividual(true);
      onChange({ cornerRadii: [uniformValue, uniformValue, uniformValue, uniformValue] });
    }
  };

  return (
    <>
      <Row label="모서리">
        <div className="flex items-center gap-1.5 flex-1">
          {!showIndividual ? (
            <>
              <Slider min={0} max={100} value={uniformValue} onChange={handleUniformChange} />
              <Val v={`${uniformValue}px`} />
            </>
          ) : (
            <span className="text-[10px] text-gray-500">개별 설정 중</span>
          )}
        </div>
        {/* 개별 토글 아이콘: 피그마 스타일 둥근사각 아이콘 */}
        <button
          onClick={toggleIndividual}
          title={showIndividual ? '전체 코너 동일값' : '코너 개별 설정'}
          className={`flex-shrink-0 w-6 h-6 rounded border transition-colors flex items-center justify-center ${
            showIndividual
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-500 hover:border-[#444] hover:text-gray-300'
          }`}
        >
          {/* 4코너 아이콘 SVG */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 1H2a1 1 0 00-1 1v2M10 1h2a1 1 0 011 1v2M4 13H2a1 1 0 01-1-1v-2M10 13h2a1 1 0 001-1v-2" />
          </svg>
        </button>
      </Row>
      {showIndividual && (
        <div className="px-3 py-2 border-b border-[#1a1a1a]">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-600 w-5">↖</span>
              <NumInput value={radii[0]} onChange={(v) => handleIndividualChange(0, v)} max={100} />
              <span className="text-[9px] text-gray-600">px</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-600 w-5">↗</span>
              <NumInput value={radii[1]} onChange={(v) => handleIndividualChange(1, v)} max={100} />
              <span className="text-[9px] text-gray-600">px</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-600 w-5">↙</span>
              <NumInput value={radii[3]} onChange={(v) => handleIndividualChange(3, v)} max={100} />
              <span className="text-[9px] text-gray-600">px</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-600 w-5">↘</span>
              <NumInput value={radii[2]} onChange={(v) => handleIndividualChange(2, v)} max={100} />
              <span className="text-[9px] text-gray-600">px</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** 이미지 코너 래디우스 컨트롤 — CornerRadiusControl과 동일한 UI */
function ImageCornerRadiusControl({ image, onChange }: {
  image: ImageElement;
  onChange: (updates: Partial<ImageElement>) => void;
}) {
  const [showIndividual, setShowIndividual] = useState(!!image.cornerRadii);
  const radii = resolveCornerRadii(image);
  const uniformValue = radii[0];

  const handleUniformChange = (v: number) => {
    onChange({ cornerRadius: v, cornerRadii: undefined });
  };

  const handleIndividualChange = (index: number, v: number) => {
    const next: [number, number, number, number] = [...radii];
    next[index] = v;
    onChange({ cornerRadii: next, cornerRadius: next[0] });
  };

  const toggleIndividual = () => {
    if (showIndividual) {
      setShowIndividual(false);
      onChange({ cornerRadius: radii[0], cornerRadii: undefined });
    } else {
      setShowIndividual(true);
      onChange({ cornerRadii: [uniformValue, uniformValue, uniformValue, uniformValue] });
    }
  };

  return (
    <>
      <Row label="모서리">
        <div className="flex items-center gap-1.5 flex-1">
          {!showIndividual ? (
            <>
              <Slider min={0} max={100} value={uniformValue} onChange={handleUniformChange} />
              <Val v={`${uniformValue}px`} />
            </>
          ) : (
            <span className="text-[10px] text-gray-500">개별 설정 중</span>
          )}
        </div>
        <button
          onClick={toggleIndividual}
          title={showIndividual ? '전체 코너 동일값' : '코너 개별 설정'}
          className={`flex-shrink-0 w-6 h-6 rounded border transition-colors flex items-center justify-center ${
            showIndividual
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-500 hover:border-[#444] hover:text-gray-300'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 1H2a1 1 0 00-1 1v2M10 1h2a1 1 0 011 1v2M4 13H2a1 1 0 01-1-1v-2M10 13h2a1 1 0 001-1v-2" />
          </svg>
        </button>
      </Row>
      {showIndividual && (
        <div className="px-3 py-2 border-b border-[#1a1a1a]">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-600 w-5">↖</span>
              <NumInput value={radii[0]} onChange={(v) => handleIndividualChange(0, v)} max={100} />
              <span className="text-[9px] text-gray-600">px</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-600 w-5">↗</span>
              <NumInput value={radii[1]} onChange={(v) => handleIndividualChange(1, v)} max={100} />
              <span className="text-[9px] text-gray-600">px</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-600 w-5">↙</span>
              <NumInput value={radii[3]} onChange={(v) => handleIndividualChange(3, v)} max={100} />
              <span className="text-[9px] text-gray-600">px</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-600 w-5">↘</span>
              <NumInput value={radii[2]} onChange={(v) => handleIndividualChange(2, v)} max={100} />
              <span className="text-[9px] text-gray-600">px</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── 그라데이션 마스크 컨트롤 (포토샵 레이어 마스크) ─────── */
const ANGLE_PRESETS = [
  { angle: 0,   label: '→' },
  { angle: 90,  label: '↓' },
  { angle: 180, label: '←' },
  { angle: 270, label: '↑' },
  { angle: 45,  label: '↘' },
  { angle: 135, label: '↙' },
  { angle: 225, label: '↖' },
  { angle: 315, label: '↗' },
];

function GradientMaskControl({ element, onChange }: {
  element: CanvasElement;
  onChange: (updates: Partial<CanvasElement>) => void;
}) {
  const gm = element.gradientMask ?? DEFAULT_GRADIENT_MASK;
  const enabled = gm.enabled;

  const update = (partial: Partial<GradientMaskConfig>) => {
    onChange({ gradientMask: { ...gm, ...partial } } as Partial<CanvasElement>);
  };

  return (
    <>
      <SectionTitle>그라데이션 마스크</SectionTitle>
      <div className="px-3 py-2 border-b border-[#1a1a1a] space-y-2">
        {/* ON/OFF */}
        <div className="flex items-center justify-between">
          <Toggle checked={enabled} onChange={(v) => update({ enabled: v })} label="활성" />
          {enabled && (
            <select
              value={gm.type}
              onChange={(e) => update({ type: e.target.value as 'linear' | 'radial' })}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-[10px] text-gray-300"
            >
              <option value="linear">선형</option>
              <option value="radial">방사형</option>
            </select>
          )}
        </div>

        {enabled && (
          <>
            {/* 방향 프리셋 (linear만) */}
            {gm.type === 'linear' && (
              <div className="flex flex-wrap gap-1">
                {ANGLE_PRESETS.map((p) => (
                  <button
                    key={p.angle}
                    onClick={() => update({ angle: p.angle })}
                    className={`w-7 h-7 flex items-center justify-center rounded text-[11px] border transition-colors ${
                      gm.angle === p.angle
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            {/* 각도 슬라이더 (linear만) */}
            {gm.type === 'linear' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-8">각도</span>
                <Slider min={0} max={360} step={1} value={gm.angle} onChange={(v) => update({ angle: v })} />
                <span className="text-[10px] text-gray-400 w-8">{gm.angle}°</span>
              </div>
            )}

            {/* 스탑 컨트롤 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">마스크 스탑</span>
                <button
                  onClick={() => {
                    // 중간 스탑 추가
                    const newStops = [...gm.stops];
                    newStops.splice(1, 0, { offset: 0.5, opacity: 0.5 });
                    update({ stops: newStops });
                  }}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[#2a2a2a] text-gray-500 hover:text-gray-300"
                >
                  + 추가
                </button>
              </div>

              {/* 미리보기 바 */}
              <div
                className="h-4 rounded border border-[#333]"
                style={{
                  background: gm.type === 'radial'
                    ? `radial-gradient(ellipse at center, ${gm.stops.map((s) => `rgba(255,255,255,${s.opacity}) ${s.offset * 100}%`).join(', ')})`
                    : `linear-gradient(${90 + gm.angle}deg, ${gm.stops.map((s) => `rgba(255,255,255,${s.opacity}) ${s.offset * 100}%`).join(', ')})`,
                }}
              />

              {gm.stops.map((stop, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  {/* 위치 */}
                  <span className="text-[9px] text-gray-600 w-6">{Math.round(stop.offset * 100)}%</span>
                  <Slider
                    min={0} max={1} step={0.01}
                    value={stop.opacity}
                    onChange={(v) => {
                      const newStops = [...gm.stops];
                      newStops[i] = { ...newStops[i], opacity: v };
                      update({ stops: newStops });
                    }}
                  />
                  {/* 불투명도 표시 (흰=보임, 검=투명) */}
                  <div
                    className="w-4 h-4 rounded border border-[#444]"
                    style={{ background: `rgb(${Math.round(stop.opacity * 255)},${Math.round(stop.opacity * 255)},${Math.round(stop.opacity * 255)})` }}
                  />
                  {/* 위치 조절 */}
                  <input
                    type="number"
                    min={0} max={100} step={1}
                    value={Math.round(stop.offset * 100)}
                    onChange={(e) => {
                      const newStops = [...gm.stops];
                      newStops[i] = { ...newStops[i], offset: Math.max(0, Math.min(1, Number(e.target.value) / 100)) };
                      // 정렬
                      newStops.sort((a, b) => a.offset - b.offset);
                      update({ stops: newStops });
                    }}
                    className="w-10 bg-[#1e1e1e] border border-[#3a3a3a] rounded px-1 py-0.5 text-[9px] text-gray-300 text-center"
                  />
                  {/* 삭제 (2개 이하일 때 비활성) */}
                  {gm.stops.length > 2 && (
                    <button
                      onClick={() => {
                        const newStops = gm.stops.filter((_, idx) => idx !== i);
                        update({ stops: newStops });
                      }}
                      className="text-[10px] text-gray-600 hover:text-red-400"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            <p className="text-[9px] text-gray-600">
              흰색 = 보임 · 검정 = 투명 (포토샵 레이어 마스크)
            </p>
          </>
        )}
      </div>
    </>
  );
}

/* ── 정렬 · 분배 툴바 (복수 선택 시 표시) ─────────── */
function AlignToolbar({
  onAlign,
  canDistribute,
}: {
  onAlign: (fn: (els: CanvasElement[]) => AlignUpdate[]) => void;
  canDistribute: boolean;
}) {
  const btn =
    'flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-[#2a2a2a] hover:text-white transition-colors active:scale-95';
  const divider = 'w-px h-5 bg-[#2a2a2a] mx-0.5';

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#1a1a1a] bg-[#111]">
      {/* 수평 정렬 */}
      <button className={btn} title="좌측 정렬" onClick={() => onAlign(alignLeft)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="2" y1="1" x2="2" y2="15" />
          <rect x="4" y="3" width="8" height="3" rx="0.5" />
          <rect x="4" y="9" width="5" height="3" rx="0.5" />
        </svg>
      </button>
      <button className={btn} title="수평 중앙 정렬" onClick={() => onAlign(alignCenterH)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="8" y1="1" x2="8" y2="15" strokeDasharray="2 2" />
          <rect x="3" y="3" width="10" height="3" rx="0.5" />
          <rect x="5" y="9" width="6" height="3" rx="0.5" />
        </svg>
      </button>
      <button className={btn} title="우측 정렬" onClick={() => onAlign(alignRight)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="14" y1="1" x2="14" y2="15" />
          <rect x="4" y="3" width="8" height="3" rx="0.5" />
          <rect x="7" y="9" width="5" height="3" rx="0.5" />
        </svg>
      </button>

      <div className={divider} />

      {/* 수직 정렬 */}
      <button className={btn} title="상단 정렬" onClick={() => onAlign(alignTop)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="1" y1="2" x2="15" y2="2" />
          <rect x="3" y="4" width="3" height="8" rx="0.5" />
          <rect x="9" y="4" width="3" height="5" rx="0.5" />
        </svg>
      </button>
      <button className={btn} title="수직 중앙 정렬" onClick={() => onAlign(alignMiddleV)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="1" y1="8" x2="15" y2="8" strokeDasharray="2 2" />
          <rect x="3" y="2" width="3" height="12" rx="0.5" />
          <rect x="9" y="4" width="3" height="8" rx="0.5" />
        </svg>
      </button>
      <button className={btn} title="하단 정렬" onClick={() => onAlign(alignBottom)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="1" y1="14" x2="15" y2="14" />
          <rect x="3" y="4" width="3" height="8" rx="0.5" />
          <rect x="9" y="7" width="3" height="5" rx="0.5" />
        </svg>
      </button>

      <div className={divider} />

      {/* 균등분배 */}
      <button
        className={`${btn} ${!canDistribute ? 'opacity-30 pointer-events-none' : ''}`}
        title="가로 간격 균등분배"
        onClick={() => onAlign(distributeH)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="4" width="3" height="8" rx="0.5" />
          <rect x="6.5" y="4" width="3" height="8" rx="0.5" />
          <rect x="12" y="4" width="3" height="8" rx="0.5" />
        </svg>
      </button>
      <button
        className={`${btn} ${!canDistribute ? 'opacity-30 pointer-events-none' : ''}`}
        title="세로 간격 균등분배"
        onClick={() => onAlign(distributeV)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="4" y="1" width="8" height="3" rx="0.5" />
          <rect x="4" y="6.5" width="8" height="3" rx="0.5" />
          <rect x="4" y="12" width="8" height="3" rx="0.5" />
        </svg>
      </button>

      <span className="ml-auto text-[9px] text-gray-700 pr-0.5 whitespace-nowrap">
        {canDistribute ? '정렬 · 분배' : '정렬'}
      </span>
    </div>
  );
}

/* ── 요소 추가 미니 툴바 ─────────────────────────── */
function AddElementToolbar({
  onAdd
}: {
  onAdd: (type: 'text' | 'image' | 'fill' | ShapeType) => void;
}) {
  const tools: { id: 'text' | 'image' | 'fill' | ShapeType; icon: React.ReactNode; tip: string }[] = [
    {
      id: 'text',
      tip: '텍스트 추가',
      icon: (
        <span className="font-bold text-[13px] leading-none select-none" style={{ fontFamily: 'Georgia, serif' }}>T</span>
      ),
    },
    {
      id: 'image',
      tip: '이미지 추가',
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1.5" y="1.5" width="11" height="11" stroke="currentColor" strokeWidth="1.3" rx="1.5"/>
          <circle cx="5" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1"/>
          <path d="M1.5 10l3-3 2 2 3-4 3 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      id: 'rect',
      tip: '사각형',
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1.5" y="1.5" width="11" height="11" stroke="currentColor" strokeWidth="1.5" rx="0"/>
        </svg>
      ),
    },
    {
      id: 'roundRect',
      tip: '둥근 사각형',
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1.5" y="1.5" width="11" height="11" stroke="currentColor" strokeWidth="1.5" rx="3"/>
        </svg>
      ),
    },
    {
      id: 'ellipse',
      tip: '원 / 타원',
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <ellipse cx="7" cy="7" rx="5.5" ry="5.5" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
    },
    {
      id: 'line',
      tip: '라인',
      icon: (
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
          <line x1="1" y1="5" x2="13" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      id: 'fill',
      tip: '배경 채움 (전체)',
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="12" height="12" fill="currentColor" rx="1"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="flex items-center gap-0.5 px-2 py-2 border-b border-[#1a1a1a] bg-[#111]">
      {tools.map(({ id, icon, tip }) => (
        <button
          key={id}
          onClick={() => onAdd(id)}
          title={tip}
          className="flex items-center justify-center w-8 h-8 rounded-md text-gray-400
                     hover:bg-[#2a2a2a] hover:text-white border border-transparent
                     hover:border-[#3a3a3a] transition-all active:scale-95"
        >
          {icon}
        </button>
      ))}
      <div className="ml-auto text-[9px] text-gray-700 pr-1 leading-tight">
        클릭하여<br/>추가
      </div>
    </div>
  );
}

/* ── 그라데이션 편집기 ──────────────────────────── */
function GradientEditor({
  gradient,
  onChange,
}: {
  gradient: GradientConfig;
  onChange: (g: GradientConfig) => void;
}) {
  const ANGLE_PRESETS = [
    { label: '→', angle: 90 },
    { label: '↓', angle: 180 },
    { label: '↗', angle: 45 },
    { label: '↘', angle: 135 },
    { label: '●', angle: -1, radial: true }, // radial 전용
  ];

  function setStop(idx: number, key: 'color' | 'offset', value: string | number) {
    const stops = gradient.stops.map((s, i) =>
      i === idx ? { ...s, [key]: value } : s
    );
    onChange({ ...gradient, stops });
  }

  return (
    <div className="flex flex-col gap-1 py-2 px-3 bg-[#111]">
      {/* 방향 프리셋 버튼 */}
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[9px] text-gray-600 w-9 flex-shrink-0">방향</span>
        <div className="flex gap-0.5">
          {ANGLE_PRESETS.map(({ label, angle, radial }) => {
            const active = radial
              ? gradient.type === 'radial'
              : gradient.type === 'linear' && gradient.angle === angle;
            return (
              <button
                key={label}
                onClick={() =>
                  onChange({
                    ...gradient,
                    type: radial ? 'radial' : 'linear',
                    angle: radial ? gradient.angle : angle,
                  })
                }
                className={`w-7 h-6 text-[11px] rounded border transition-colors ${
                  active
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-500 hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {gradient.type === 'linear' && (
          <input
            type="number"
            value={gradient.angle}
            min={0} max={360}
            onChange={(e) => onChange({ ...gradient, angle: Number(e.target.value) })}
            className="w-10 ml-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1 py-0.5
                       text-[10px] text-gray-300 focus:outline-none focus:border-blue-500
                       [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                       [&::-webkit-inner-spin-button]:appearance-none"
          />
        )}
      </div>

      {/* 색상 스탑 — 첫 번째·마지막 */}
      {gradient.stops.map((stop, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <span className="text-[9px] text-gray-600 w-9 flex-shrink-0">
            {idx === 0 ? '시작' : idx === gradient.stops.length - 1 ? '끝' : `${Math.round(stop.offset * 100)}%`}
          </span>
          <ColorBtn value={stop.color} onChange={(v) => setStop(idx, 'color', v)} />
          <input
            type="range" min={0} max={1} step={0.01} value={stop.offset}
            onChange={(e) => setStop(idx, 'offset', Number(e.target.value))}
            className="flex-1 h-[3px] accent-blue-500 cursor-pointer"
          />
          <span className="text-[10px] text-gray-600 w-7 text-right font-mono tabular-nums">
            {Math.round(stop.offset * 100)}%
          </span>
        </div>
      ))}

      {/* 그라데이션 미리보기 바 */}
      <div
        className="h-3 rounded-sm mt-1 border border-[#333]"
        style={{
          background:
            gradient.type === 'radial'
              ? `radial-gradient(circle, ${gradient.stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`
              : `linear-gradient(${gradient.angle}deg, ${gradient.stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`,
        }}
      />
    </div>
  );
}

/* ── 메인 컴포넌트 ──────────────────────────────── */
export default function ElementPanel() {
  const {
    currentSetlistId, activeItemId, activeSectionId,
    selectedElementId, selectedElementIds, setlists,
    updateElement, addElement, setSelectedElement,
    isEraserMode, setEraserMode,
    eraserBrushSize, setEraserBrushSize,
    eraserHardness, setEraserHardness,
    isSelectionMode, setSelectionMode,
  } = useStore();

  const [showGradient, setShowGradient] = useState(false);
  const shapeFillInputRef = useRef<HTMLInputElement>(null);

  const setlist = setlists.find((sl) => sl.id === currentSetlistId);
  const item    = setlist?.items.find((it) => it.id === activeItemId);
  const section = item?.sections.find((sec) => sec.id === activeSectionId);
  const el: CanvasElement | undefined = section?.elements?.find((e) => e.id === selectedElementId);

  const isReady = !!(currentSetlistId && activeItemId && activeSectionId);

  /* 멀티셀렉트 정렬 */
  const allElements = section?.elements ?? [];
  const selectedElements = allElements.filter((e) => selectedElementIds.includes(e.id));
  const showAlignment = selectedElements.length >= 2;
  const canDistribute = selectedElements.length >= 3;

  function handleAlign(actionFn: (els: CanvasElement[]) => AlignUpdate[]) {
    if (!currentSetlistId || !activeItemId || !activeSectionId) return;
    undoManager.pushState(allElements);
    const updates = actionFn(selectedElements);
    for (const { id, x, y } of updates) {
      updateElement(currentSetlistId, activeItemId, activeSectionId, id, { x, y });
    }
  }

  /* 이미지 파일 선택 ref */
  const imageInputRef = useRef<HTMLInputElement>(null);

  /* 요소 추가 핸들러 */
  function handleAdd(type: 'text' | 'image' | 'fill' | ShapeType) {
    if (!isReady) return;
    const count = section?.elements?.length ?? 0;

    if (type === 'text') {
      const newEl = createTextElement({ zIndex: count, linked: false, content: '여기에 텍스트 입력' });
      addElement(currentSetlistId!, activeItemId!, activeSectionId!, newEl);
      setSelectedElement(newEl.id);
    } else if (type === 'image') {
      // 파일 선택 다이얼로그 열기
      imageInputRef.current?.click();
    } else if (type === 'fill') {
      // 전체 배경 채움: 캔버스 전체를 덮는 흰색 사각형 (맨 뒤 zIndex)
      const newEl = createShapeElement({
        shapeType: 'rect',
        x: 0, y: 0, width: 100, height: 100,
        fill: '#ffffff',
        fillOpacity: 1,
        stroke: 'transparent',
        strokeWidth: 0,
        zIndex: 0,
      });
      // 기존 요소들의 zIndex를 1씩 올려서 배경이 맨 뒤로
      const existing = section?.elements ?? [];
      existing.forEach((el) => {
        updateElement(currentSetlistId!, activeItemId!, activeSectionId!, el.id, { zIndex: el.zIndex + 1 });
      });
      addElement(currentSetlistId!, activeItemId!, activeSectionId!, newEl);
      setSelectedElement(newEl.id);
    } else {
      const newEl = createShapeElement({ shapeType: type, zIndex: count });
      addElement(currentSetlistId!, activeItemId!, activeSectionId!, newEl);
      setSelectedElement(newEl.id);
    }
  }

  /* 이미지 파일 선택 후 요소 추가 */
  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      // 이미지 압축 (큰 파일 대비)
      const img = await new Promise<HTMLImageElement>((resolve) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.src = dataUrl;
      });
      const MAX_DIM = 2048;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > MAX_DIM || h > MAX_DIM) {
        const scale = MAX_DIM / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      let compressed = cv.toDataURL('image/webp', 0.82);
      if (!compressed.startsWith('data:image/webp')) {
        compressed = cv.toDataURL('image/jpeg', 0.82);
      }

      // 캔버스 비율에 맞게 크기 계산 (16:9 기준)
      const aspectRatio = w / h;
      let elW = 40, elH = 40;
      if (aspectRatio > 1) { elH = elW / aspectRatio * (16 / 9); }
      else { elW = elH * aspectRatio * (9 / 16); }

      const count = section?.elements?.length ?? 0;
      const newEl = createImageElement({
        zIndex: count,
        src: compressed,
        width: Math.min(80, elW),
        height: Math.min(80, elH),
        x: 10,
        y: 10,
      });
      addElement(currentSetlistId!, activeItemId!, activeSectionId!, newEl);
      setSelectedElement(newEl.id);
    };
    reader.readAsDataURL(file);
  }

  /* 공통 업데이트 — [UNDO] 변경 전 스냅샷 저장 */
  function upd(updates: Partial<CanvasElement>) {
    if (!el) return;
    undoManager.pushState(allElements);
    updateElement(currentSetlistId!, activeItemId!, activeSectionId!, el.id, updates);
  }

  function updShape(updates: Partial<ShapeElement>) {
    upd(updates as Partial<CanvasElement>);
  }

  function updText(updates: Partial<TextElement>) {
    upd(updates as Partial<CanvasElement>);
  }

  function updImage(updates: Partial<ImageElement>) {
    upd(updates as Partial<CanvasElement>);
  }

  function setLayerRole(role: CanvasLayerRole) {
    upd({
      layerRole: role,
      ...(role === 'mask' ? { fixedLayer: true } : {}),
    } as Partial<CanvasElement>);
  }

  function toggleRenderTarget(target: CanvasRenderTarget) {
    if (!el) return;
    const current = getElementVisibleOn(el);
    const hasTarget = current.includes(target);
    const next = hasTarget
      ? current.filter((value) => value !== target)
      : [...current, target];

    if (next.length === 0) return;
    upd({ visibleOn: next } as Partial<CanvasElement>);
  }

  const shape = el?.type === 'shape' ? (el as ShapeElement) : null;
  const text  = el?.type === 'text'  ? (el as TextElement)  : null;
  const image = el?.type === 'image' ? (el as ImageElement) : null;

  /* 멀티셀렉트 이미지 블렌딩 */
  const selectedImages = selectedElements.filter((e): e is ImageElement => e.type === 'image');
  const topImage = selectedImages.length >= 2
    ? selectedImages.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
    : null;

  /* 배경 제거 상태 */
  const [bgRemoveProgress, setBgRemoveProgress] = useState<number | null>(null);
  const [bgRemoveError, setBgRemoveError] = useState<string | null>(null);

  const handleRemoveBackground = useCallback(async () => {
    if (!image) return;
    setBgRemoveProgress(0);
    setBgRemoveError(null);
    try {
      const { removeBackground } = await import('@/lib/imageProcessing/removeBackground');
      const resultDataUrl = await removeBackground(image.src, (p) => {
        setBgRemoveProgress(Math.round(p.progress * 100));
      });
      undoManager.pushState(allElements);
      updateElement(currentSetlistId!, activeItemId!, activeSectionId!, image.id, { src: resultDataUrl });
      setBgRemoveProgress(null);
    } catch (err) {
      console.error('배경 제거 실패:', err);
      setBgRemoveError(err instanceof Error ? err.message : '알 수 없는 오류');
      setBgRemoveProgress(null);
    }
  }, [image, allElements, currentSetlistId, activeItemId, activeSectionId, updateElement]);

  /* 그라데이션 핸들러 */
  function handleGradientChange(g: GradientConfig) {
    upd({ gradient: g } as Partial<CanvasElement>);
  }

  const hasGradient = shape || text;
  const currentGradient = (el as (ShapeElement | TextElement) | undefined)?.gradient ?? DEFAULT_GRADIENT;
  const useGradient = (el as (ShapeElement | TextElement) | undefined)?.useGradient ?? false;

  return (
    <div className="flex flex-col h-full text-white overflow-y-auto bg-[#0d0d0d]">

      {/* ── 요소 추가 툴바 ── */}
      <AddElementToolbar onAdd={handleAdd} />
      {/* 이미지 파일 선택 (숨김) */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFile}
      />

      {/* ── 정렬 · 분배 툴바 (복수 선택 시) ── */}
      {showAlignment && (
        <AlignToolbar onAlign={handleAlign} canDistribute={canDistribute} />
      )}

      {/* ── 선택된 요소 없으면 안내 ── */}
      {!el && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 px-4 text-center">
          <div className="text-[28px] opacity-20">✦</div>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            위 버튼으로 요소를 추가하거나<br/>캔버스에서 요소를 클릭하세요
          </p>
        </div>
      )}

      {/* ── 선택된 요소 속성 ── */}
      {el && (
        <>
          <SectionTitle>위치 · 크기</SectionTitle>

          <Row label="위치 X">
            <Slider min={0} max={100} step={0.5} value={el.x} onChange={(v) => upd({ x: v })} />
            <Val v={`${Math.round(el.x)}%`} />
          </Row>
          <Row label="위치 Y">
            <Slider min={0} max={100} step={0.5} value={el.y} onChange={(v) => upd({ y: v })} />
            <Val v={`${Math.round(el.y)}%`} />
          </Row>
          <Row label="너비">
            <Slider min={5} max={100} step={0.5} value={el.width} onChange={(v) => upd({ width: v })} />
            <Val v={`${Math.round(el.width)}%`} />
          </Row>
          <Row label="높이">
            <Slider min={2} max={100} step={0.5} value={el.height} onChange={(v) => upd({ height: v })} />
            <Val v={`${Math.round(el.height)}%`} />
          </Row>
          <Row label="회전">
            <Slider min={-180} max={180} value={el.rotation} onChange={(v) => upd({ rotation: v })} />
            <Val v={`${el.rotation}°`} />
          </Row>

          <SectionTitle>투명도</SectionTitle>
          <Row label="불투명도">
            <Slider min={0} max={1} step={0.01} value={el.opacity} onChange={(v) => upd({ opacity: v })} />
            <Val v={`${Math.round(el.opacity * 100)}%`} />
          </Row>

          {/* ── 지우개 ── */}
          <SectionTitle>지우개</SectionTitle>
          <div className="px-3 py-2 border-b border-[#1a1a1a]">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setEraserMode(!isEraserMode)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isEraserMode
                    ? 'bg-red-600/30 border border-red-500/60 text-red-300'
                    : 'bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] hover:border-[#444] text-gray-400 hover:text-gray-200'
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 21h10" />
                  <path d="M5.5 13.5 9 17l8.5-8.5a2.83 2.83 0 0 0-4-4L5 13" />
                  <path d="m2 21 3.5-3.5" />
                </svg>
                {isEraserMode ? '지우개 ON' : '지우개'}
              </button>
              {el.eraserMask && (
                <button
                  onClick={() => upd({ eraserMask: undefined } as Partial<CanvasElement>)}
                  title="마스크 초기화"
                  className="px-2 py-1.5 rounded-md text-[10px] bg-[#1a1a1a] hover:bg-[#252525]
                             border border-[#333] hover:border-[#444] text-gray-400 hover:text-gray-200 transition-colors"
                >
                  초기화
                </button>
              )}
            </div>
            {isEraserMode && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-10 text-[10px] text-gray-500">크기</span>
                  <Slider min={0.01} max={1.0} step={0.005} value={eraserBrushSize} onChange={setEraserBrushSize} />
                  <Val v={`${Math.round(eraserBrushSize * 300)}`} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-10 text-[10px] text-gray-500">경도</span>
                  <Slider min={0} max={100} step={1} value={eraserHardness} onChange={setEraserHardness} />
                  <Val v={`${eraserHardness}%`} />
                </div>
                <p className="text-[9px] text-gray-600 mt-0.5">
                  요소 위에서 드래그하여 지우기 · 경도 0 = 부드러움
                </p>
              </div>
            )}
          </div>

          {/* ── 선택 도구 (이미지 또는 도형+이미지채우기만) ── */}
          {(image || shape?.imageFill) && (<>
          <SectionTitle>선택 도구</SectionTitle>
          <div className="px-3 py-2 border-b border-[#1a1a1a]">
            <button
              onClick={() => setSelectionMode(!isSelectionMode)}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isSelectionMode
                  ? 'bg-blue-600/30 border border-blue-500/60 text-blue-300'
                  : 'bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] hover:border-[#444] text-gray-400 hover:text-gray-200'
              }`}
            >
              {/* 점선 사각 아이콘 */}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 3">
                <rect x="3" y="3" width="18" height="18" rx="1" />
              </svg>
              {isSelectionMode ? '선택 ON' : '선택'}
            </button>
            {isSelectionMode && (
              <div className="mt-2 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-10 text-[10px] text-gray-500">너비</span>
                  <input
                    type="number" min={1} max={1920} step={1}
                    placeholder="W"
                    className="flex-1 h-6 px-1.5 text-[10px] bg-[#1a1a1a] border border-[#333] rounded text-gray-300 outline-none focus:border-blue-500/60"
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const px = Number(e.target.value);
                      if (px > 0 && px <= 1920) {
                        // px → 요소 내부 비율(0–1) 변환: 요소의 실제 px 너비 = (el.width/100)*1920
                        const elPxW = (el.width / 100) * 1920;
                        window.dispatchEvent(new CustomEvent('selection-resize', { detail: { w: px / elPxW } }));
                      }
                    }}
                  />
                  <span className="text-[10px] text-gray-600">px</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-10 text-[10px] text-gray-500">높이</span>
                  <input
                    type="number" min={1} max={1080} step={1}
                    placeholder="H"
                    className="flex-1 h-6 px-1.5 text-[10px] bg-[#1a1a1a] border border-[#333] rounded text-gray-300 outline-none focus:border-blue-500/60"
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const px = Number(e.target.value);
                      if (px > 0 && px <= 1080) {
                        const elPxH = (el.height / 100) * 1080;
                        window.dispatchEvent(new CustomEvent('selection-resize', { detail: { h: px / elPxH } }));
                      }
                    }}
                  />
                  <span className="text-[10px] text-gray-600">%</span>
                </div>
                <p className="text-[9px] text-gray-600 mt-0.5">
                  드래그로 영역 선택 · 화살표로 이동<br/>
                  선택 영역 더블클릭 → 새 요소 생성<br/>
                  Ctrl+C 복사 · Ctrl+V 붙여넣기 · ESC 취소
                </p>
              </div>
            )}
          </div>
          </>)}

          {/* ── 이미지 전용 ── */}
          {image && (
            <>
              <SectionTitle>이미지</SectionTitle>
              <div className="px-3 py-2 border-b border-[#1a1a1a]">
                <button
                  onClick={handleRemoveBackground}
                  disabled={bgRemoveProgress !== null}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                    bgRemoveProgress !== null
                      ? 'bg-purple-900/40 border border-purple-700/50 text-purple-300 cursor-wait'
                      : 'bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 hover:border-purple-500/60 text-purple-200 hover:text-white'
                  }`}
                >
                  {bgRemoveProgress !== null ? (
                    <>
                      <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                        <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      배경 제거 중 {bgRemoveProgress}%
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 3a2 2 0 00-2 2" /><path d="M19 3a2 2 0 012 2" />
                        <path d="M21 19a2 2 0 01-2 2" /><path d="M5 21a2 2 0 01-2-2" />
                        <path d="M9 3h1" /><path d="M9 21h1" />
                        <path d="M14 3h1" /><path d="M14 21h1" />
                        <path d="M3 9v1" /><path d="M21 9v1" />
                        <path d="M3 14v1" /><path d="M21 14v1" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      배경 제거
                    </>
                  )}
                </button>
                {bgRemoveError && (
                  <p className="mt-1.5 text-[10px] text-red-400">{bgRemoveError}</p>
                )}
                {bgRemoveProgress !== null && bgRemoveProgress < 30 && (
                  <p className="mt-1.5 text-[10px] text-gray-500">
                    첫 실행 시 AI 모델 다운로드 (~40MB)
                  </p>
                )}
              </div>
              <Row label="맞춤">
                <div className="flex gap-0.5">
                  {(['fill', 'cover', 'contain'] as const).map((fit) => (
                    <button
                      key={fit}
                      onClick={() => upd({ objectFit: fit } as Partial<CanvasElement>)}
                      className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                        image.objectFit === fit
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {fit === 'fill' ? '채우기' : fit === 'cover' ? '꽉맞춤' : '맞춤'}
                    </button>
                  ))}
                </div>
              </Row>
              <Row label="블렌딩">
                <select
                  value={image.blendMode ?? DEFAULT_BLEND_MODE}
                  onChange={(e) => upd({ blendMode: e.target.value as GlobalCompositeOperation } as Partial<CanvasElement>)}
                  className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1
                             text-[10px] text-gray-300 focus:outline-none focus:border-blue-500
                             cursor-pointer"
                >
                  {BLEND_MODES.map((mode, i) => {
                    const prevGroup = i > 0 ? BLEND_MODES[i - 1].group : '';
                    const showGroup = mode.group !== prevGroup;
                    return (
                      <option
                        key={mode.value}
                        value={mode.value}
                        className={showGroup && i > 0 ? 'border-t border-gray-600' : ''}
                      >
                        {showGroup && i > 0 ? `── ${mode.group} ── ` : ''}{mode.label}
                      </option>
                    );
                  })}
                </select>
              </Row>
              <ImageCornerRadiusControl image={image} onChange={(updates) => upd(updates as Partial<CanvasElement>)} />
            </>
          )}

          {/* ── 그라데이션 마스크 (이미지 · 도형) ── */}
          {(image || shape) && (
            <GradientMaskControl element={el!} onChange={(updates) => upd(updates)} />
          )}

          {/* ── 드롭 쉐도우 (도형 · 이미지) ── */}
          {(shape || image) && (() => {
            const target = shape || image!;
            const useShadow = target.useShadow ?? false;
            const shadow = target.shadow ?? DEFAULT_BOX_SHADOW;
            const updTarget = shape ? updShape : updImage;

            return (
              <>
                <SectionTitle>드롭 쉐도우</SectionTitle>
                <div className="px-3 py-2 border-b border-[#1a1a1a]">
                  <Toggle
                    checked={useShadow}
                    onChange={(v) => {
                      const updates: Record<string, unknown> = { useShadow: v };
                      if (v && !target.shadow) updates.shadow = { ...DEFAULT_BOX_SHADOW };
                      updTarget(updates as never);
                    }}
                    label={useShadow ? '켜짐' : '꺼짐'}
                  />
                </div>
                {useShadow && (
                  <>
                    <Row label="쉐도우 색">
                      <ColorBtn
                        value={shadow.color.slice(0, 7)}
                        onChange={(v) => {
                          // 기존 alpha 유지
                          const alpha = shadow.color.length > 7 ? shadow.color.slice(7) : '66';
                          updTarget({ shadow: { ...shadow, color: v + alpha } } as never);
                        }}
                        label="쉐도우"
                      />
                      <span className="text-[10px] text-gray-500 mx-1">농도</span>
                      <Slider
                        min={0} max={100} step={1}
                        value={Math.round(parseInt(shadow.color.length > 7 ? shadow.color.slice(7) : 'ff', 16) / 255 * 100)}
                        onChange={(v) => {
                          const hex = Math.round(v / 100 * 255).toString(16).padStart(2, '0');
                          updTarget({ shadow: { ...shadow, color: shadow.color.slice(0, 7) + hex } } as never);
                        }}
                      />
                      <Val v={`${Math.round(parseInt(shadow.color.length > 7 ? shadow.color.slice(7) : 'ff', 16) / 255 * 100)}%`} />
                    </Row>
                    <Row label="X 오프셋">
                      <Slider min={-50} max={50} step={1} value={shadow.offsetX}
                        onChange={(v) => updTarget({ shadow: { ...shadow, offsetX: v } } as never)} />
                      <Val v={`${shadow.offsetX}px`} />
                    </Row>
                    <Row label="Y 오프셋">
                      <Slider min={-50} max={50} step={1} value={shadow.offsetY}
                        onChange={(v) => updTarget({ shadow: { ...shadow, offsetY: v } } as never)} />
                      <Val v={`${shadow.offsetY}px`} />
                    </Row>
                    <Row label="블러">
                      <Slider min={0} max={100} step={1} value={shadow.blur}
                        onChange={(v) => updTarget({ shadow: { ...shadow, blur: v } } as never)} />
                      <Val v={`${shadow.blur}px`} />
                    </Row>
                    <Row label="확산">
                      <Slider min={-20} max={50} step={1} value={shadow.spread}
                        onChange={(v) => updTarget({ shadow: { ...shadow, spread: v } } as never)} />
                      <Val v={`${shadow.spread}px`} />
                    </Row>
                  </>
                )}
              </>
            );
          })()}

          {/* ── 외부 광채 (도형 · 이미지) ── */}
          {(shape || image) && (() => {
            const target = shape || image!;
            const useGlow = target.useGlow ?? false;
            const glow = target.glow ?? DEFAULT_OUTER_GLOW;
            const updTarget = shape ? updShape : updImage;

            return (
              <>
                <SectionTitle>외부 광채 (Outer Glow)</SectionTitle>
                <div className="px-3 py-2 border-b border-[#1a1a1a]">
                  <Toggle
                    checked={useGlow}
                    onChange={(v) => {
                      const updates: Record<string, unknown> = { useGlow: v };
                      if (v && !target.glow) updates.glow = { ...DEFAULT_OUTER_GLOW };
                      updTarget(updates as never);
                    }}
                    label={useGlow ? '켜짐' : '꺼짐'}
                  />
                  <p className="text-[9px] text-gray-600 mt-1">
                    배경 제거된 이미지의 인물 윤곽을 따라 발광
                  </p>
                </div>
                {useGlow && (
                  <>
                    <Row label="광채 색">
                      <ColorBtn
                        value={glow.color.slice(0, 7)}
                        onChange={(v) => {
                          const alpha = glow.color.length > 7 ? glow.color.slice(7) : '99';
                          updTarget({ glow: { ...glow, color: v + alpha } } as never);
                        }}
                        label="광채"
                      />
                      <span className="text-[10px] text-gray-500 mx-1">농도</span>
                      <Slider
                        min={0} max={100} step={1}
                        value={Math.round(parseInt(glow.color.length > 7 ? glow.color.slice(7) : 'ff', 16) / 255 * 100)}
                        onChange={(v) => {
                          const hex = Math.round(v / 100 * 255).toString(16).padStart(2, '0');
                          updTarget({ glow: { ...glow, color: glow.color.slice(0, 7) + hex } } as never);
                        }}
                      />
                      <Val v={`${Math.round(parseInt(glow.color.length > 7 ? glow.color.slice(7) : 'ff', 16) / 255 * 100)}%`} />
                    </Row>
                    <Row label="블러">
                      <Slider min={1} max={80} step={1} value={glow.blur}
                        onChange={(v) => updTarget({ glow: { ...glow, blur: v } } as never)} />
                      <Val v={`${glow.blur}px`} />
                    </Row>
                    <Row label="강도">
                      <Slider min={1} max={5} step={1} value={glow.intensity}
                        onChange={(v) => updTarget({ glow: { ...glow, intensity: v } } as never)} />
                      <Val v={`${glow.intensity}x`} />
                    </Row>
                  </>
                )}
              </>
            );
          })()}

          {/* ── 이미지 테두리 ── */}
          {image && (
            <>
              <SectionTitle>테두리</SectionTitle>
              <Row label="테두리 색">
                <ColorBtn
                  value={image.stroke && image.stroke !== 'transparent' ? image.stroke : '#ffffff'}
                  onChange={(v) => updImage({ stroke: v })}
                  label="테두리"
                />
              </Row>
              <Row label="테두리 두께">
                <Slider min={0} max={20} step={0.5} value={image.strokeWidth ?? 0}
                  onChange={(v) => updImage({ strokeWidth: v })} />
                <Val v={`${image.strokeWidth ?? 0}px`} />
              </Row>
            </>
          )}

          {/* ── 이미지 블렌딩 (멀티셀렉트 2+ 이미지) ── */}
          {!el && selectedImages.length >= 2 && (
            <>
              <SectionTitle>이미지 블렌딩</SectionTitle>
              <div className="px-3 py-2 border-b border-[#1a1a1a]">
                <p className="text-[10px] text-gray-500 mb-2">
                  상위 이미지에 블렌드 모드를 적용합니다
                </p>
                <select
                  value={topImage?.blendMode ?? DEFAULT_BLEND_MODE}
                  onChange={(e) => {
                    if (!topImage || !currentSetlistId || !activeItemId || !activeSectionId) return;
                    undoManager.pushState(allElements);
                    updateElement(currentSetlistId, activeItemId, activeSectionId, topImage.id, {
                      blendMode: e.target.value as GlobalCompositeOperation,
                    });
                  }}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5
                             text-[11px] text-gray-300 focus:outline-none focus:border-blue-500
                             cursor-pointer"
                >
                  {BLEND_MODES.map((mode, i) => {
                    const prevGroup = i > 0 ? BLEND_MODES[i - 1].group : '';
                    const showGroup = mode.group !== prevGroup;
                    return (
                      <option key={mode.value} value={mode.value}>
                        {showGroup && i > 0 ? `── ${mode.group} ── ` : ''}{mode.label}
                      </option>
                    );
                  })}
                </select>
              </div>
            </>
          )}

          {/* ── 도형 색상 ── */}
          {shape && (
            <>
              <SectionTitle>채움 · 테두리</SectionTitle>
              <Row label="채움 색">
                <div className="flex items-center gap-3">
                  <ColorBtn value={shape.fill} onChange={(v) => updShape({ fill: v })} label="채움" />
                  <ColorBtn value={shape.stroke === 'transparent' ? '#ffffff' : shape.stroke} onChange={(v) => updShape({ stroke: v })} label="테두리" />
                </div>
              </Row>
              <Row label="채움 농도">
                <Slider min={0} max={1} step={0.05} value={shape.fillOpacity} onChange={(v) => updShape({ fillOpacity: v })} />
                <Val v={`${Math.round(shape.fillOpacity * 100)}%`} />
              </Row>
              <Row label="테두리 두께">
                <Slider min={0} max={20} step={0.5} value={shape.strokeWidth} onChange={(v) => updShape({ strokeWidth: v })} />
                <Val v={`${shape.strokeWidth}px`} />
              </Row>
              {(shape.shapeType === 'rect' || shape.shapeType === 'roundRect') && (
                <CornerRadiusControl shape={shape} onChange={updShape} />
              )}

              {/* ── 이미지 채우기 (피그마 스타일) ── */}
              {shape.shapeType !== 'line' && (
                <>
                  <SectionTitle>이미지 채우기</SectionTitle>
                  <div className="px-3 py-2 border-b border-[#1a1a1a]">
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => shapeFillInputRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs
                                   bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] hover:border-[#444]
                                   text-gray-400 hover:text-gray-200 transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                        {shape.imageFill ? '이미지 변경' : '이미지 넣기'}
                      </button>
                      {shape.imageFill && (
                        <button
                          onClick={() => updShape({ imageFill: undefined })}
                          className="px-2 py-1.5 rounded-md text-[10px] bg-[#1a1a1a] hover:bg-[#252525]
                                     border border-[#333] hover:border-[#444] text-gray-400 hover:text-gray-200 transition-colors"
                        >
                          제거
                        </button>
                      )}
                    </div>

                    {shape.imageFill && (
                      <>
                        <div className="flex gap-0.5 mb-2">
                          {(['fit-width', 'fit-height'] as const).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => updShape({ imageFill: { ...shape.imageFill!, mode } })}
                              className={`flex-1 px-2 py-1 text-[10px] rounded border transition-colors ${
                                shape.imageFill!.mode === mode
                                  ? 'bg-blue-600 border-blue-500 text-white'
                                  : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-500 hover:text-gray-300'
                              }`}
                            >
                              {mode === 'fit-width' ? '너비 맞춤' : '높이 맞춤'}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-10 text-[10px] text-gray-500">
                            {shape.imageFill.mode === 'fit-width' ? '상하' : '좌우'}
                          </span>
                          <Slider
                            min={0} max={1} step={0.01}
                            value={shape.imageFill.mode === 'fit-width'
                              ? shape.imageFill.offsetY
                              : shape.imageFill.offsetX}
                            onChange={(v) => {
                              const key = shape.imageFill!.mode === 'fit-width' ? 'offsetY' : 'offsetX';
                              updShape({ imageFill: { ...shape.imageFill!, [key]: v } });
                            }}
                          />
                          <Val v={`${Math.round(
                            (shape.imageFill.mode === 'fit-width'
                              ? shape.imageFill.offsetY
                              : shape.imageFill.offsetX) * 100
                          )}%`} />
                        </div>
                      </>
                    )}

                    <input
                      ref={shapeFillInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !file.type.startsWith('image/')) { e.target.value = ''; return; }
                        const dataUrl = await new Promise<string>((resolve) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(reader.result as string);
                          reader.readAsDataURL(file);
                        });
                        // 이미지 압축 (ImageImporter와 동일 로직)
                        const img = await new Promise<HTMLImageElement>((resolve) => {
                          const i = new Image();
                          i.onload = () => resolve(i);
                          i.src = dataUrl;
                        });
                        const MAX_W = 1920, MAX_H = 1080;
                        let tw = img.naturalWidth, th = img.naturalHeight;
                        if (tw > MAX_W || th > MAX_H) {
                          const s = Math.min(MAX_W / tw, MAX_H / th);
                          tw = Math.round(tw * s);
                          th = Math.round(th * s);
                        }
                        const cv = document.createElement('canvas');
                        cv.width = tw; cv.height = th;
                        cv.getContext('2d')!.drawImage(img, 0, 0, tw, th);
                        let compressed = cv.toDataURL('image/webp', 0.82);
                        if (!compressed.startsWith('data:image/webp')) {
                          compressed = cv.toDataURL('image/jpeg', 0.82);
                        }
                        undoManager.pushState(allElements);
                        updShape({ imageFill: createDefaultImageFill(compressed) });
                        e.target.value = '';
                      }}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* ── 그라데이션 ── */}
          {hasGradient && (
            <>
              <SectionTitle>그라데이션</SectionTitle>
              <div className="flex items-center gap-3 px-3 py-2 border-b border-[#1a1a1a]">
                <Toggle
                  checked={useGradient}
                  onChange={(v) => {
                    if (shape) updShape({ useGradient: v });
                    if (text)  updText({ useGradient: v });
                  }}
                  label={useGradient ? '켜짐' : '꺼짐'}
                />
                {!useGradient && (
                  <span className="text-[10px] text-gray-600">토글하면 색상 대신 그라데이션 적용</span>
                )}
              </div>

              {useGradient && (
                <GradientEditor
                  gradient={currentGradient}
                  onChange={handleGradientChange}
                />
              )}
            </>
          )}

          {/* ── 잠금 · 표시 ── */}
          <SectionTitle>기타</SectionTitle>
          <Row label="고정">
            <Toggle
              checked={el.fixedLayer === true}
              onChange={(v) => upd({ fixedLayer: v } as Partial<CanvasElement>)}
              label={el.fixedLayer ? '항상 표시' : '섹션 전용'}
            />
          </Row>
          <Row label="레이어">
            <select
              value={el.layerRole ?? getDefaultLayerRoleForElement(el)}
              onChange={(e) => setLayerRole(e.target.value as CanvasLayerRole)}
              className="flex-1 h-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2
                         text-[10px] text-gray-300 focus:outline-none focus:border-blue-500"
            >
              {CANVAS_LAYER_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Row>
          {(el.layerRole ?? getDefaultLayerRoleForElement(el)) === 'mask' && (
            <div className="px-3 py-1.5 border-b border-[#1a1a1a] text-[10px] leading-4 text-amber-300/80">
              이 요소는 최종 출력 위에서 화면을 가리는 스크린 마스크로 렌더됩니다.
            </div>
          )}
          <Row label="출력">
            <div className="flex flex-wrap gap-1">
              {CANVAS_RENDER_TARGET_OPTIONS.map((target) => {
                const enabled = getElementVisibleOn(el).includes(target.value);
                return (
                  <button
                    key={target.value}
                    type="button"
                    onClick={() => toggleRenderTarget(target.value)}
                    title={target.label}
                    className={`h-6 px-2 rounded border text-[9px] font-semibold transition-colors ${
                      enabled
                        ? 'bg-blue-600/25 border-blue-500/60 text-blue-200'
                        : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-600 hover:text-gray-300 hover:border-[#444]'
                    }`}
                  >
                    {target.shortLabel}
                  </button>
                );
              })}
            </div>
          </Row>
          <Row label="잠금">
            <Toggle checked={el.locked} onChange={(v) => upd({ locked: v })} label={el.locked ? '잠김' : '자유'} />
          </Row>
          <Row label="표시">
            <Toggle checked={el.visible} onChange={(v) => upd({ visible: v })} label={el.visible ? '보임' : '숨김'} />
          </Row>
        </>
      )}
    </div>
  );
}
