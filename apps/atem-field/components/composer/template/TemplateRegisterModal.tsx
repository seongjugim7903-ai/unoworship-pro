'use client';

// 에디터 현재 섹션을 캡처하고 텍스트 박스별 역할(fieldRole)을 지정해 자막 템플릿으로 저장하는 모달

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/lib/store';
import type { TextElement } from '@/lib/canvasTypes';
import {
  CATEGORY_FIELDS,
  CATEGORY_LABELS,
  type TemplateCategory,
} from '@/features/subtitle-template/schema';
import { TEMPLATE_VERSION, type SubtitleTemplate } from '@/features/subtitle-template/model';
import { listTemplates, removeTemplate, saveTemplate } from '@/features/subtitle-template/templateClient';
import {
  SEED_TEMPLATE_NAME,
  getActiveTemplateName,
  listTemplateSetNames,
  setActiveTemplateName,
} from '@/features/subtitle-template/activeTemplate';
import { renderTemplateThumbnail } from '@/features/subtitle-template/thumbnail';

const CATEGORY_ORDER: TemplateCategory[] = [
  'bible',
  'responsive',
  'hymn',
  'praise',
  'sermon',
  'worshipTitle',
  'notice',
  'churchNews',
  'lowerthird',
  'apostlesCreed',
  'preacher',
  'titleScripture',
  'wordTitle',
  'pointTitle',
  'hephzibah',
  'meditation',
  'scripture',
  'wordText',
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function useTemplateRegister() {
  const [isOpen, setIsOpen] = useState(false);
  return {
    isOpen,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
  };
}

function previewText(el: TextElement): string {
  const t = (el.content || '').trim();
  if (t) return t.length > 24 ? `${t.slice(0, 24)}…` : t;
  return el.linked ? '(본문 연결 박스)' : '(빈 텍스트)';
}

export function TemplateRegisterModal({ isOpen, onClose }: Props) {
  const { setlists, currentSetlistId, activeItemId, activeSectionId } = useStore();

  const activeElements = useMemo(() => {
    const sl = setlists.find((s) => s.id === currentSetlistId);
    const it = sl?.items.find((i) => i.id === activeItemId);
    const sec = it?.sections.find((s) => s.id === activeSectionId);
    return sec?.elements ?? [];
  }, [setlists, currentSetlistId, activeItemId, activeSectionId]);

  const textElements = useMemo(
    () => activeElements.filter((e): e is TextElement => e.type === 'text'),
    [activeElements],
  );
  const nonTextCount = activeElements.length - textElements.length;

  const [category, setCategory] = useState<TemplateCategory>('bible');
  const [name, setName] = useState('');
  const [autoFitBody, setAutoFitBody] = useState(false);
  const [roles, setRoles] = useState<Record<string, string>>({}); // elementId -> fieldRole ('' = 정적)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [existing, setExisting] = useState<SubtitleTemplate[]>([]);
  /* 이 교회가 쓰는 세트 이름. localStorage 는 최초 마운트에서 한 번만 읽는다 —
     이 모달이 유일한 변경 지점이라 이후에는 화면 상태가 곧 저장값이다. */
  const [activeSet, setActiveSet] = useState(getActiveTemplateName);

  const reloadExisting = useCallback(() => {
    void listTemplates().then(setExisting);
  }, []);

  // 모달 열릴 때 저장된 템플릿 목록을 불러온다.
  useEffect(() => {
    if (isOpen) reloadExisting();
  }, [isOpen, reloadExisting]);

  const setNames = useMemo(() => listTemplateSetNames(existing), [existing]);

  // 카테고리 변경 시 현 카테고리에 없는 역할 선택은 초기화한다(이펙트 대신 이벤트 핸들러에서 처리).
  const changeCategory = useCallback((cat: TemplateCategory) => {
    setCategory(cat);
    const valid = new Set(CATEGORY_FIELDS[cat].map((f) => f.key));
    setRoles((prev) => {
      const next: Record<string, string> = {};
      for (const [id, role] of Object.entries(prev)) {
        next[id] = role && valid.has(role) ? role : '';
      }
      return next;
    });
  }, []);

  const fields = CATEGORY_FIELDS[category];
  const canSave = Boolean(name.trim() && activeElements.length > 0);

  /**
   * 같은 카테고리·같은 이름으로 이미 저장된 템플릿.
   * listTemplates() 는 /api/templates 의 순서를 그대로 유지하고, 프로그램 생성 시
   * loadTemplatePicker 도 같은 순서에서 첫 번째를 고른다 — 즉 [0] 이 실제로 쓰이는 것이다.
   * 새 id 로 저장하면 파일만 하나 더 생기고 옛것이 계속 이기므로, [0] 에 덮어쓴다.
   */
  const duplicates = useMemo(
    () => existing.filter((t) => t.category === category && t.name === name.trim()),
    [existing, category, name],
  );

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    const target = duplicates[0];
    if (target && typeof window !== 'undefined') {
      const ok = window.confirm(
        `"${name.trim()}" (${CATEGORY_LABELS[category]}) 템플릿이 이미 있습니다.\n덮어쓸까요?\n\n` +
          '덮어쓰지 않으면 같은 이름이 둘이 되고, 프로그램 생성에는 먼저 등록된 옛것이 계속 쓰입니다.',
      );
      if (!ok) {
        setStatus('idle');
        setMessage('저장을 취소했습니다.');
        return;
      }
    }

    setStatus('saving');
    setMessage('저장 중입니다.');

    const variantElements = activeElements.map((el) => {
      if (el.type !== 'text') return el;
      const role = roles[el.id];
      return {
        ...el,
        fieldRole: role || undefined,
        autoFit: role === 'body' ? autoFitBody : undefined,
      } as TextElement;
    });

    const thumbnail = await renderTemplateThumbnail(variantElements);

    const iso = new Date().toISOString();
    const template: SubtitleTemplate = {
      /* 같은 이름이 있으면 그 파일을 덮어쓴다(id = 파일명). 없으면 새로 만든다. */
      id: target?.id ?? `tpl-${Date.now()}`,
      name: name.trim(),
      category,
      templateVersion: TEMPLATE_VERSION,
      thumbnail: thumbnail || undefined,
      variants: [{ id: 'body', label: '본문', elements: variantElements }],
      createdAt: target?.createdAt ?? iso,
      updatedAt: iso,
    };

    const ok = await saveTemplate(template);
    if (ok) {
      setStatus('idle');
      /* 예전에 쌓인 중복이 남아 있으면 알려 준다 — 지우지 않으면 계속 헷갈린다. */
      const leftovers = Math.max(0, duplicates.length - 1);
      setMessage(
        leftovers > 0
          ? `"${template.name}" 덮어씀 — 같은 이름이 ${leftovers}개 더 있습니다. 아래 목록에서 지워 주세요.`
          : target
            ? `"${template.name}" 덮어씀`
            : `"${template.name}" 저장됨`,
      );
      setName('');
      reloadExisting();
    } else {
      setStatus('error');
      setMessage('저장에 실패했습니다. 운영자 권한으로 로그인되어 있는지 확인해 주세요.');
    }
  }, [canSave, duplicates, activeElements, roles, name, category, autoFitBody, reloadExisting]);

  const handleDelete = useCallback(
    async (id: string, tName: string) => {
      if (typeof window !== 'undefined' && !window.confirm(`"${tName}" 템플릿을 삭제할까요?`)) return;
      const ok = await removeTemplate(id);
      if (ok) reloadExisting();
    },
    [reloadExisting],
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[85vh] w-[560px] flex-col rounded-xl border border-[#333] bg-[#1a1a1a] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-200">자막 템플릿 등록</p>
            <p className="mt-0.5 text-[10px] text-gray-500">
              현재 에디터 섹션을 캡처하고, 텍스트 박스마다 역할을 지정합니다
            </p>
          </div>
          <button onClick={onClose} className="text-lg leading-none text-gray-500 hover:text-gray-300">
            ×
          </button>
        </div>

        {/* 이 교회가 쓰는 세트 — 자동 생성(설교대지·말씀찾기·예배 자막 협조·빠른 성경)이 모두 이걸 쓴다 */}
        <div className="mb-3 rounded-md border border-[#2f2f2f] bg-[#141414] p-3">
          <div className="flex items-center gap-2">
            <label className="shrink-0 text-[11px] text-gray-400">이 교회 기본 세트</label>
            <select
              value={activeSet}
              onChange={(e) => {
                setActiveTemplateName(e.target.value);
                setActiveSet(e.target.value);
              }}
              className="h-8 min-w-0 flex-1 rounded-md border border-[#333] bg-[#0a0a0a] px-2 text-xs text-white outline-none focus:border-blue-500"
            >
              {setNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === SEED_TEMPLATE_NAME ? ' (제품 기본)' : ''}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-gray-500">
            자동으로 만들어지는 프로그램이 이 세트를 씁니다. 이 세트에 없는 카테고리는{' '}
            <span className="font-mono text-gray-400">{SEED_TEMPLATE_NAME}</span> 으로 자동 대체되고,
            제품 업데이트는 <span className="font-mono text-gray-400">{SEED_TEMPLATE_NAME}</span> 만 갱신합니다.
          </p>
        </div>

        {activeElements.length === 0 ? (
          <p className="my-8 text-center text-[11px] text-amber-500">
            에디터에서 디자인이 있는 섹션을 먼저 선택해 주세요.
          </p>
        ) : (
          <>
            {/* 카테고리 */}
            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-gray-500">카테고리</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_ORDER.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => changeCategory(cat)}
                    className={`h-7 rounded-md border px-2.5 text-[11px] transition-colors ${
                      category === cat
                        ? 'border-blue-500 bg-blue-600/25 text-blue-200'
                        : 'border-[#333] bg-[#111] text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>

            {/* 이름 */}
            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-gray-500">템플릿 이름</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 성경 기본 하단자막"
                className="h-9 w-full rounded-md border border-[#333] bg-[#0a0a0a] px-3 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500"
              />
              {/* 저장을 누르기 전에 덮어쓰기 여부를 알 수 있게 한다 */}
              {duplicates.length > 0 && (
                <p className="mt-1 text-[10px] leading-relaxed text-amber-400">
                  같은 이름의 {CATEGORY_LABELS[category]} 템플릿이 이미 있습니다 — 저장하면 덮어씁니다.
                  {duplicates.length > 1 && ` (지금 ${duplicates.length}개 중복 · 저장 후 나머지를 지워 주세요)`}
                </p>
              )}
            </div>

            {/* 텍스트 박스 역할 지정 */}
            <div className="mb-3 max-h-44 overflow-auto">
              <label className="mb-1 block text-[11px] text-gray-500">
                텍스트 박스 역할 <span className="text-gray-600">(★ = 주요 슬롯)</span>
              </label>
              {textElements.length === 0 ? (
                <p className="rounded-md border border-[#333] bg-[#111] px-3 py-2 text-[11px] text-gray-600">
                  이 섹션에는 텍스트 박스가 없습니다.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {textElements.map((el) => (
                    <div
                      key={el.id}
                      className="flex items-center gap-2 rounded-md border border-[#333] bg-[#111] px-2.5 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[11px] text-gray-300">
                        {previewText(el)}
                      </span>
                      <select
                        value={roles[el.id] ?? ''}
                        onChange={(e) => setRoles((prev) => ({ ...prev, [el.id]: e.target.value }))}
                        className="h-8 shrink-0 rounded-md border border-[#333] bg-[#0a0a0a] px-2 text-xs text-gray-200 outline-none focus:border-blue-500"
                      >
                        <option value="">정적(고정)</option>
                        {fields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                            {f.required ? ' ★' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
              {nonTextCount > 0 && (
                <p className="mt-2 text-[10px] text-gray-600">
                  배경·도형·이미지 등 {nonTextCount}개 요소는 고정으로 유지됩니다.
                </p>
              )}
            </div>

            <label
              className="mb-3 flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-400"
              title="본문(가사)이 박스를 넘치면 글자 크기를 자동으로 줄여 박스 안에 맞춥니다. 송출·미리보기에 적용됩니다."
            >
              <input
                type="checkbox"
                checked={autoFitBody}
                onChange={(e) => setAutoFitBody(e.target.checked)}
                className="accent-blue-500"
              />
              본문 자동 맞춤 (넘치면 글자 크기 축소)
            </label>

            {message && (
              <p
                className={`mb-2 text-[10px] ${status === 'error' ? 'text-amber-400' : 'text-gray-500'}`}
              >
                {message}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="h-8 rounded-md border border-[#333] bg-[#1a1a1a] px-4 text-xs text-gray-400 hover:text-white"
              >
                취소
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={!canSave || status === 'saving'}
                className="h-8 rounded-md bg-blue-600 px-5 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {status === 'saving' ? '저장 중' : '템플릿 저장'}
              </button>
            </div>
          </>
        )}

        {/* 저장된 템플릿 관리 (목록·썸네일·삭제) */}
        <div className="mt-2 border-t border-[#2a2a2a] pt-3">
          <label className="mb-2 block text-[11px] text-gray-500">
            저장된 템플릿 ({existing.length})
          </label>
          {existing.length === 0 ? (
            <p className="rounded-md border border-[#333] bg-[#111] px-3 py-2 text-[11px] text-gray-600">
              아직 저장된 템플릿이 없습니다.
            </p>
          ) : (
            <div className="grid max-h-52 grid-cols-3 gap-2 overflow-auto pr-1">
              {existing.map((t) => (
                <div key={t.id} className="rounded-md border border-[#333] bg-[#111] p-1.5">
                  <div className="relative">
                    {t.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.thumbnail} alt="" className="h-14 w-full rounded bg-black object-cover" />
                    ) : (
                      <div className="flex h-14 w-full items-center justify-center rounded bg-black text-[10px] text-gray-600">
                        미리보기 없음
                      </div>
                    )}
                    <button
                      onClick={() => void handleDelete(t.id, t.name)}
                      title="삭제"
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-black/70 text-xs leading-none text-gray-300 hover:bg-red-600 hover:text-white"
                    >
                      ×
                    </button>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-gray-200" title={t.name}>
                    {t.name}
                  </p>
                  <p className="text-[10px] text-gray-500">{CATEGORY_LABELS[t.category]}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
