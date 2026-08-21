'use client';

/**
 * DesignRegistryModal — 디자인 등록 모달
 *
 * 5개 프로그램 × 2개 모니터(강대상 · 중층) 디자인 등록.
 *
 * ── 구조 ───────────────────────────────────────────
 *  프로그램 탭: [찬양대] [준비찬양] [설교대지] [주보] [특송]
 *
 *  ┌─ 자동 생성될 제목 ───────────────────────────────┐
 *  │  헵시바-{곡명}-{날짜}        → 헵시바-은혜-0816   │
 *  └──────────────────────────────────────────────────┘
 *
 *  ┌─ 디자인 ─────────────────────────────────────────┐
 *  │  기본 섹션   text 30px bold ...          [캡처]   │
 *  │  표지 섹션   text 24px bold ...          [캡처]   │
 *  └──────────────────────────────────────────────────┘
 *
 * 강대상/중층 구분은 두지 않는다. 분류가 늘어나는 것에 비해 얻는 것이 적었고,
 * 실제로 중층에 등록된 것이 하나도 없었다. 프롬프트 화면은 PMT 옵션 쪽이
 * 따로 읽는다 (components/prompt/choir/ChoirPromptLayoutSelector).
 * 저장 구조의 prompt·promptLayouts 는 그대로 둔다 — 거기서 아직 쓴다.
 *
 *  ┌─ 낱장 페이지 ──────────────── [+ 현재 화면 담기] ─┐
 *  │  광고        text 2개 · shape 1개        [교체] [×] │
 *  │  축도        (비어 있음)                            │
 *  └──────────────────────────────────────────────────┘
 *
 * 기본 섹션/표지 섹션: 항상 존재. 캡처하면 덮어쓰기.
 * 추가 레이아웃: 독립된 디자인 세트(기본+표지). PMT 옵션으로 노출.
 * 낱장 페이지: 표지/본문으로 반복되지 않는 정해진 한 장짜리들(광고·축도·예배 타이틀).
 *
 * 배경과 결정은 docs/features/church-design-studio/context-notes.md 참조.
 */

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import type { CanvasElement, TextElement } from '@/lib/canvasTypes';

// ── 제품이 아는 프로그램 타입 ──
// 교회마다 자기만의 프로그램이 있다(임직식·성찬식·전교인 수련회…). 그것까지 미리
// 알 수 없으므로 아래 다섯은 시작점일 뿐이고, 교회가 얼마든지 더할 수 있다.
const PROGRAM_TYPES = [
  { id: 'choir',    label: '찬양대' },
  { id: 'conti',    label: '준비찬양' },
  { id: 'sermon',   label: '설교대지' },
  { id: 'bulletin', label: '주보' },
  { id: 'special',  label: '특송' },
] as const;

/* 교회가 더한 것까지 담아야 해서 문자열이다 — 다섯으로 묶으면 더할 수가 없다 */
type ProgramTypeId = string;

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

/**
 * 낱장 페이지 — 표지/본문으로 반복되지 않는 정해진 한 장.
 * 광고·축도·예배 타이틀처럼 매번 같은 모양으로 한 번만 나오는 것들이다.
 */
export interface DesignPage {
  id: string;
  name: string;
  elements: CanvasElement[];
  updatedAt?: string;
}

/**
 * 이름을 붙여 등록한 디자인 한 벌.
 *
 * 카테고리(프로그램 탭) 안에 여러 벌을 둘 수 있다. 각 팀이 입력 화면에서 이 이름으로
 * 찾아 불러오고, 텍스트만 넣으면 파일이 만들어지는 것이 목표다.
 */
/**
 * 이 프로그램이 받을 항목 하나.
 *
 * 디자이너가 **먼저 선언한다.** 헵시바 선교단이면 `제목`·`가사`, 교독문이면
 * `표지`·`본문`처럼 프로그램마다 구성이 제각각이라, 디자인을 잡기 전에 무엇을
 * 받을지부터 정해야 한다.
 *
 * 선언한 이름이 그대로 각 팀 입력 화면의 칸 제목이 된다.
 */
export interface DesignField {
  id: string;
  /** 입력 화면에 보일 칸 이름 — '제목', '가사', '소식' */
  name: string;
  /**
   * 이 항목이 섹션을 몇 개 만드는가.
   *   one   섹션 1개
   *   many  빈 줄마다 새 섹션
   * 디자이너가 궁금한 것은 '장이 몇 개 생기나'다. 그것을 이름으로 삼는다.
   */
  kind: 'one' | 'many';
  /**
   * 섹션 여러개일 때 몇 개까지. 비우면 제한 없음.
   * 나누는 규칙은 **빈 줄**이다 — 입력웹 교회소식이 이미 쓰는 규칙(splitNewsBlocks)과 같다.
   */
  count?: number;
  /** 이 항목이 어느 자리에 놓이는지 */
  where: FieldWhere;
}

export interface DesignPreset {
  id: string;
  name: string;
  titlePattern?: string;
  /** 이 프로그램의 페이지 구성 */
  fields?: DesignField[];
  main?: SectionPair;
  prompt?: SectionPair;
  promptLayouts?: PromptCustomLayout[];
  pages?: DesignPage[];
  updatedAt?: string;
}

/** 프로그램별 전체 디자인 */
export interface ProgramDesignData {
  /** 교회가 더한 프로그램일 때 화면에 보일 이름. 제품이 아는 다섯은 비어 있다 */
  label?: string;
  /** 이름을 붙여 등록한 디자인들 */
  presets?: DesignPreset[];
  /** 지금 쓰고 있는 디자인 */
  activePresetId?: string;
  /**
   * 이 디자인으로 자동 생성될 프로그램 파일의 제목.
   * 자리표시자를 그대로 쓴다 — 예: `헵시바-{곡명}-{날짜}`.
   * 비워 두면 지금까지의 이름 규칙을 그대로 쓴다.
   */
  titlePattern?: string;
  /** 낱장 페이지 목록 */
  pages?: DesignPage[];
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

/**
 * 제목에 쓸 수 있는 자리표시자.
 * 자동 생성 경로가 실제로 채워 넣을 수 있는 것만 둔다 — 못 채우는 것을 보여 주면
 * 방송실에서 넣어 놓고 왜 안 나오는지 알 수 없다.
 */
const TITLE_TOKENS: { token: string; desc: string; sample: string }[] = [
  { token: '{곡명}', desc: '곡 제목 · 프로그램 제목', sample: '은혜' },
  { token: '{날짜}', desc: '예배일 (MMDD)', sample: '0816' },
  { token: '{예배}', desc: '예배 종류', sample: '주일낮예배' },
];

/** 자리표시자를 예시 값으로 채워 결과를 보여 준다 */
export function previewTitle(pattern: string): string {
  return TITLE_TOKENS.reduce(
    (acc, t) => acc.split(t.token).join(t.sample),
    pattern,
  );
}

const FIELD_KINDS: { id: DesignField['kind']; label: string }[] = [
  { id: 'one', label: '섹션 1개' },
  { id: 'many', label: '섹션 여러개' },
];

/**
 * 항목이 놓이는 자리.
 *
 * 방송실에서 실제로 부르는 말을 그대로 쓴다 — 영문 키로 바꾸면 화면과 저장값이
 * 갈리고, 새 자리가 생길 때마다 매핑을 손봐야 한다.
 *
 * 인도자·회중은 넣지 않는다. 그 섹션이 어디로 나갈지는 출력 라우팅이 정하므로
 * 여기서 또 고르게 하면 같은 것을 두 군데서 정하게 된다.
 *
 * '비고'는 코드가 이미 아는 자리다 — 디자인을 입히지 않고 송출에도 나가지 않는다
 * (worshipUploader 의 isNoteSection).
 */
/**
 * 항목이 놓이는 자리 — **위치만** 나타낸다.
 *
 * 통상적인 프로그램이면 어느 것이든 이 넷으로 덮인다. 앞에 한 장, 반복되는 본문,
 * 뒤에 한 장, 그리고 송출하지 않는 메모.
 *
 * 제목·후렴·간주 같은 것은 여기 넣지 않는다. 그건 자리가 아니라 **항목 이름**이다 —
 * 후렴을 다르게 보이려면 항목 이름을 '후렴'으로 두고 자리를 '본문'으로 하면 된다.
 * 자리 축에 섞으면 같은 것을 두 군데서 정하게 된다.
 *
 * 책·장·절·찬송장도 넣지 않는다. 찬송가·성경말씀은 템플릿 세트가 맡기로 했다
 * (이 문서 「어느 쪽이 무엇을 맡나」).
 *
 * '비고'는 코드가 이미 아는 자리다 — 디자인을 입히지 않고 송출에도 나가지 않는다
 * (worshipUploader 의 isNoteSection).
 */
export const FIELD_WHERE = ['표지', '본문', '후지', '비고'] as const;

export type FieldWhere = (typeof FIELD_WHERE)[number];

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
  const [newProgramName, setNewProgramName] = useState('');
  const [showProgramInput, setShowProgramInput] = useState(false);

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

  /* 제품이 아는 다섯 + 교회가 더한 것. 파일 이름은 영숫자만 허용되므로(designs API의
     sanitize) 한글 이름은 키로 쓸 수 없다 — 키는 custom-<시각>, 이름은 안에 담는다. */
  const programTabs: { id: ProgramTypeId; label: string; custom: boolean }[] = [
    ...PROGRAM_TYPES.map((t) => ({ id: t.id as ProgramTypeId, label: t.label, custom: false })),
    ...Object.entries(designs)
      .filter(([id]) => !PROGRAM_TYPES.some((t) => t.id === id))
      .map(([id, d]) => ({ id, label: d?.label || id, custom: true })),
  ];

  const addProgramType = () => {
    const label = newProgramName.trim();
    if (!label) { flash('프로그램 이름을 입력해 주세요'); return; }
    const id = `custom-${Date.now()}`;
    setDesigns((prev) => ({ ...prev, [id]: { label, updatedAt: now() } }));
    setActiveType(id);
    setNewProgramName('');
    setShowProgramInput(false);
    flash(`"${label}" 추가됨 — 저장해야 남습니다`);
  };

  /* 이름 없이 등록하던 시절의 한 벌은 '기본'이라는 이름으로 보여 준다 —
     기존 등록분이 화면에서 사라지면 방송실에서는 날아간 것으로 보인다. */
  const presets: DesignPreset[] = prog.presets?.length
    ? prog.presets
    : [{
        id: 'default',
        name: '기본',
        titlePattern: prog.titlePattern,
        main: prog.main,
        prompt: prog.prompt,
        promptLayouts: prog.promptLayouts,
        pages: prog.pages,
        updatedAt: prog.updatedAt,
      }];
  const activeId = prog.activePresetId && presets.some((x) => x.id === prog.activePresetId)
    ? prog.activePresetId
    : presets[0].id;
  const preset = presets.find((x) => x.id === activeId) ?? presets[0];

  /**
   * 활성 프리셋만 고친다.
   *
   * 고친 결과를 프로그램 최상단(main·prompt…)에도 그대로 비춰 둔다 — 생성기(designLoader)가
   * 아직 그 자리를 읽는다. 비추지 않으면 등록해도 자막에 반영되지 않는다.
   */
  const updatePreset = (patch: (p: DesignPreset) => DesignPreset) => {
    setDesigns((prev) => {
      const p = prev[activeType] ?? {};
      const list = (p.presets?.length ? p.presets : presets)
        .map((x) => (x.id === activeId ? { ...patch(x), updatedAt: now() } : x));
      const active = list.find((x) => x.id === activeId) ?? list[0];
      return {
        ...prev,
        [activeType]: {
          ...p,
          presets: list,
          activePresetId: activeId,
          updatedAt: now(),
          titlePattern: active.titlePattern,
          main: active.main,
          prompt: active.prompt,
          promptLayouts: active.promptLayouts,
          pages: active.pages,
        },
      };
    });
  };

  /**
   * 이 디자인이 입력 페이지에 만들 입력칸들.
   *
   * 텍스트 요소의 fieldRole 이 곧 입력칸 이름이다. 이름이 없는 텍스트는 고정 텍스트라
   * 입력 페이지에 나타나지 않는다 — '헵시바 선교단'처럼 안 바뀌는 것이 그렇다.
   *
   * 같은 이름을 여러 요소에 붙이면 한 번 넣은 값이 그 자리 전부에 들어간다.
   * 표지와 본문에 같은 곡명을 띄우고 싶을 때 쓴다.
   */
  const fieldSlots = (() => {
    const out: { key: string; where: string; index: number; role: string; sample: string }[] = [];
    const walk = (where: string, slot?: ElementSlot) => {
      (slot?.elements ?? []).forEach((el, index) => {
        if (el.type !== 'text') return;
        const t = el as TextElement;
        out.push({ key: `${where}:${index}`, where, index, role: t.fieldRole ?? '', sample: (t.content ?? '').trim() });
      });
    };
    walk('main.default', preset.main?.default);
    walk('main.cover', preset.main?.cover);
    return out;
  })();

  const fields = preset.fields ?? [];

  /* 선언만 하고 어디에도 안 붙인 항목 — 입력 화면에는 칸이 뜨는데 넣은 값이 갈 곳이
     없다. 예배 당일에야 빈 화면으로 드러나므로 등록할 때 잡아 준다. */
  const boundRoles = new Set(fieldSlots.map((f) => f.role).filter(Boolean));
  const unbound = fields.filter((f) => f.name.trim() && !boundRoles.has(f.name.trim()));

  /* 저장 전에 무엇이 만들어지는지 한 줄로 — 등록됨/미등록을 일일이 세지 않게 */
  const summary = [
    preset.titlePattern?.trim() ? `제목 ${previewTitle(preset.titlePattern)}` : '제목 없음',
    `항목 ${fields.filter((f) => f.name.trim()).length}개`,
    [preset.main?.default && '본문', preset.main?.cover && '표지']
      .filter(Boolean).join(' · ') || '디자인 미등록',
    (preset.pages?.length ?? 0) > 0 ? `낱장 ${preset.pages?.length}장` : '',
  ].filter(Boolean).join('  ·  ');

  const addField = () => {
    const id = `f-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    updatePreset((x) => ({ ...x, fields: [...(x.fields ?? []), { id, name: '', kind: 'one', where: '본문' }] }));
  };

  const patchField = (id: string, patch: Partial<DesignField>) =>
    updatePreset((x) => ({ ...x, fields: (x.fields ?? []).map((f) => f.id === id ? { ...f, ...patch } : f) }));

  const removeField = (id: string) =>
    updatePreset((x) => ({ ...x, fields: (x.fields ?? []).filter((f) => f.id !== id) }));

  const setFieldRole = (where: string, index: number, role: string) => {
    const [monitor, sec] = where.split('.') as ['main' | 'prompt', SectionId];
    updatePreset((x) => {
      const slot = x[monitor]?.[sec];
      if (!slot) return x;
      const elements = slot.elements.map((el, i) =>
        i === index && el.type === 'text' ? { ...el, fieldRole: role.trim() || undefined } : el);
      return { ...x, [monitor]: { ...x[monitor], [sec]: { ...slot, elements, updatedAt: now() } } };
    });
  };

  const selectPreset = (id: string) => {
    setDesigns((prev) => {
      const p = prev[activeType] ?? {};
      const list = p.presets?.length ? p.presets : presets;
      const active = list.find((x) => x.id === id) ?? list[0];
      return { ...prev, [activeType]: { ...p, presets: list, activePresetId: id,
        titlePattern: active.titlePattern, main: active.main, prompt: active.prompt,
        promptLayouts: active.promptLayouts, pages: active.pages } };
    });
  };

  const addPreset = () => {
    const id = `dp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setDesigns((prev) => {
      const p = prev[activeType] ?? {};
      const list = p.presets?.length ? p.presets : presets;
      const fresh: DesignPreset = { id, name: `새 디자인 ${list.length + 1}`, updatedAt: now() };
      return { ...prev, [activeType]: { ...p, presets: [...list, fresh], activePresetId: id,
        titlePattern: undefined, main: undefined, prompt: undefined, promptLayouts: undefined, pages: undefined } };
    });
    flash('새 디자인을 만들었습니다. 이름부터 지어 주세요');
  };

  const removePreset = (id: string) => {
    setDesigns((prev) => {
      const p = prev[activeType] ?? {};
      const list = (p.presets?.length ? p.presets : presets).filter((x) => x.id !== id);
      if (list.length === 0) return prev;
      const active = list[0];
      return { ...prev, [activeType]: { ...p, presets: list, activePresetId: active.id, updatedAt: now(),
        titlePattern: active.titlePattern, main: active.main, prompt: active.prompt,
        promptLayouts: active.promptLayouts, pages: active.pages } };
    });
    flash('디자인 삭제됨');
  };

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
    updatePreset((x) => ({ ...x, main: { ...x.main, [sec]: { elements: tpl, updatedAt: now() } } }));
    flash(`강대상 · ${sec === 'default' ? '기본' : '표지'} 캡처 완료`);
  };

  const clearMain = (sec: SectionId) => {
    updatePreset((x) => ({ ...x, main: { ...x.main, [sec]: undefined } }));
    flash('초기화됨');
  };







  // ── 자동 생성될 제목 ──
  const setTitlePattern = (value: string) => updatePreset((x) => ({ ...x, titlePattern: value }));
  const setPresetName = (value: string) => updatePreset((x) => ({ ...x, name: value }));

  // ── 낱장 페이지 ──
  /* 지금 캔버스에 보이는 섹션을 그대로 담는다. 별도 편집기를 만들지 않는다 —
     방송실 담당자가 이미 쓰는 화면이 편집기다. */
  const addPage = () => {
    const tpl = templateFromEditor();
    if (!tpl) return;
    const name = currentSection?.label?.trim() || `페이지 ${(preset.pages?.length ?? 0) + 1}`;
    const page: DesignPage = { id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, elements: tpl, updatedAt: now() };
    updatePreset((x) => ({ ...x, pages: [...(x.pages ?? []), page] }));
    flash(`"${name}" 담았습니다`);
  };

  const replacePage = (pageId: string) => {
    const tpl = templateFromEditor();
    if (!tpl) return;
    updatePreset((x) => ({ ...x, pages: (x.pages ?? []).map((pg) => pg.id === pageId ? { ...pg, elements: tpl, updatedAt: now() } : pg) }));
    flash('교체 완료');
  };

  const renamePage = (pageId: string, name: string) =>
    updatePreset((x) => ({ ...x, pages: (x.pages ?? []).map((pg) => pg.id === pageId ? { ...pg, name } : pg) }));

  const removePage = (pageId: string) => {
    updatePreset((x) => ({ ...x, pages: (x.pages ?? []).filter((pg) => pg.id !== pageId) }));
    flash('페이지 삭제됨');
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
          {programTabs.map((pt) => (
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
          {/* 교회마다 자기만의 프로그램이 있다 — 다섯으로 닫아 두면 그것을 담을 곳이 없다 */}
          {showProgramInput ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newProgramName}
                onChange={(e) => setNewProgramName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addProgramType(); if (e.key === 'Escape') setShowProgramInput(false); }}
                placeholder="예: 임직식"
                className="w-32 h-9 px-2 rounded-md bg-[#0d0d0d] border border-[#333] text-sm text-white placeholder:text-gray-600 focus:border-violet-500 outline-none"
              />
              <button onClick={addProgramType} className="px-3 h-9 rounded-md text-sm font-semibold bg-violet-600 text-white">추가</button>
            </div>
          ) : (
            <button
              onClick={() => setShowProgramInput(true)}
              className="px-4 h-9 rounded-md text-sm font-semibold border border-dashed border-[#3a3a3a] text-gray-400 hover:text-white hover:border-violet-500"
            >
              + 프로그램
            </button>
          )}
        </div>

        {/* ── 본문 ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-base text-gray-500">불러오는 중...</div>
          ) : (
            <>
              {/* ━━━ 등록 이름 + 자동 생성될 제목 ━━━ */}
              <section className="rounded-lg border border-[#2a2a2a] bg-[#161616] p-4">
                {/* 등록한 이름과 카테고리가 그대로 각 팀 입력 화면의 검색어가 된다 */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-violet-500" />
                  <h3 className="text-sm font-bold text-white">디자인 이름</h3>
                  <span className="text-xs text-gray-500">
                    {PROGRAM_TYPES.find((t) => t.id === activeType)?.label} · 각 팀이 이 이름으로 찾습니다
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-2">
                  {presets.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => selectPreset(it.id)}
                      className={`px-3 h-8 rounded-md text-xs font-semibold border transition-colors ${
                        it.id === activeId
                          ? 'bg-violet-600 border-violet-600 text-white'
                          : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:text-white'
                      }`}
                    >
                      {it.name || '이름 없음'}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={addPreset}
                    className="px-3 h-8 rounded-md text-xs font-semibold border border-dashed border-[#3a3a3a] text-gray-400 hover:text-white hover:border-violet-500"
                  >
                    + 새 디자인
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <input
                    value={preset.name}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="예: 헵시바 표지형"
                    className="flex-1 h-10 px-3 rounded-md bg-[#0d0d0d] border border-[#333] text-sm text-white placeholder:text-gray-600 focus:border-violet-500 outline-none"
                  />
                  {presets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePreset(activeId)}
                      aria-label="이 디자인 삭제"
                      className="w-10 h-10 rounded-md text-gray-500 hover:text-red-400 hover:bg-white/5"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-violet-500" />
                  <h3 className="text-sm font-bold text-white">자동 생성될 제목</h3>
                  <span className="text-xs text-gray-500">이 디자인으로 만들어질 파일 이름</span>
                </div>
                <input
                  value={preset.titlePattern ?? ''}
                  onChange={(e) => setTitlePattern(e.target.value)}
                  placeholder="헵시바-{곡명}-{날짜}"
                  className="w-full h-10 px-3 rounded-md bg-[#0d0d0d] border border-[#333] text-sm text-white placeholder:text-gray-600 focus:border-violet-500 outline-none"
                />
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {preset.titlePattern?.trim()
                    ? <span className="text-gray-400">이렇게 만들어집니다 · <b className="text-violet-300">{previewTitle(preset.titlePattern)}</b></span>
                    : <span className="text-gray-500">비워 두면 지금까지의 이름 규칙을 그대로 씁니다.</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {TITLE_TOKENS.map((t) => (
                    <button
                      key={t.token}
                      type="button"
                      title={t.desc}
                      onClick={() => setTitlePattern(`${preset.titlePattern ?? ''}${t.token}`)}
                      className="px-2 h-7 rounded bg-[#1f1f1f] border border-[#333] text-xs text-gray-300 hover:text-white hover:border-violet-500"
                    >
                      {t.token}
                    </button>
                  ))}
                </div>
              </section>

              {/* ━━━ 페이지 구성 ━━━ */}
              <MonitorBlock
                color="bg-violet-500"
                title="페이지 구성"
                subtitle="이 프로그램이 받을 항목"
                headerRight={
                  <button
                    type="button"
                    onClick={addField}
                    className="px-3 h-8 rounded-md text-xs font-semibold border border-[#333] bg-[#1a1a1a] text-gray-300 hover:text-white hover:border-violet-500"
                  >
                    + 항목 추가
                  </button>
                }
              >
                {fields.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-gray-500">
                    프로그램마다 받을 것이 다릅니다 — 헵시바 선교단은 <b className="text-gray-400">제목·가사</b>,
                    {' '}교독문은 <b className="text-gray-400">표지·본문</b>. 여기서 정한 이름이 각 팀 입력 화면의 칸이 됩니다.
                  </p>
                ) : (
                  <div className="divide-y divide-[#222]">
                    {/* 칸 이름이 없으면 '표지'가 디자인 이름인지 자리인지 알 수 없다 */}
                    <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-[11px] text-gray-500">
                      <span className="flex-1 min-w-0">항목 이름</span>
                      <span className="w-[68px]">자리</span>
                      <span className="w-[104px]">몇 장</span>
                      <span className="w-[72px]">최대</span>
                      <span className="w-8" />
                    </div>
                    {fields.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 px-4 py-2.5">
                        <input
                          value={f.name}
                          onChange={(e) => patchField(f.id, { name: e.target.value })}
                          placeholder="항목 이름 (예: 가사)"
                          className="flex-1 min-w-0 h-8 px-2 rounded bg-[#0d0d0d] border border-[#2a2a2a] text-xs text-white placeholder:text-gray-600 focus:border-violet-500 outline-none"
                        />
                        <select
                          value={f.where}
                          onChange={(e) => patchField(f.id, { where: e.target.value as DesignField['where'] })}
                          title={f.where === '비고' ? '비고는 송출에 나가지 않습니다 — 진행 메모' : ''}
                          className="w-[68px] h-8 px-1.5 rounded bg-[#0d0d0d] border border-[#2a2a2a] text-xs text-gray-300"
                        >
                          {FIELD_WHERE.map((w) => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <select
                          value={f.kind}
                          onChange={(e) => patchField(f.id, { kind: e.target.value as DesignField['kind'] })}
                          className="w-[104px] h-8 px-1.5 rounded bg-[#0d0d0d] border border-[#2a2a2a] text-xs text-gray-300"
                        >
                          {FIELD_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                        </select>
                        {/* 개수는 '섹션 여러개'일 때만 뜻이 있다. 늘 보여 주면 1개짜리에도
                            숫자를 넣게 되고, 그게 아무 일도 안 한다는 것을 알 수 없다.
                            입력칸 모양은 묻지 않는다 — 섹션은 빈 줄로 나누는 것이 기본이다. */}
                        {f.kind !== 'many' && <span className="w-[72px]" />}
                        {f.kind === 'many' && (
                          <input
                            type="number"
                            min={1}
                            value={f.count ?? ''}
                            onChange={(e) => patchField(f.id, { count: e.target.value ? Number(e.target.value) : undefined })}
                            placeholder="제한 없음"
                            title="최대 몇 개까지 — 비우면 제한 없음"
                            className="w-[72px] h-8 px-2 rounded bg-[#0d0d0d] border border-[#2a2a2a] text-xs text-white placeholder:text-gray-600"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => removeField(f.id)}
                          aria-label={`${f.name || '항목'} 삭제`}
                          className="w-8 h-8 rounded text-gray-500 hover:text-red-400 hover:bg-white/5"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {unbound.length > 0 && fieldSlots.length > 0 && (
                  <p className="mx-4 my-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                    <b>{unbound.map((f) => f.name.trim()).join(' · ')}</b> 는 아직 어느 텍스트에도 붙지 않았습니다.
                    입력 화면에는 칸이 뜨지만 넣은 값이 나갈 자리가 없습니다.
                  </p>
                )}

                {/* 선언한 항목을 캡처한 텍스트에 붙인다 — 붙이지 않으면 값이 갈 곳이 없다 */}
                {fieldSlots.length > 0 && (
                  <div className="border-t border-[#222] mt-1">
                    <p className="px-4 pt-3 text-xs text-gray-500">
                      캡처한 <b className="text-gray-400">텍스트마다 어느 항목이 들어갈지</b> 골라 주세요.
                      고르지 않으면 고정 텍스트입니다 — 「헵시바 선교단」처럼 안 바뀌는 것.
                    </p>
                    <div className="divide-y divide-[#222]">
                      {fieldSlots.map((f) => (
                        <div key={f.key} className="flex items-center gap-2 px-4 py-2.5">
                          <span className="w-24 shrink-0 text-xs text-gray-500">
                            {f.where.endsWith('cover') ? '표지' : '본문'}
                          </span>
                          <span className="flex-1 min-w-0 truncate text-xs text-gray-600">
                            {f.sample || '(빈 텍스트)'}
                          </span>
                          <select
                            value={f.role}
                            onChange={(e) => setFieldRole(f.where, f.index, e.target.value)}
                            className="w-36 h-8 px-2 rounded bg-[#0d0d0d] border border-[#2a2a2a] text-xs text-gray-200"
                          >
                            <option value="">고정 텍스트</option>
                            {fields.filter((x) => x.name.trim()).map((x) => (
                              <option key={x.id} value={x.name.trim()}>{x.name.trim()}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </MonitorBlock>

              {/* ━━━ 디자인 ━━━ */}
              <MonitorBlock
                color="bg-blue-500"
                title="디자인"
                subtitle="캔버스에서 만들어 담습니다"
              >
                {SECTION_TYPES.map((sec) => (
                  <SlotRow key={sec.id} label={sec.label} desc={sec.desc}
                    slot={preset.main?.[sec.id]} hasCurrent={hasCurrent}
                    onCapture={() => captureMain(sec.id)} onClear={() => clearMain(sec.id)} />
                ))}
              </MonitorBlock>

              {/* ━━━ 낱장 페이지 ━━━ */}
              <MonitorBlock
                color="bg-emerald-500"
                title="낱장 페이지"
                subtitle="표지·본문으로 반복되지 않는 정해진 한 장"
                headerRight={
                  <button
                    type="button"
                    onClick={addPage}
                    disabled={!hasCurrent}
                    title={hasCurrent ? '' : '에디터에서 섹션을 먼저 선택해 주세요'}
                    className="px-3 h-8 rounded-md text-xs font-semibold border border-[#333] bg-[#1a1a1a] text-gray-300 enabled:hover:text-white enabled:hover:border-emerald-500 disabled:opacity-40"
                  >
                    + 현재 화면 담기
                  </button>
                }
              >
                {(preset.pages ?? []).length === 0 ? (
                  <p className="px-4 py-3 text-xs text-gray-500">
                    광고 · 축도 · 예배 타이틀처럼 <b className="text-gray-400">한 장으로 정해진 페이지</b>를 담아 두는 곳입니다.
                    캔버스에서 만들고 <b className="text-gray-400">현재 화면 담기</b>를 누르세요.
                  </p>
                ) : (
                  <div className="divide-y divide-[#222]">
                    {(preset.pages ?? []).map((page) => (
                      <div key={page.id} className="flex items-center gap-2 px-4 py-3">
                        <input
                          value={page.name}
                          onChange={(e) => renamePage(page.id, e.target.value)}
                          className="flex-1 min-w-0 h-8 px-2 rounded bg-[#0d0d0d] border border-[#2a2a2a] text-sm text-white focus:border-emerald-500 outline-none"
                        />
                        <span className="text-xs text-gray-500 whitespace-nowrap">요소 {page.elements.length}개</span>
                        <button
                          type="button"
                          onClick={() => replacePage(page.id)}
                          disabled={!hasCurrent}
                          className="px-2.5 h-8 rounded text-xs font-semibold border border-[#333] text-gray-300 enabled:hover:text-white enabled:hover:border-emerald-500 disabled:opacity-40"
                        >
                          교체
                        </button>
                        <button
                          type="button"
                          onClick={() => removePage(page.id)}
                          aria-label={`${page.name} 삭제`}
                          className="w-8 h-8 rounded text-gray-500 hover:text-red-400 hover:bg-white/5"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </MonitorBlock>

              <p className="text-xs text-gray-500">
                <b className="text-gray-300">{preset.name || '이름 없음'}</b> — {summary}
              </p>

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
