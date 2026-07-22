'use client';

// 신형 요소 속성창 — 도형/텍스트/이미지 통합 인스펙터 (선택 요소의 모든 편집 가능 속성)

/**
 * [FEATURE: INSPECTOR_V2]
 * - 기존 ElementPanel/TextPanel은 무변경 — BottomPanels 토글로 신/구형 전환 (README 참조).
 * - 데이터 흐름은 기존과 동일: undoManager.pushState → updateElement(...). 소켓 송출 없음.
 * - 모션(motion)은 모션 시퀀스 모듈 소관이라 여기서 다루지 않는다.
 */

import { useRef } from 'react';
import { useStore } from '@/lib/store';
import { undoManager } from '@/lib/undoManager';
import {
  createImageElement, createShapeElement, createTextElement,
  type CanvasElement, type CanvasRenderTarget, type ImageElement,
  type ShapeElement, type ShapeType, type TextElement,
} from '@/lib/canvasTypes';
import { ColorIn, Num, Row, Section, Seg, Sel, Toggle } from './controls';
import {
  getFontWeights, nearestFontWeight, normalizeFontWeight, FONT_WEIGHT_LABELS,
  KOREAN_WEB_FONTS, KOREAN_CDN_FONT_FAMILIES, fontDisplayName,
} from '@/lib/webFonts';

// 인기 CDN 폰트 → 구글 한글 웹폰트(카테고리 순) → 시스템 제네릭
const FONT_OPTIONS: string[] = [
  ...KOREAN_CDN_FONT_FAMILIES,
  ...KOREAN_WEB_FONTS,
  'sans-serif', 'serif', 'monospace',
];

const GENERIC_FONT_LABELS: Record<string, string> = {
  'sans-serif': '시스템 고딕', 'serif': '시스템 명조', 'monospace': '시스템 모노',
};

/** 셀렉터 표시명 — 제네릭은 한글 라벨, 그 외는 폰트 고유 한글명(없으면 원래 이름) */
function fontLabel(f: string): string {
  return GENERIC_FONT_LABELS[f] ?? fontDisplayName(f);
}

const OUTPUT_TARGETS: { v: CanvasRenderTarget; label: string }[] = [
  { v: 'output', label: '메인(회중)' },
  { v: 'prompt', label: '무대' },
  { v: 'broadcast', label: '방송' },
];

const BLEND_MODES: { v: GlobalCompositeOperation; label: string }[] = [
  { v: 'source-over', label: '보통' },
  { v: 'multiply', label: '곱하기' },
  { v: 'screen', label: '스크린' },
  { v: 'overlay', label: '오버레이' },
  { v: 'lighter', label: '밝게 더하기' },
  { v: 'difference', label: '차이' },
];

export default function ElementInspector({ onSwitchLegacy }: { onSwitchLegacy?: () => void }) {
  const {
    currentSetlistId, activeItemId, activeSectionId,
    selectedElementId, setlists, updateElement, addElement, removeElement, setSelectedElement,
  } = useStore();

  const setlist = setlists.find((sl) => sl.id === currentSetlistId);
  const item = setlist?.items.find((it) => it.id === activeItemId);
  const section = item?.sections.find((sec) => sec.id === activeSectionId);
  const el = section?.elements?.find((e) => e.id === selectedElementId);
  const allElements = section?.elements ?? [];
  const isReady = !!(currentSetlistId && activeItemId && activeSectionId);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function upd(updates: Partial<CanvasElement>) {
    if (!el) return;
    undoManager.pushState(allElements);
    updateElement(currentSetlistId!, activeItemId!, activeSectionId!, el.id, updates);
  }

  // ── 요소 추가 (기존 ElementPanel과 동일 팩토리) ──
  function handleAdd(kind: 'text' | 'image' | ShapeType) {
    if (!isReady) return;
    const count = allElements.length;
    if (kind === 'text') {
      const newEl = createTextElement({ zIndex: count, linked: false, content: '여기에 텍스트 입력' });
      addElement(currentSetlistId!, activeItemId!, activeSectionId!, newEl);
      setSelectedElement(newEl.id);
    } else if (kind === 'image') {
      imageInputRef.current?.click();
    } else {
      // 라인은 색 없으면 안 보이므로 흰색·2px를 기본으로 부여
      const newEl = createShapeElement(
        kind === 'line'
          ? { shapeType: kind, zIndex: count, stroke: '#ffffff', strokeWidth: 2 }
          : { shapeType: kind, zIndex: count },
      );
      addElement(currentSetlistId!, activeItemId!, activeSectionId!, newEl);
      setSelectedElement(newEl.id);
    }
  }

  // 이미지 파일 → 압축 → 요소 추가 (ElementPanel의 검증된 플로우와 동일)
  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/') || !isReady) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
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
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      let compressed = cv.toDataURL('image/webp', 0.82);
      if (!compressed.startsWith('data:image/webp')) {
        compressed = cv.toDataURL('image/jpeg', 0.82);
      }
      const aspectRatio = w / h;
      let elW = 40, elH = 40;
      if (aspectRatio > 1) { elH = (elW / aspectRatio) * (16 / 9); }
      else { elW = elH * aspectRatio * (9 / 16); }
      const newEl = createImageElement({
        zIndex: allElements.length,
        src: compressed,
        width: Math.min(80, elW),
        height: Math.min(80, elH),
        x: 10, y: 10,
      });
      addElement(currentSetlistId!, activeItemId!, activeSectionId!, newEl);
      setSelectedElement(newEl.id);
    };
    reader.readAsDataURL(file);
  }

  const addBar = (
    <div className="flex flex-shrink-0 items-center gap-1 border-b border-[#1a1a1a] px-3 py-1.5">
      <span className="text-[9px] text-gray-600 mr-1">추가</span>
      {([
        { k: 'text' as const, label: 'T', tip: '텍스트' },
        { k: 'rect' as const, label: '▭', tip: '사각형' },
        { k: 'roundRect' as const, label: '▢', tip: '둥근 사각' },
        { k: 'ellipse' as const, label: '◯', tip: '원' },
        { k: 'line' as const, label: '―', tip: '선' },
        { k: 'image' as const, label: '🖼', tip: '이미지' },
      ]).map((b) => (
        <button
          key={b.k}
          title={b.tip}
          onClick={() => handleAdd(b.k)}
          disabled={!isReady}
          className="h-6 w-7 rounded border border-[#2a2a2a] bg-[#111] text-[11px] text-gray-300 hover:border-blue-500 disabled:opacity-40"
        >
          {b.label}
        </button>
      ))}
      <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageFile} className="hidden" />
    </div>
  );

  if (!el) {
    return (
      <div className="flex h-full flex-col">
        <Header onSwitchLegacy={onSwitchLegacy} title="속성 (신형)" />
        {addBar}
        <div className="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-gray-600">
          위 버튼으로 요소를 추가하거나<br />캔버스에서 요소를 선택하세요
        </div>
      </div>
    );
  }

  const typeLabel = el.type === 'text' ? '텍스트' : el.type === 'shape' ? '도형' : el.type === 'image' ? '이미지' : el.type;

  return (
    <div className="flex h-full flex-col overflow-y-auto text-white">
      <Header onSwitchLegacy={onSwitchLegacy} title={`${typeLabel} 속성`}>
        <Toggle label="잠금" checked={el.locked} onChange={(v) => upd({ locked: v })} />
        <Toggle label="표시" checked={el.visible} onChange={(v) => upd({ visible: v })} />
        <button
          onClick={() => {
            undoManager.pushState(allElements);
            removeElement(currentSetlistId!, activeItemId!, activeSectionId!, el.id);
            setSelectedElement(null);
          }}
          title="선택 요소 삭제"
          className="rounded border border-red-900 px-1.5 py-0.5 text-[9px] text-red-400 hover:bg-red-950"
        >
          삭제
        </button>
      </Header>
      {addBar}

      {/* ── 배치 (Transform) ── */}
      <Section title="배치">
        <div className="grid grid-cols-2 gap-1.5">
          <Row label="X"><Num value={el.x} onChange={(v) => upd({ x: v })} suffix="%" step={0.5} /></Row>
          <Row label="Y"><Num value={el.y} onChange={(v) => upd({ y: v })} suffix="%" step={0.5} /></Row>
          <Row label="너비"><Num value={el.width} onChange={(v) => upd({ width: v })} suffix="%" step={0.5} min={0.5} /></Row>
          <Row label="높이"><Num value={el.height} onChange={(v) => upd({ height: v })} suffix="%" step={0.5} min={0.5} /></Row>
        </div>
        <Row label="회전"><Num value={el.rotation} onChange={(v) => upd({ rotation: v })} suffix="°" /></Row>
        <Row label="불투명도">
          <input
            type="range" min={0} max={1} step={0.01} value={el.opacity}
            onChange={(e) => upd({ opacity: parseFloat(e.target.value) })}
            className="flex-1 accent-blue-600"
          />
          <span className="w-8 text-right text-[10px] text-gray-400">{Math.round(el.opacity * 100)}%</span>
        </Row>
        <Row label="순서">
          <button onClick={() => upd({ zIndex: el.zIndex + 1 })} className="flex-1 h-6 rounded border border-[#2a2a2a] bg-[#111] text-[10px] text-gray-300 hover:border-blue-500">앞으로</button>
          <button onClick={() => upd({ zIndex: Math.max(0, el.zIndex - 1) })} className="flex-1 h-6 rounded border border-[#2a2a2a] bg-[#111] text-[10px] text-gray-300 hover:border-blue-500">뒤로</button>
          <span className="w-6 text-center text-[10px] text-gray-500">{el.zIndex}</span>
        </Row>
      </Section>

      {/* ── 타입별 섹션 ── */}
      {el.type === 'text' && <TextSection el={el as TextElement} upd={upd} />}
      {el.type === 'shape' && <ShapeSection el={el as ShapeElement} upd={upd} />}
      {el.type === 'image' && <ImageSection el={el as ImageElement} upd={upd} />}

      {/* ── 효과 (도형·이미지) ── */}
      {(el.type === 'shape' || el.type === 'image') && (
        <EffectsSection el={el as ShapeElement | ImageElement} upd={upd} />
      )}

      {/* ── 출력 라우팅 (듀얼아웃) ── */}
      <Section title="출력 라우팅">
        <div className="flex flex-col gap-1">
          {OUTPUT_TARGETS.map((t) => {
            const list = el.visibleOn && el.visibleOn.length > 0
              ? el.visibleOn
              : OUTPUT_TARGETS.map((o) => o.v); // 미설정 = 전체 표시 (기존 호환)
            const checked = list.includes(t.v);
            return (
              <Toggle
                key={t.v}
                label={t.label}
                checked={checked}
                onChange={(v) => {
                  const next = v ? [...new Set([...list, t.v])] : list.filter((x) => x !== t.v);
                  upd({ visibleOn: next });
                }}
              />
            );
          })}
        </div>
        <Toggle
          label="고정 레이어 (섹션 바뀌어도 유지)"
          checked={el.fixedLayer ?? false}
          onChange={(v) => upd({ fixedLayer: v })}
        />
      </Section>
    </div>
  );
}

/* ── 헤더 ── */
function Header({ title, children, onSwitchLegacy }: {
  title: string; children?: React.ReactNode; onSwitchLegacy?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[#1a1a1a] bg-[#0d0d0d] px-3 py-1.5">
      <span className="text-[10px] font-bold text-gray-300">{title}</span>
      <div className="flex items-center gap-2">
        {children}
        {onSwitchLegacy && (
          <button
            onClick={onSwitchLegacy}
            className="rounded border border-[#2a2a2a] px-1.5 py-0.5 text-[9px] text-gray-500 hover:text-gray-300"
            title="기존 요소/텍스트 설정 패널로 전환"
          >
            구형으로
          </button>
        )}
      </div>
    </div>
  );
}

/* ── 텍스트 ── */
function TextSection({ el, upd }: { el: TextElement; upd: (u: Partial<CanvasElement>) => void }) {
  const weights = getFontWeights(el.fontFamily);
  const curW = normalizeFontWeight(el.fontWeight);
  return (
    <>
      <Section title="내용">
        <textarea
          value={el.content}
          onChange={(e) => upd({ content: e.target.value })}
          rows={3}
          className="w-full resize-y rounded border border-[#2a2a2a] bg-[#111] px-2 py-1.5 text-[12px] text-gray-200 outline-none focus:border-blue-500"
        />
      </Section>
      <Section title="타이포그래피">
        <Row label="글꼴">
          <Sel
            value={FONT_OPTIONS.includes(el.fontFamily) ? el.fontFamily : FONT_OPTIONS[0]}
            options={FONT_OPTIONS.map((f) => ({ v: f, label: fontLabel(f) }))}
            onChange={(v) => upd({ fontFamily: v, fontWeight: nearestFontWeight(v, curW) })}
          />
        </Row>
        <Row label="크기">
          <Num value={el.fontSize} onChange={(v) => upd({ fontSize: v })} suffix="px" min={8} w="w-20" />
          <button
            onClick={() => upd({ fontStyle: el.fontStyle === 'italic' ? 'normal' : 'italic' })}
            className={`h-6 w-7 rounded border text-[11px] italic ${el.fontStyle === 'italic' ? 'border-blue-500 bg-blue-600 text-white' : 'border-[#2a2a2a] bg-[#111] text-gray-400'}`}
          >I</button>
        </Row>
        <Row label="두께">
          {weights.length > 1 ? (
            <Sel
              value={String(curW)}
              options={weights.map((w) => ({ v: String(w), label: `${FONT_WEIGHT_LABELS[w] ?? ''} ${w}`.trim() }))}
              onChange={(v) => upd({ fontWeight: Number(v) })}
            />
          ) : (
            <span className="flex-1 text-[10px] text-gray-600">이 폰트는 두께가 하나예요 ({curW})</span>
          )}
        </Row>
        <Row label="가로 정렬">
          <Seg value={el.textAlign} onChange={(v) => upd({ textAlign: v })} options={[
            { v: 'left', label: '좌' }, { v: 'center', label: '중' }, { v: 'right', label: '우' },
          ]} />
        </Row>
        <Row label="세로 정렬">
          <Seg value={el.verticalAlign} onChange={(v) => upd({ verticalAlign: v })} options={[
            { v: 'top', label: '상' }, { v: 'middle', label: '중' }, { v: 'bottom', label: '하' },
          ]} />
        </Row>
        <Row label="행간"><Num value={el.lineHeight} onChange={(v) => upd({ lineHeight: v })} step={0.05} min={0.5} w="w-20" /></Row>
        <Row label="자간"><Num value={el.letterSpacing} onChange={(v) => upd({ letterSpacing: v })} suffix="px" step={0.5} w="w-20" /></Row>
        <Toggle label="자동 맞춤 (박스 넘치면 폰트 축소)" checked={el.autoFit ?? false} onChange={(v) => upd({ autoFit: v })} />
      </Section>
      <Section title="색상">
        <Row label="글자색"><ColorIn value={el.color} onChange={(v) => upd({ color: v })} /></Row>
        <Row label="외곽선"><ColorIn value={el.strokeColor} onChange={(v) => upd({ strokeColor: v })} /></Row>
        <Row label="선 두께"><Num value={el.strokeWidth} onChange={(v) => upd({ strokeWidth: v })} suffix="px" min={0} w="w-20" /></Row>
      </Section>
    </>
  );
}

/* 그라디언트 색: #RRGGBBAA ↔ (RGB 6자리, 알파 0~1) 분리·결합 — 캔버스 addColorStop이 8자리 hex를 그대로 처리 */
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
function splitColor(c: string): { rgb: string; alpha: number } {
  const m8 = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(c);
  if (m8) return { rgb: '#' + m8[1], alpha: parseInt(m8[2], 16) / 255 };
  return { rgb: /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#ffffff', alpha: 1 };
}
function joinColor(rgb: string, alpha: number): string {
  const a = Math.round(clamp01(alpha) * 255).toString(16).padStart(2, '0');
  return `${rgb}${a}`;
}

/* ── 도형 ── */
function ShapeSection({ el, upd }: { el: ShapeElement; upd: (u: Partial<CanvasElement>) => void }) {
  const g = el.gradient;
  const s0 = g?.stops[0] ?? { offset: 0, color: '#ffffff' };
  const s1 = g?.stops[g.stops.length - 1] ?? { offset: 1, color: '#000000' };
  const c0 = splitColor(s0.color);
  const c1 = splitColor(s1.color);
  const mid = clamp01((s0.offset + s1.offset) / 2);  // 분포 바 표시값 = 양쪽 offset의 중심
  const HALF_BAND = 0.2;                              // 전환 구간 절반폭(고정) — 분포 이동 시 적용

  const write = (o0: number, col0: string, o1: number, col1: string, angle?: number) =>
    upd({ gradient: { type: g?.type ?? 'linear', angle: angle ?? g?.angle ?? 90,
      stops: [{ offset: clamp01(o0), color: col0 }, { offset: clamp01(o1), color: col1 }] } });

  // 색만 변경(알파 유지)
  const setRgb = (which: 0 | 1, rgb: string) =>
    which === 0
      ? write(s0.offset, joinColor(rgb, c0.alpha), s1.offset, s1.color)
      : write(s0.offset, s0.color, s1.offset, joinColor(rgb, c1.alpha));
  // 투명 토글: 이 색의 알파를 0 ↔ 1
  const toggleClear = (which: 0 | 1) =>
    which === 0
      ? write(s0.offset, joinColor(c0.rgb, c0.alpha === 0 ? 1 : 0), s1.offset, s1.color)
      : write(s0.offset, s0.color, s1.offset, joinColor(c1.rgb, c1.alpha === 0 ? 1 : 0));
  // 가운데 바: 양쪽 색의 분포(전환 중심)를 이동 — 중심 기준 고정폭 전환 구간
  const setDistribution = (v: number) =>
    write(v - HALF_BAND, s0.color, v + HALF_BAND, s1.color);

  return (
    <>
      <Section title="도형">
        <Row label="모양">
          <Seg value={el.shapeType} onChange={(v) => upd({ shapeType: v })} options={[
            { v: 'rect', label: '사각' }, { v: 'roundRect', label: '둥근' },
            { v: 'ellipse', label: '원' }, { v: 'line', label: '선' },
          ]} />
        </Row>
        {(el.shapeType === 'roundRect' || el.shapeType === 'rect') && (
          <Row label="코너"><Num value={el.cornerRadius} onChange={(v) => upd({ cornerRadius: v })} suffix="px" min={0} w="w-20" /></Row>
        )}
      </Section>
      {el.shapeType === 'line' ? (
        <Section title="선">
          <Row label="색상"><ColorIn value={el.stroke} onChange={(v) => upd({ stroke: v })} /></Row>
          <Row label="두께"><Num value={el.strokeWidth} onChange={(v) => upd({ strokeWidth: v })} suffix="px" min={0.5} step={0.5} w="w-20" /></Row>
        </Section>
      ) : (
      <>
      <Section title="채우기">
        <Row label="색"><ColorIn value={el.fill} onChange={(v) => upd({ fill: v })} /></Row>
        <Row label="채움 불투명도">
          <input type="range" min={0} max={1} step={0.01} value={el.fillOpacity}
            onChange={(e) => upd({ fillOpacity: parseFloat(e.target.value) })} className="flex-1 accent-blue-600" />
          <span className="w-8 text-right text-[10px] text-gray-400">{Math.round(el.fillOpacity * 100)}%</span>
        </Row>
        <Toggle label="그라디언트 사용" checked={el.useGradient} onChange={(v) => upd({ useGradient: v })} />
        {el.useGradient && (
          <>
            <Row label="시작색">
              <ColorIn value={c0.rgb} onChange={(v) => setRgb(0, v)} />
              <button onClick={() => toggleClear(0)} title="이 색을 투명으로"
                className={`h-6 flex-shrink-0 rounded border px-1.5 text-[10px] ${c0.alpha === 0 ? 'border-blue-500 bg-blue-600 text-white' : 'border-[#2a2a2a] bg-[#111] text-gray-400'}`}
              >투명</button>
            </Row>
            <Row label="끝색">
              <ColorIn value={c1.rgb} onChange={(v) => setRgb(1, v)} />
              <button onClick={() => toggleClear(1)} title="이 색을 투명으로"
                className={`h-6 flex-shrink-0 rounded border px-1.5 text-[10px] ${c1.alpha === 0 ? 'border-blue-500 bg-blue-600 text-white' : 'border-[#2a2a2a] bg-[#111] text-gray-400'}`}
              >투명</button>
            </Row>
            <Row label="분포">
              <input type="range" min={0} max={1} step={0.01} value={mid}
                onChange={(e) => setDistribution(parseFloat(e.target.value))} className="flex-1 accent-blue-600" />
              <span className="w-8 text-right text-[10px] text-gray-400">{Math.round(mid * 100)}%</span>
            </Row>
            <Row label="각도"><Num value={g?.angle ?? 90} onChange={(v) => write(s0.offset, s0.color, s1.offset, s1.color, v)} suffix="°" w="w-20" /></Row>
          </>
        )}
      </Section>
      <Section title="테두리">
        <Row label="색"><ColorIn value={el.stroke} onChange={(v) => upd({ stroke: v })} /></Row>
        <Row label="두께"><Num value={el.strokeWidth} onChange={(v) => upd({ strokeWidth: v })} suffix="px" min={0} w="w-20" /></Row>
      </Section>
      </>
      )}
    </>
  );
}

/* ── 이미지 ── */
function ImageSection({ el, upd }: { el: ImageElement; upd: (u: Partial<CanvasElement>) => void }) {
  // 좌표·크기는 캔버스 대비 % — 화면 꽉 채우기는 (0,0,100,100)
  const fillBtn = 'flex-1 h-6 rounded border border-[#2a2a2a] bg-[#111] text-[10px] text-gray-300 hover:border-blue-500';
  return (
    <Section title="이미지">
      <Row label="꽉 채우기">
        <button title="화면 전체에 맞춤 (X·Y 0, 너비·높이 100%)" onClick={() => upd({ x: 0, y: 0, width: 100, height: 100 })} className={fillBtn}>화면</button>
        <button title="가로만 꽉 채움 (X 0, 너비 100%)" onClick={() => upd({ x: 0, width: 100 })} className={fillBtn}>너비</button>
        <button title="세로만 꽉 채움 (Y 0, 높이 100%)" onClick={() => upd({ y: 0, height: 100 })} className={fillBtn}>높이</button>
      </Row>
      <Row label="맞춤">
        <Seg value={el.objectFit} onChange={(v) => upd({ objectFit: v })} options={[
          { v: 'cover', label: '채움' }, { v: 'contain', label: '맞춤' }, { v: 'fill', label: '늘림' },
        ]} />
      </Row>
      <Row label="블렌드">
        <Sel
          value={(el.blendMode ?? 'source-over') as GlobalCompositeOperation}
          options={BLEND_MODES}
          onChange={(v) => upd({ blendMode: v })}
        />
      </Row>
      <Row label="코너"><Num value={el.cornerRadius ?? 0} onChange={(v) => upd({ cornerRadius: v })} suffix="px" min={0} w="w-20" /></Row>
      <Row label="테두리"><ColorIn value={el.stroke ?? '#000000'} onChange={(v) => upd({ stroke: v })} /></Row>
      <Row label="선 두께"><Num value={el.strokeWidth ?? 0} onChange={(v) => upd({ strokeWidth: v })} suffix="px" min={0} w="w-20" /></Row>
      <Toggle
        label="루마 키 추출 (어두운 글자→흰색 키)"
        checked={el.keyMode === 'luma-invert'}
        onChange={(v) => upd({ keyMode: v ? 'luma-invert' : 'none' })}
      />
    </Section>
  );
}

/* ── 효과 (도형·이미지 공통) ── */
function EffectsSection({ el, upd }: { el: ShapeElement | ImageElement; upd: (u: Partial<CanvasElement>) => void }) {
  const shadow = el.shadow ?? { color: '#00000080', offsetX: 4, offsetY: 4, blur: 12, spread: 0 };
  const glow = el.glow ?? { color: '#ffffff', blur: 20, intensity: 2 };
  return (
    <Section title="효과" defaultOpen={false}>
      <Toggle label="그림자" checked={el.useShadow ?? false} onChange={(v) => upd({ useShadow: v, shadow })} />
      {el.useShadow && (
        <>
          <Row label="색"><ColorIn value={shadow.color} onChange={(v) => upd({ shadow: { ...shadow, color: v } })} /></Row>
          <div className="grid grid-cols-2 gap-1.5">
            <Row label="X"><Num value={shadow.offsetX} onChange={(v) => upd({ shadow: { ...shadow, offsetX: v } })} suffix="px" /></Row>
            <Row label="Y"><Num value={shadow.offsetY} onChange={(v) => upd({ shadow: { ...shadow, offsetY: v } })} suffix="px" /></Row>
          </div>
          <Row label="번짐"><Num value={shadow.blur} onChange={(v) => upd({ shadow: { ...shadow, blur: v } })} suffix="px" min={0} w="w-20" /></Row>
        </>
      )}
      <Toggle label="외부 광채" checked={el.useGlow ?? false} onChange={(v) => upd({ useGlow: v, glow })} />
      {el.useGlow && (
        <>
          <Row label="색"><ColorIn value={glow.color} onChange={(v) => upd({ glow: { ...glow, color: v } })} /></Row>
          <Row label="번짐"><Num value={glow.blur} onChange={(v) => upd({ glow: { ...glow, blur: v } })} suffix="px" min={0} max={100} w="w-20" /></Row>
          <Row label="강도"><Num value={glow.intensity} onChange={(v) => upd({ glow: { ...glow, intensity: Math.max(1, Math.min(5, Math.round(v))) } })} min={1} max={5} w="w-20" /></Row>
        </>
      )}
    </Section>
  );
}
