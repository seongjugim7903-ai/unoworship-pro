'use client';

/**
 * DesignRegistryModal — 디자인 등록 모달
 *
 * 5개 프로그램 × 2개 모니터(강대상 · 중층) 디자인 등록.
 *
 * ── 구조 ───────────────────────────────────────────
 *  프로그램 탭: [찬양대] [준비찬양] [설교대지] [주보] [특송]
 *
 *  ┌─ 강대상 모니터 ──────────────────────────────────┐
 *  │  기본 섹션   text 30px bold ...          [캡처]   │
 *  │  표지 섹션   text 24px bold ...          [캡처]   │
 *  └──────────────────────────────────────────────────┘
 *
 *  ┌─ 중층 모니터 ──────────────── [+ 레이아웃 추가] ──┐
 *  │  기본 섹션   text 68px ...               [캡처]   │
 *  │  표지 섹션   (미등록)                    [캡처]   │
 *  │───────────────────────────────────────────────── │
 *  │  ▸ 블랙+흰색가사 (PMT 옵션)                       │
 *  │    기본 섹션   ...                      [캡처]   │
 *  │    표지 섹션   ...                      [캡처]   │
 *  │  ▸ 안무영상 (PMT 옵션)                            │
 *  │    기본 섹션   (미등록)                  [캡처]   │
 *  │    표지 섹션   (미등록)                  [캡처]   │
 *  └──────────────────────────────────────────────────┘
 *
 * 기본 섹션/표지 섹션: 항상 존재. 캡처하면 덮어쓰기.
 * 추가 레이아웃: 독립된 디자인 세트(기본+표지). PMT 옵션으로 노출.
 */

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import type { CanvasElement, TextElement } from '@/lib/canvasTypes';

// ── 5개 프로그램 타입 ──
const PROGRAM_TYPES = [
  { id: 'choir',    label: '찬양대' },
  { id: 'conti',    label: '준비찬양' },
  { id: 'sermon',   label: '설교대지' },
  { id: 'bulletin', label: '주보' },
  { id: 'special',  label: '특송' },
] as const;

type ProgramTypeId = (typeof PROGRAM_TYPES)[number]['id'];

// ── 저장 구조 ──
interface ElementSlot {
  elements: CanvasElement[];
  updatedAt?: string;
}

/** 기본/표지 섹션 쌍 (강대상 모니터 + 중층 모니터 기본 모두 이 구조) */
interface SectionPair {
  default?: ElementSlot;
  cover?: ElementSlot;
}

/** 중층 모니터 추가 레이아웃 — PMT 옵션으로 노출 */
export interface PromptCustomLayout {
  id: string;
  name: string;
  sections: SectionPair;
  updatedAt?: string;
}

/** 프로그램별 전체 디자인 */
export interface ProgramDesignData {
  /** 강대상 모니터 기본/표지 */
  main?: SectionPair;
  /** 중층 모니터 기본/표지 (기본 레이아웃) */
  prompt?: SectionPair;
  /** 중층 모니터 추가 레이아웃들 — PMT 옵션 */
  promptLayouts?: PromptCustomLayout[];
  updatedAt?: string;
}

export type AllDesigns = Partial<Record<ProgramTypeId, ProgramDesignData>>;

type SectionId = 'default' | 'cover';

const SECTION_TYPES: { id: SectionId; label: string; desc: string }[] = [
  { id: 'default', label: '기본 섹션', desc: '모든 가사/본문 섹션에 적용' },
  { id: 'cover',   label: '표지 섹션', desc: '곡 제목·표지에 적용 (선택)' },
];

interface Props {
  onClose: () => void;
}

export default function DesignRegistryModal({ onClose }: Props) {
  const [activeType, setActiveType] = useState<ProgramTypeId>('choir');
  const [designs, setDesigns] = useState<AllDesigns>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [newLayoutName, setNewLayoutName] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);

  const { setlists, currentSetlistId, activeItemId, activeSectionId } = useStore();
  const currentSetlist = setlists.find((s) => s.id === currentSetlistId);
  const currentItem = currentSetlist?.items.find((i) => i.id === activeItemId);
  const currentSection = currentItem?.sections.find((s) => s.id === activeSectionId);

  // ── 로드 ──
  const loadDesigns = useCallback(async () => {
    try {
      const res = await fetch('/api/designs');
      if (res.ok) {
        const data = await res.json();
        setDesigns(data.designs ?? {});
      }
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDesigns(); }, [loadDesigns]);

  const prog = designs[activeType] ?? {};

  // ── 에디터 → 템플릿 ──
  const templateFromEditor = (): CanvasElement[] | null => {
    if (!currentSection) { flash('에디터에서 섹션을 먼저 선택해 주세요'); return null; }
    return currentSection.elements.map((el) => {
      if (el.type === 'text') return { ...el, content: '', linked: true } as TextElement;
      return { ...el };
    });
  };

  const now = () => new Date().toISOString();

  // ── 강대상: 슬롯 캡처 ──
  const captureMain = (sec: SectionId) => {
    const tpl = templateFromEditor();
    if (!tpl) return;
    setDesigns((prev) => {
      const p = prev[activeType] ?? {};
      return { ...prev, [activeType]: { ...p, updatedAt: now(), main: { ...p.main, [sec]: { elements: tpl, updatedAt: now() } } } };
    });
    flash(`강대상 · ${sec === 'default' ? '기본' : '표지'} 캡처 완료`);
  };

  const clearMain = (sec: SectionId) => {
    setDesigns((prev) => {
      const p = prev[activeType] ?? {};
      return { ...prev, [activeType]: { ...p, updatedAt: now(), main: { ...p.main, [sec]: undefined } } };
    });
    flash('초기화됨');
  };

  // ── 중층 기본: 슬롯 캡처 ──
  const capturePromptBase = (sec: SectionId) => {
    const tpl = templateFromEditor();
    if (!tpl) return;
    setDesigns((prev) => {
      const p = prev[activeType] ?? {};
      return { ...prev, [activeType]: { ...p, updatedAt: now(), prompt: { ...p.prompt, [sec]: { elements: tpl, updatedAt: now() } } } };
    });
    flash(`중층 · ${sec === 'default' ? '기본' : '표지'} 캡처 완료`);
  };

  const clearPromptBase = (sec: SectionId) => {
    setDesigns((prev) => {
      const p = prev[activeType] ?? {};
      return { ...prev, [activeType]: { ...p, updatedAt: now(), prompt: { ...p.prompt, [sec]: undefined } } };
    });
    flash('초기화됨');
  };

  // ── 중층 추가 레이아웃: 추가 ──
  const addPromptLayout = () => {
    const name = newLayoutName.trim();
    if (!name) { flash('레이아웃 이름을 입력해 주세요'); return; }
    const id = `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setDesigns((prev) => {
      const p = prev[activeType] ?? {};
      const layouts = p.promptLayouts ?? [];
      const layout: PromptCustomLayout = { id, name, sections: {}, updatedAt: now() };
      return { ...prev, [activeType]: { ...p, updatedAt: now(), promptLayouts: [...layouts, layout] } };
    });
    setNewLayoutName('');
    setShowAddInput(false);
    flash(`"${name}" 레이아웃 추가됨 → PMT 옵션에 노출`);
  };

  // ── 중층 추가 레이아웃: 섹션 캡처 ──
  const captureLayoutSection = (layoutId: string, sec: SectionId) => {
    const tpl = templateFromEditor();
    if (!tpl) return;
    setDesigns((prev) => {
      const p = prev[activeType] ?? {};
      const layouts = (p.promptLayouts ?? []).map((l) =>
        l.id === layoutId
          ? { ...l, updatedAt: now(), sections: { ...l.sections, [sec]: { elements: tpl, updatedAt: now() } } }
          : l
      );
      return { ...prev, [activeType]: { ...p, updatedAt: now(), promptLayouts: layouts } };
    });
    flash('캡처 완료');
  };

  const clearLayoutSection = (layoutId: string, sec: SectionId) => {
    setDesigns((prev) => {
      const p = prev[activeType] ?? {};
      const layouts = (p.promptLayouts ?? []).map((l) =>
        l.id === layoutId ? { ...l, updatedAt: now(), sections: { ...l.sections, [sec]: undefined } } : l
      );
      return { ...prev, [activeType]: { ...p, updatedAt: now(), promptLayouts: layouts } };
    });
    flash('초기화됨');
  };

  // ── 중층 추가 레이아웃: 삭제 ──
  const removeLayout = (layoutId: string) => {
    setDesigns((prev) => {
      const p = prev[activeType] ?? {};
      return { ...prev, [activeType]: { ...p, updatedAt: now(), promptLayouts: (p.promptLayouts ?? []).filter((l) => l.id !== layoutId) } };
    });
    flash('레이아웃 삭제됨');
  };

  // ── 저장 ──
  const handleSave = async () => {
    setSaving(true); setMsg('');
    try {
      const activeDesign = designs[activeType];
      if (!activeDesign) {
        flash('캡처하거나 레이아웃을 추가한 뒤 저장해 주세요', true);
        return;
      }

      const res = await fetch('/api/designs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programType: activeType, design: activeDesign }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      flash('저장 완료');
    } catch (err) {
      flash(`저장 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`, true);
    }
    finally { setSaving(false); }
  };

  const flash = (text: string, isError = false) => {
    setMsg(isError ? `⚠ ${text}` : text);
    setTimeout(() => setMsg(''), 2500);
  };

  const promptLayouts = prog.promptLayouts ?? [];
  const hasCurrent = !!currentSection;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-[780px] max-h-[85vh] rounded-xl border border-[#333] bg-[#111] shadow-2xl flex flex-col overflow-hidden">
        {/* ── 헤더 ── */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#222]">
          <h2 className="text-lg font-bold text-white">디자인 등록</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── 프로그램 탭 ── */}
        <div className="flex items-center gap-1.5 px-6 py-4 border-b border-[#222]">
          {PROGRAM_TYPES.map((pt) => (
            <button
              key={pt.id}
              onClick={() => setActiveType(pt.id)}
              className={`px-4 h-9 rounded-md text-sm font-semibold transition-colors ${
                activeType === pt.id
                  ? 'bg-violet-600 text-white'
                  : 'bg-[#1a1a1a] text-gray-400 hover:text-white hover:bg-[#252525] border border-[#333]'
              }`}
            >
              {pt.label}
            </button>
          ))}
        </div>

        {/* ── 본문 ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-base text-gray-500">불러오는 중...</div>
          ) : (
            <>
              {/* ━━━ 강대상 모니터 ━━━ */}
              <MonitorBlock
                color="bg-blue-500"
                title="강대상 모니터"
                subtitle="회중석에서 보는 메인 화면"
              >
                {SECTION_TYPES.map((sec) => (
                  <SlotRow key={sec.id} label={sec.label} desc={sec.desc}
                    slot={prog.main?.[sec.id]} hasCurrent={hasCurrent}
                    onCapture={() => captureMain(sec.id)} onClear={() => clearMain(sec.id)} />
                ))}
              </MonitorBlock>

              {/* ━━━ 중층 모니터 ━━━ */}
              <MonitorBlock
                color="bg-amber-500"
                title="중층 모니터"
                subtitle="무대 찬양팀 프롬프트"
                headerRight={
                  <AddLayoutButton
                    showInput={showAddInput}
                    value={newLayoutName}
                    onChange={setNewLayoutName}
                    onAdd={addPromptLayout}
                    onToggle={() => { setShowAddInput((v) => !v); setNewLayoutName(''); }}
                  />
                }
              >
                {/* 기본 기본/표지 섹션 (항상 존재) */}
                {SECTION_TYPES.map((sec) => (
                  <SlotRow key={sec.id} label={sec.label} desc={sec.desc}
                    slot={prog.prompt?.[sec.id]} hasCurrent={hasCurrent}
                    onCapture={() => capturePromptBase(sec.id)} onClear={() => clearPromptBase(sec.id)} />
                ))}

                {/* 추가 레이아웃 목록 */}
                {promptLayouts.length > 0 && (
                  <div className="border-t border-[#333] mt-1">
                    <div className="px-5 pt-4 pb-2">
                      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                        추가 레이아웃 — PMT 옵션으로 노출
                      </p>
                    </div>
                    {promptLayouts.map((layout) => (
                      <LayoutBlock
                        key={layout.id}
                        layout={layout}
                        hasCurrent={hasCurrent}
                        onCaptureSection={(sec) => captureLayoutSection(layout.id, sec)}
                        onClearSection={(sec) => clearLayoutSection(layout.id, sec)}
                        onRemove={() => removeLayout(layout.id)}
                      />
                    ))}
                  </div>
                )}
              </MonitorBlock>

              {prog.updatedAt && (
                <p className="text-xs text-gray-600 text-right">
                  마지막 저장: {new Date(prog.updatedAt).toLocaleString('ko-KR')}
                </p>
              )}
            </>
          )}
        </div>

        {/* ── 하단 ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#222] bg-[#0d0d0d]">
          <span className="text-sm min-h-[1.25rem]">
            {msg && <span className={msg.startsWith('⚠') ? 'text-red-400' : 'text-emerald-400'}>{msg}</span>}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 h-9 rounded-md border border-[#333] bg-[#1a1a1a] text-sm text-gray-400 hover:text-white transition-colors">닫기</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 h-9 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 하위 컴포넌트들
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

// ── 모니터 블록 ──
function MonitorBlock({ color, title, subtitle, headerRight, children }: {
  color: string; title: string; subtitle: string;
  headerRight?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#282828] bg-[#0a0a0a]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#222]">
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <span className="text-xs text-gray-600">{subtitle}</span>
        </div>
        {headerRight}
      </div>
      <div className="divide-y divide-[#1a1a1a]">
        {children}
      </div>
    </div>
  );
}

// ── 슬롯 행 (기본/표지) ──
function SlotRow({ label, desc, slot, hasCurrent, onCapture, onClear }: {
  label: string; desc: string; slot?: ElementSlot; hasCurrent: boolean;
  onCapture: () => void; onClear: () => void;
}) {
  const has = slot?.elements && slot.elements.length > 0;
  return (
    <div className="px-5 py-4 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-bold text-gray-200">{label}</h4>
          {has && <RegisteredBadge />}
        </div>
        <p className="text-xs text-gray-600 mt-1">{desc}</p>
        {has ? <ElementList elements={slot!.elements} /> : <p className="mt-2 text-xs text-gray-700 italic">미등록</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0 pt-1">
        <CaptureBtn disabled={!hasCurrent} onClick={onCapture} />
        {has && <ClearBtn onClick={onClear} />}
      </div>
    </div>
  );
}

// ── 추가 레이아웃 블록 (기본+표지 포함) ──
function LayoutBlock({ layout, hasCurrent, onCaptureSection, onClearSection, onRemove }: {
  layout: PromptCustomLayout; hasCurrent: boolean;
  onCaptureSection: (sec: SectionId) => void;
  onClearSection: (sec: SectionId) => void;
  onRemove: () => void;
}) {
  return (
    <div className="mx-5 mb-4 rounded-lg border border-[#222] bg-[#111]">
      {/* 레이아웃 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-amber-400">{layout.name}</span>
          <span className="text-[10px] text-gray-600 font-mono">{layout.id}</span>
        </div>
        <button onClick={onRemove} title="레이아웃 삭제"
          className="px-2.5 h-7 rounded-md border border-[#333] text-xs text-gray-500 hover:text-red-400 hover:border-red-500/30 transition-colors">
          삭제
        </button>
      </div>
      {/* 기본/표지 섹션 */}
      <div className="divide-y divide-[#1a1a1a]">
        {SECTION_TYPES.map((sec) => {
          const slot = layout.sections[sec.id];
          const has = slot?.elements && slot.elements.length > 0;
          return (
            <div key={sec.id} className="px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h5 className="text-xs font-semibold text-gray-300">{sec.label}</h5>
                  {has && <RegisteredBadge />}
                </div>
                {has ? <ElementList elements={slot!.elements} /> : <p className="mt-1 text-xs text-gray-700 italic">미등록</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <CaptureBtn disabled={!hasCurrent} onClick={() => onCaptureSection(sec.id)} />
                {has && <ClearBtn onClick={() => onClearSection(sec.id)} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 레이아웃 추가 버튼 (헤더 우측) ──
function AddLayoutButton({ showInput, value, onChange, onAdd, onToggle }: {
  showInput: boolean; value: string; onChange: (v: string) => void;
  onAdd: () => void; onToggle: () => void;
}) {
  if (showInput) {
    return (
      <div className="flex items-center gap-1.5">
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          placeholder="레이아웃 이름" autoFocus
          className="h-8 px-3 rounded-md border border-[#444] bg-[#1a1a1a] text-xs text-white placeholder:text-gray-600 focus:border-violet-500 focus:outline-none w-40" />
        <button onClick={onAdd} className="px-3 h-8 rounded-md bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white">추가</button>
        <button onClick={onToggle} className="px-2 h-8 rounded-md border border-[#333] text-xs text-gray-500 hover:text-white">취소</button>
      </div>
    );
  }
  return (
    <button onClick={onToggle}
      className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-dashed border-[#444] text-xs text-gray-500 hover:text-violet-400 hover:border-violet-500/40 transition-colors">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      레이아웃 추가
    </button>
  );
}

// ── 공용 ──
function ElementList({ elements }: { elements: CanvasElement[] }) {
  return (
    <div className="mt-2 space-y-1">
      {elements.map((el, i) => (
        <div key={el.id ?? i} className="flex items-center gap-2 text-xs">
          <span className="px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[#333] text-gray-400 font-mono text-[10px]">{el.type}</span>
          <span className="text-gray-500 truncate">
            {el.type === 'text'
              ? `${(el as TextElement).fontSize}px ${(el as TextElement).fontWeight} ${(el as TextElement).color} · ${(el as TextElement).textAlign}/${(el as TextElement).verticalAlign} · (${Math.round(el.x)}%, ${Math.round(el.y)}%)`
              : `${el.type} (${Math.round(el.x)}%, ${Math.round(el.y)}%) ${Math.round(el.width)}×${Math.round(el.height)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function RegisteredBadge() {
  return <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 font-semibold">등록됨</span>;
}

function CaptureBtn({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      title={disabled ? '에디터에서 섹션을 먼저 선택' : '현재 에디터 요소를 캡처'}
      className="px-3 h-8 rounded-md border border-violet-500/30 bg-violet-600/10 text-violet-300 text-xs font-semibold hover:bg-violet-600/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
      캡처
    </button>
  );
}

function ClearBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="초기화"
      className="px-3 h-8 rounded-md border border-[#333] bg-[#1a1a1a] text-xs text-gray-500 hover:text-red-400 hover:border-red-500/30 transition-colors">
      초기화
    </button>
  );
}
