'use client';

// [FEATURE: TEXT_RUNS] 텍스트 박스 안에서 선택한 구간에만 디자인을 주는 패널

/**
 * 신형(ElementInspector)·구형(ElementPanel) 속성창 **양쪽**에서 쓴다.
 * 두 패널의 내부 컨트롤(Row/Section 등)이 서로 달라서, 여기서는 어디에 붙여도
 * 같게 보이도록 자체 마크업만 쓴다.
 *
 * 선택 범위는 `lib/textSelectionStore` 에서 받는다 — 스타일 버튼을 누르는 순간
 * textarea 가 blur 되며 편집기가 닫히므로, 마지막 선택을 남겨두지 않으면 적용할
 * 대상이 사라진다.
 *
 * 기획: docs/features/text-runs/PLAN.md
 */

import { useSyncExternalStore } from 'react';
import type { TextElement, TextRunStyle } from '@/lib/canvasTypes';
import { applyRunStyle, clearRunsInRange } from '@/lib/textRuns';
import { getTextSelectionFor, subscribeTextSelection } from '@/lib/textSelectionStore';
import {
  KOREAN_CDN_FONT_FAMILIES, KOREAN_WEB_FONTS, fontDisplayName,
} from '@/lib/webFonts';

const FONT_OPTIONS: string[] = [
  ...KOREAN_CDN_FONT_FAMILIES,
  ...KOREAN_WEB_FONTS,
  'sans-serif', 'serif', 'monospace',
];

const GENERIC_LABELS: Record<string, string> = {
  'sans-serif': '시스템 고딕', 'serif': '시스템 명조', 'monospace': '시스템 모노',
};

const BTN =
  'h-6 flex-1 rounded border border-[#2c2c2c] bg-[#1a1a1a] text-[10px] text-gray-300 ' +
  'transition-colors hover:bg-[#292929] hover:text-white';

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="w-11 flex-shrink-0 text-[10px] text-gray-500">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
    </div>
  );
}

export default function TextRunStylePanel({
  el,
  upd,
}: {
  el: TextElement;
  upd: (patch: Partial<TextElement>) => void;
}) {
  const selection = useSyncExternalStore(
    subscribeTextSelection,
    () => getTextSelectionFor(el.id),
    () => null,
  );

  const apply = (style: TextRunStyle) => {
    if (!selection) return;
    upd({ runs: applyRunStyle(el.runs, selection.start, selection.end, style) });
  };

  const runCount = el.runs?.length ?? 0;

  if (!selection) {
    return (
      <div className="border-t border-[#1a1a1a] px-3 py-2">
        <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-gray-600">
          선택 구간 디자인
        </p>
        <p className="text-[10px] leading-4 text-gray-600">
          텍스트를 <b className="text-gray-400">더블클릭</b>해 편집 상태로 들어간 뒤,
          <br />
          디자인할 단어를 <b className="text-gray-400">드래그로 선택</b>하세요.
          {runCount > 0 && (
            <>
              <br />
              <span className="text-gray-500">현재 {runCount}개 구간 적용됨</span>
            </>
          )}
        </p>
      </div>
    );
  }

  const picked = el.content.slice(selection.start, selection.end);

  return (
    <div className="border-t border-[#1a1a1a] px-3 py-2">
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-gray-600">
        선택 구간 디자인
      </p>
      <p className="mb-2 truncate px-1 text-[10px] text-gray-400">
        선택: <span className="text-blue-300">“{picked}”</span>
      </p>

      <div className="flex flex-col gap-1.5">
        <Line label="색상">
          <input
            type="color"
            defaultValue={el.color}
            onChange={(e) => apply({ color: e.target.value })}
            className="h-6 w-10 cursor-pointer rounded border border-[#2c2c2c] bg-transparent"
          />
          <span className="text-[9px] text-gray-600">선택 구간에만 적용</span>
        </Line>

        <Line label="폰트">
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) apply({ fontFamily: e.target.value }); }}
            className="h-6 w-full rounded border border-[#2c2c2c] bg-[#1a1a1a] px-1 text-[10px] text-gray-300"
          >
            <option value="">(요소 기본: {fontDisplayName(el.fontFamily)})</option>
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>{GENERIC_LABELS[f] ?? fontDisplayName(f)}</option>
            ))}
          </select>
        </Line>

        <Line label="크기">
          <input
            type="number"
            min={10}
            max={400}
            step={5}
            placeholder={`${Math.round(el.fontSize)}`}
            onChange={(e) => {
              const px = Number(e.target.value);
              if (!Number.isFinite(px) || px <= 0 || el.fontSize <= 0) return;
              // 배수로 저장한다 — autoFit 이 박스에 맞춰 축소할 때 같이 줄어야 하므로.
              apply({ fontSizeScale: px / el.fontSize });
            }}
            className="h-6 w-14 rounded border border-[#2c2c2c] bg-[#1a1a1a] px-1 text-[10px] text-gray-300"
          />
          <span className="text-[9px] text-gray-600">px</span>
          {[0.8, 1, 1.3].map((v) => (
            <button key={v} type="button" onClick={() => apply({ fontSizeScale: v })} className={BTN}>
              {v === 1 ? '기본' : `${v}×`}
            </button>
          ))}
        </Line>

        <Line label="굵기">
          {[400, 700, 900].map((w) => (
            <button key={w} type="button" onClick={() => apply({ fontWeight: w })} className={BTN}>
              {w}
            </button>
          ))}
        </Line>

        <Line label="기울임">
          <button type="button" onClick={() => apply({ fontStyle: 'italic' })} className={`${BTN} italic`}>
            기울임
          </button>
          <button type="button" onClick={() => apply({ fontStyle: 'normal' })} className={BTN}>
            곧게
          </button>
        </Line>

        <button
          type="button"
          onClick={() => upd({ runs: clearRunsInRange(el.runs, selection.start, selection.end) })}
          className="mt-0.5 h-7 rounded border border-[#3a2020] bg-[#1a1a1a] text-[10px] text-red-300 hover:bg-red-600/20"
        >
          이 구간 디자인 지우기
        </button>
      </div>
    </div>
  );
}
