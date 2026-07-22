'use client';

/**
 * ContextToolbar — 요소 선택 시 캔버스 위에 표시되는 세부조정 바
 *
 * Canva 스타일: 선택된 요소 타입에 따라 관련 속성 컨트롤 표시
 * - 텍스트: 폰트, 크기, 굵기, 색상, 정렬
 * - 도형: 채움색, 테두리색, 테두리 두께, 모서리
 * - 이미지: object-fit
 * - 공통: 투명도, 잠금, 삭제
 */

import React from 'react';
import {
  CanvasElement, TextElement, ShapeElement,
} from '@/lib/canvasTypes';
import {
  Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  Lock, Unlock, Trash2, Copy, Minus, Plus,
} from 'lucide-react';

interface ContextToolbarProps {
  element: CanvasElement;
  onUpdate: (updates: Partial<CanvasElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

/* 미니 버튼 */
function Btn({
  active, onClick, title, children, disabled,
}: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex items-center justify-center h-7 min-w-[28px] px-1 rounded text-xs transition-colors
        ${active ? 'bg-[#7c3aed]/15 text-[#7c3aed]' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'}
        ${disabled ? 'opacity-30 pointer-events-none' : ''}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5" />;
}

function ColorDot({ color, onChange, title }: { color: string; onChange: (c: string) => void; title: string }) {
  return (
    <label className="cursor-pointer group" title={title}>
      <span
        className="flex w-6 h-6 rounded border border-gray-300 group-hover:scale-110 transition-transform"
        style={{ background: color }}
      />
      <input type="color" value={color} onChange={(e) => onChange(e.target.value)} className="sr-only" />
    </label>
  );
}

export default function ContextToolbar({ element, onUpdate, onDelete, onDuplicate }: ContextToolbarProps) {
  const isText = element.type === 'text';
  const isShape = element.type === 'shape';
  const text = isText ? (element as TextElement) : null;
  const shape = isShape ? (element as ShapeElement) : null;

  return (
    <div
      className="flex items-center gap-0.5 h-9 px-2 bg-white border border-gray-200 rounded-lg shadow-md select-none"
      style={{ pointerEvents: 'all' }}
    >
      {/* ── 텍스트 전용 ── */}
      {text && (
        <>
          {/* 폰트 크기 */}
          <Btn onClick={() => onUpdate({ fontSize: Math.max(8, text.fontSize - 2) } as any)} title="크기 줄이기">
            <Minus size={12} />
          </Btn>
          <span className="w-7 text-center text-xs font-medium text-gray-700 tabular-nums">{text.fontSize}</span>
          <Btn onClick={() => onUpdate({ fontSize: Math.min(200, text.fontSize + 2) } as any)} title="크기 키우기">
            <Plus size={12} />
          </Btn>

          <Divider />

          {/* 굵기/기울기 */}
          <Btn
            active={text.fontWeight === 'bold'}
            onClick={() => onUpdate({ fontWeight: text.fontWeight === 'bold' ? 'normal' : 'bold' } as any)}
            title="굵게"
          >
            <Bold size={14} />
          </Btn>
          <Btn
            active={text.fontStyle === 'italic'}
            onClick={() => onUpdate({ fontStyle: text.fontStyle === 'italic' ? 'normal' : 'italic' } as any)}
            title="기울임"
          >
            <Italic size={14} />
          </Btn>

          <Divider />

          {/* 텍스트 정렬 */}
          <Btn active={text.textAlign === 'left'} onClick={() => onUpdate({ textAlign: 'left' } as any)} title="좌측 정렬">
            <AlignLeft size={14} />
          </Btn>
          <Btn active={text.textAlign === 'center'} onClick={() => onUpdate({ textAlign: 'center' } as any)} title="가운데 정렬">
            <AlignCenter size={14} />
          </Btn>
          <Btn active={text.textAlign === 'right'} onClick={() => onUpdate({ textAlign: 'right' } as any)} title="우측 정렬">
            <AlignRight size={14} />
          </Btn>

          <Divider />

          {/* 텍스트 색상 */}
          <ColorDot color={text.color} onChange={(c) => onUpdate({ color: c } as any)} title="텍스트 색상" />
        </>
      )}

      {/* ── 도형 전용 ── */}
      {shape && (
        <>
          <ColorDot color={shape.fill} onChange={(c) => onUpdate({ fill: c } as any)} title="채움 색상" />
          <ColorDot
            color={shape.stroke === 'transparent' ? '#ffffff' : shape.stroke}
            onChange={(c) => onUpdate({ stroke: c } as any)}
            title="테두리 색상"
          />

          <Divider />

          {/* 테두리 두께 */}
          <Btn onClick={() => onUpdate({ strokeWidth: Math.max(0, shape.strokeWidth - 1) } as any)} title="테두리 얇게">
            <Minus size={12} />
          </Btn>
          <span className="w-5 text-center text-[10px] text-gray-500 tabular-nums">{shape.strokeWidth}</span>
          <Btn onClick={() => onUpdate({ strokeWidth: Math.min(20, shape.strokeWidth + 1) } as any)} title="테두리 두껍게">
            <Plus size={12} />
          </Btn>
        </>
      )}

      <Divider />

      {/* ── 공통 ── */}
      {/* 투명도 */}
      <input
        type="range"
        min={0} max={1} step={0.05}
        value={element.opacity}
        onChange={(e) => onUpdate({ opacity: Number(e.target.value) })}
        className="w-14 h-[3px] accent-[#7c3aed] cursor-pointer"
        title={`투명도 ${Math.round(element.opacity * 100)}%`}
      />
      <span className="w-7 text-[10px] text-gray-500 text-right tabular-nums">
        {Math.round(element.opacity * 100)}%
      </span>

      <Divider />

      {/* 잠금 */}
      <Btn
        active={element.locked}
        onClick={() => onUpdate({ locked: !element.locked })}
        title={element.locked ? '잠금 해제' : '잠금'}
      >
        {element.locked ? <Lock size={14} /> : <Unlock size={14} />}
      </Btn>

      {/* 복제 */}
      <Btn onClick={onDuplicate} title="복제">
        <Copy size={14} />
      </Btn>

      {/* 삭제 */}
      <Btn onClick={onDelete} title="삭제">
        <Trash2 size={14} className="text-red-400" />
      </Btn>
    </div>
  );
}
