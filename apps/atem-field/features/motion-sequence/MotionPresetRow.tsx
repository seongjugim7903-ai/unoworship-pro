'use client';

// 모션 프리셋 버튼 행 — 선택 요소에 시작값 원클릭 적용

import { CanvasElement, MotionConfig } from '@/lib/canvasTypes';
import { MOTION_PRESETS } from './motionPresets';

interface MotionPresetRowProps {
  element: CanvasElement;
  onApply: (updates: Partial<MotionConfig>) => void;
}

export default function MotionPresetRow({ element, onApply }: MotionPresetRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold text-purple-300">프리셋</p>
      <div className="grid grid-cols-4 gap-1">
        {MOTION_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onApply(preset.apply(element))}
            title={`${preset.label} 시작값을 적용 (타이밍·시퀀스는 유지)`}
            className="px-1 py-1.5 rounded text-[10px] bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400
                       hover:border-purple-500/60 hover:text-purple-300 transition-colors truncate"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
