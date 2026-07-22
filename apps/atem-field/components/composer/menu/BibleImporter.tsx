'use client';

/**
 * components/composer/menu/BibleImporter.tsx
 *
 * 성경 본문을 제품에 기본 탑재하지 않고, 교회가 보유하거나 사용 허가를 받은
 * 본문 텍스트를 직접 붙여넣어 섹션으로 등록한다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import CopyrightComplianceNotice from '@/components/compliance/CopyrightComplianceNotice';
import { useStore } from '@/lib/store';
import type { Section, SetlistItem } from '@/lib/types';
import { makeAdhocTemplate, type SubtitleTemplate } from '@/features/subtitle-template/model';
import { listTemplates } from '@/features/subtitle-template/templateClient';
import { applyBibleTemplate } from '@/features/subtitle-template/templateOverflow';

export function useBibleImporter() {
  const [isOpen, setIsOpen] = useState(false);
  return {
    isOpen,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
  };
}

interface BibleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BibleChapterOption {
  num: number;
  verseCount: number;
}

interface BibleBookOption {
  id: string;
  name: string;
  abbr: string;
  chapters: BibleChapterOption[];
}

interface BibleVersePayload {
  num: number;
  text: string;
}

interface LocalBibleBlock {
  body: string;
  reference: string;
}

function splitBlocks(value: string): string[] {
  return value
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function stripBibleVerseText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/^\s*-\d+\s+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function makeSectionReference(reference: string, firstVerse: number, lastVerse: number): string {
  const colonIndex = reference.indexOf(':');
  const base = (colonIndex >= 0 ? reference.slice(0, colonIndex) : reference.replace(/장\s*$/, '')).trim();
  const range = firstVerse === lastVerse ? `${firstVerse}` : `${firstVerse}-${lastVerse}`;
  return `${base}:${range}`;
}

function buildLocalBibleBlocks(
  payload: { reference?: unknown; verses?: unknown },
  fallbackReference: string,
  versesPerSection: number,
): LocalBibleBlock[] {
  const verses = Array.isArray(payload.verses)
    ? payload.verses.filter((verse): verse is BibleVersePayload =>
      typeof verse === 'object'
      && verse !== null
      && typeof (verse as BibleVersePayload).num === 'number'
      && typeof (verse as BibleVersePayload).text === 'string',
    )
    : [];
  const reference = typeof payload.reference === 'string' ? payload.reference : fallbackReference;
  const size = Math.max(1, versesPerSection);
  const blocks: LocalBibleBlock[] = [];

  for (let index = 0; index < verses.length; index += size) {
    const group = verses.slice(index, index + size);
    const body = group.map((verse) => stripBibleVerseText(verse.text)).filter(Boolean).join('\n');
    if (!body) continue;
    blocks.push({
      body,
      reference: makeSectionReference(reference, group[0].num, group[group.length - 1].num),
    });
  }
  return blocks;
}

export function BibleModal({ isOpen, onClose }: BibleModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const {
    setlists,
    currentSetlistId,
    activeItemId,
    activeSectionId,
    addItem,
    addSection,
    setActiveItem,
    setActiveSection,
  } = useStore();

  const [reference, setReference] = useState('');
  const [body, setBody] = useState('');
  const [quickReference, setQuickReference] = useState('요3:16-18');
  const [versesPerSection, setVersesPerSection] = useState(2);
  const [bookOptions, setBookOptions] = useState<BibleBookOption[]>([]);
  const [selectedBookId, setSelectedBookId] = useState('jhn');
  const [selectedChapter, setSelectedChapter] = useState(3);
  const [selectedStartVerse, setSelectedStartVerse] = useState(16);
  const [selectedEndVerse, setSelectedEndVerse] = useState(18);
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [loadMessage, setLoadMessage] = useState('');
  const [perBlockSection, setPerBlockSection] = useState(true);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [templates, setTemplates] = useState<SubtitleTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [maxCharsPerSlide, setMaxCharsPerSlide] = useState(0);
  const [loadedBibleBlocks, setLoadedBibleBlocks] = useState<LocalBibleBlock[]>([]);

  const blocks = useMemo(() => splitBlocks(body), [body]);
  const canInsert = Boolean(currentSetlistId && reference.trim() && body.trim());
  const templateElements = useMemo(() => {
    if (!currentSetlistId || !activeItemId || !activeSectionId) return [];
    const setlist = setlists.find((item) => item.id === currentSetlistId);
    const activeItem = setlist?.items.find((item) => item.id === activeItemId);
    const activeSection = activeItem?.sections.find((section) => section.id === activeSectionId);
    return activeSection?.elements ?? [];
  }, [setlists, currentSetlistId, activeItemId, activeSectionId]);
  const selectedBook = useMemo(
    () => bookOptions.find((book) => book.id === selectedBookId) ?? bookOptions[0] ?? null,
    [bookOptions, selectedBookId]
  );
  const selectedChapterMeta = useMemo(
    () => selectedBook?.chapters.find((chapter) => chapter.num === selectedChapter) ?? selectedBook?.chapters[0] ?? null,
    [selectedBook, selectedChapter]
  );
  const verseOptions = useMemo(() => {
    const count = selectedChapterMeta?.verseCount ?? 0;
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [selectedChapterMeta]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    async function loadMeta() {
      try {
        const response = await fetch('/api/bible?meta=1');
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.books)) return;
        if (!cancelled) setBookOptions(payload.books);
      } catch {
        // 직접 붙여넣기 모드는 계속 사용할 수 있으므로 조용히 둔다.
      }
    }

    void loadMeta();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // 저장된 성경 카테고리 템플릿 목록을 모달 열릴 때 불러온다.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void listTemplates().then((all) => {
      if (!cancelled) setTemplates(all.filter((t) => t.category === 'bible'));
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!selectedBook) return;
    if (!selectedBook.chapters.some((chapter) => chapter.num === selectedChapter)) {
      setSelectedChapter(selectedBook.chapters[0]?.num ?? 1);
    }
  }, [selectedBook, selectedChapter]);

  useEffect(() => {
    const maxVerse = selectedChapterMeta?.verseCount ?? 1;
    if (selectedStartVerse > maxVerse) setSelectedStartVerse(maxVerse);
    if (selectedEndVerse > maxVerse) setSelectedEndVerse(maxVerse);
    if (selectedEndVerse < selectedStartVerse) setSelectedEndVerse(selectedStartVerse);
  }, [selectedChapterMeta, selectedStartVerse, selectedEndVerse]);

  const handleLoadLocalBible = useCallback(async () => {
    const ref = quickReference.trim();
    if (!ref) {
      setLoadStatus('error');
      setLoadMessage('불러올 장절을 입력해 주세요.');
      return;
    }

    setLoadStatus('loading');
    setLoadMessage('로컬 성경 본문을 찾는 중입니다.');
    setLoadedBibleBlocks([]);

    try {
      const params = new URLSearchParams({
        ref,
        versesPerSection: String(versesPerSection),
      });
      const response = await fetch(`/api/bible?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || '성경 본문을 불러오지 못했습니다.');
      }

      const loadedBlocks = buildLocalBibleBlocks(payload, ref, versesPerSection);
      setReference(payload.reference || ref);
      setBody(loadedBlocks.map((block) => block.body).join('\n\n') || (Array.isArray(payload.sections) ? payload.sections.join('\n\n') : ''));
      setLoadedBibleBlocks(loadedBlocks);
      setPerBlockSection(true);
      setLoadStatus('success');
      setLoadMessage(`${payload.reference || ref} 본문을 ${payload.sections?.length || 0}개 섹션으로 준비했습니다.`);
    } catch (error) {
      setLoadStatus('error');
      setLoadMessage(error instanceof Error ? error.message : '성경 본문을 불러오지 못했습니다.');
    }
  }, [quickReference, versesPerSection]);

  const handleLoadSelectedBible = useCallback(async () => {
    if (!selectedBook) {
      setLoadStatus('error');
      setLoadMessage('설치된 성경 책 정보를 불러오지 못했습니다.');
      return;
    }

    const start = Math.min(selectedStartVerse, selectedEndVerse);
    const end = Math.max(selectedStartVerse, selectedEndVerse);
    setLoadStatus('loading');
    setLoadMessage('선택한 장절을 불러오는 중입니다.');
    setLoadedBibleBlocks([]);

    try {
      const params = new URLSearchParams({
        bookId: selectedBook.id,
        chapter: String(selectedChapter),
        start: String(start),
        end: String(end),
        versesPerSection: String(versesPerSection),
      });
      const response = await fetch(`/api/bible?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || '성경 본문을 불러오지 못했습니다.');
      }

      const fallbackReference = `${selectedBook.abbr}${selectedChapter}:${start}-${end}`;
      const loadedBlocks = buildLocalBibleBlocks(payload, fallbackReference, versesPerSection);
      setQuickReference(payload.reference || fallbackReference);
      setReference(payload.reference || `${selectedBook.name} ${selectedChapter}:${start}-${end}`);
      setBody(loadedBlocks.map((block) => block.body).join('\n\n') || (Array.isArray(payload.sections) ? payload.sections.join('\n\n') : ''));
      setLoadedBibleBlocks(loadedBlocks);
      setPerBlockSection(true);
      setLoadStatus('success');
      setLoadMessage(`${payload.reference || selectedBook.name} 본문을 ${payload.sections?.length || 0}개 섹션으로 준비했습니다.`);
    } catch (error) {
      setLoadStatus('error');
      setLoadMessage(error instanceof Error ? error.message : '성경 본문을 불러오지 못했습니다.');
    }
  }, [
    selectedBook,
    selectedChapter,
    selectedStartVerse,
    selectedEndVerse,
    versesPerSection,
  ]);

  const handleInsert = useCallback(() => {
    if (!currentSetlistId || !reference.trim() || !body.trim()) return;

    const currentSetlist = setlists.find((setlist) => setlist.id === currentSetlistId);
    const activeItem = currentSetlist?.items.find((item) => item.id === activeItemId);
    const isQuoteBible = activeItem?.title.includes('말씀찾기(인용)') && loadedBibleBlocks.length > 0;

    let targetItemId = activeItemId;
    if (!targetItemId) {
      const itemId = `item-${Date.now()}`;
      const newItem: SetlistItem = {
        id: itemId,
        title: `성경 · ${reference.trim()}`,
        sections: [],
      };
      addItem(currentSetlistId, newItem);
      setActiveItem(itemId);
      targetItemId = itemId;
    }

    const now = Date.now();
    let firstSectionId: string | null = null;

    // 선택한 저장 템플릿이 있으면 그것을, 없으면 현재 에디터 디자인을 임시 템플릿으로 사용한다.
    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
    const template = selectedTemplate ?? makeAdhocTemplate(templateElements, 'bible');
    // 템플릿에 '장절표기' 슬롯이 있으면 본문/장절을 분리 바인딩한다(없으면 기존처럼 본문에 헤더 포함).
    const hasRefSlot = template.variants.some((v) =>
      v.elements.some((e) => e.type === 'text' && e.fieldRole === 'reference'),
    );

    const addAll = (sections: Section[], itemId: string) => {
      sections.forEach((section) => {
        if (!firstSectionId) firstSectionId = section.id;
        addSection(currentSetlistId, itemId, section);
      });
    };

    if (perBlockSection || isQuoteBible) {
      const sourceBlocks = isQuoteBible
        ? loadedBibleBlocks
        : (blocks.length ? blocks.map((block) => ({ body: block, reference: reference.trim() })) : [{ body: body.trim(), reference: reference.trim() }]);
      const refText = reference.trim();
      sourceBlocks.forEach((block, index) => {
        const id = `sec-${now}-${index}`;
        // 목록 라벨은 슬라이드 구분을 위해 " · N" 을 붙이되, 화면에 뜨는 장절표기/헤더는 깨끗한 참조만 쓴다.
        const sectionReference = block.reference || refText;
        const label = sourceBlocks.length > 1 ? `${sectionReference} · ${index + 1}` : sectionReference;
        const fields: Record<string, string> = isQuoteBible
          ? (hasRefSlot
            ? { body: block.body, reference: sectionReference, verse: '' }
            : { body: `${sectionReference}\n${block.body}` })
          : (hasRefSlot
            ? (includeHeader ? { body: block.body, reference: sectionReference } : { body: block.body })
            : { body: includeHeader ? `${sectionReference}\n${block.body}` : block.body });
        addAll(
          applyBibleTemplate(template, fields, { idPrefix: id, label, colorMark: '#ffffff', maxCharsPerSlide }),
          targetItemId!,
        );
      });
    } else {
      const id = `sec-${now}`;
      const label = reference.trim();
      const block = body.trim();
      const fields: Record<string, string> = hasRefSlot
        ? (includeHeader ? { body: block, reference: label } : { body: block })
        : { body: includeHeader ? `${label}\n\n${block}` : block };
      addAll(
        applyBibleTemplate(template, fields, { idPrefix: id, label, colorMark: '#ffffff', maxCharsPerSlide }),
        targetItemId,
      );
    }

    if (firstSectionId) setActiveSection(firstSectionId);
    onClose();
  }, [
    setlists,
    currentSetlistId,
    reference,
    body,
    activeItemId,
    templateElements,
    templates,
    selectedTemplateId,
    maxCharsPerSlide,
    perBlockSection,
    blocks,
    loadedBibleBlocks,
    includeHeader,
    addItem,
    addSection,
    setActiveItem,
    setActiveSection,
    onClose,
  ]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex max-h-[85vh] w-[640px] flex-col rounded-xl border border-[#333] bg-[#1a1a1a] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-200">성경 본문 삽입</p>
            <p className="mt-0.5 text-[10px] text-gray-500">교회가 사용 허가를 받은 본문을 직접 입력합니다</p>
          </div>
          <button onClick={onClose} className="text-lg leading-none text-gray-500 hover:text-gray-300">×</button>
        </div>

        <CopyrightComplianceNotice tone="dark" compact className="mb-3" />

        <div className="mb-3 rounded-lg border border-[#333] bg-[#111] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-gray-300">로컬 설치 성경에서 불러오기</p>
              <p className="mt-0.5 text-[10px] text-gray-600">예: 요3:16-18, 창1:1-5, 롬8:28,31-39</p>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-[10px] text-gray-500">
              섹션당 절
              <select
                value={versesPerSection}
                onChange={(e) => setVersesPerSection(Number(e.target.value))}
                className="h-8 rounded-md border border-[#333] bg-[#0a0a0a] px-2 text-xs text-gray-200 outline-none focus:border-blue-500"
              >
                <option value={1}>1절</option>
                <option value={2}>2절</option>
                <option value={3}>3절</option>
                <option value={4}>4절</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <input
              value={quickReference}
              onChange={(e) => setQuickReference(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleLoadLocalBible();
                }
              }}
              placeholder="요3:16-18"
              className="h-9 min-w-0 flex-1 rounded-md border border-[#333] bg-[#0a0a0a] px-3 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500"
            />
            <button
              onClick={() => void handleLoadLocalBible()}
              disabled={loadStatus === 'loading'}
              className="h-9 rounded-md bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadStatus === 'loading' ? '불러오는 중' : '본문 불러오기'}
            </button>
          </div>
          {loadMessage && (
            <p
              className={`mt-2 text-[10px] ${
                loadStatus === 'error'
                  ? 'text-amber-400'
                  : loadStatus === 'success'
                    ? 'text-emerald-400'
                    : 'text-gray-500'
              }`}
            >
              {loadMessage}
            </p>
          )}
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-[11px] text-gray-500">본문 참조</label>
          <input
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
              setLoadedBibleBlocks([]);
            }}
            placeholder="예: 요 3:16-18"
            className="h-9 w-full rounded-md border border-[#333] bg-[#0a0a0a] px-3 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500"
          />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-[11px] text-gray-500">적용 템플릿</label>
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            className="h-9 w-full rounded-md border border-[#333] bg-[#0a0a0a] px-3 text-sm text-gray-200 outline-none focus:border-blue-500"
          >
            <option value="">현재 에디터 디자인</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {templates.length === 0 && (
            <p className="mt-1 text-[10px] text-amber-500">
              저장된 성경문구 템플릿이 없어 현재 에디터 디자인을 사용합니다.
            </p>
          )}
        </div>

        <div className="mb-3 min-h-0 flex-1">
          <label className="mb-1 block text-[11px] text-gray-500">
            본문 텍스트 <span className="text-gray-600">(빈 줄로 섹션 구분)</span>
          </label>
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setLoadedBibleBlocks([]);
            }}
            placeholder="교회가 보유하거나 사용 허가를 받은 성경 본문을 붙여넣어 주세요."
            className="h-[280px] w-full resize-none rounded-md border border-[#333] bg-[#0a0a0a] px-3 py-3 text-sm leading-6 text-gray-100 placeholder-gray-600 outline-none focus:border-blue-500"
          />
        </div>

        <div className="mb-3 flex items-center gap-4 text-xs text-gray-400">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={perBlockSection}
              onChange={(e) => setPerBlockSection(e.target.checked)}
              className="accent-blue-500"
            />
            빈 줄마다 섹션 분리
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={includeHeader}
              onChange={(e) => setIncludeHeader(e.target.checked)}
              className="accent-blue-500"
            />
            참조 헤더 포함
          </label>
          <label className="ml-auto flex items-center gap-1.5" title="본문이 이 글자 수를 넘으면 여러 섹션(슬라이드)으로 자동 분할합니다. 0이면 끔.">
            긴 절 자동 분할
            <input
              type="number"
              min={0}
              step={10}
              value={maxCharsPerSlide}
              onChange={(e) => setMaxCharsPerSlide(Math.max(0, Number(e.target.value) || 0))}
              className="h-7 w-16 rounded-md border border-[#333] bg-[#0a0a0a] px-2 text-xs text-gray-200 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-gray-600">자</span>
          </label>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[10px] text-gray-600">
            {perBlockSection ? `${blocks.length}개 섹션` : '1개 섹션'}으로 추가
            {templateElements.length > 0 ? ` · 현재 에디터 디자인 ${templateElements.length}개 요소 적용` : ''}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="h-8 rounded-md border border-[#333] bg-[#1a1a1a] px-4 text-xs text-gray-400 hover:text-white"
            >
              취소
            </button>
            <button
              onClick={handleInsert}
              disabled={!canInsert}
              className="h-8 rounded-md bg-blue-600 px-5 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              삽입
            </button>
          </div>
        </div>

        {!currentSetlistId && (
          <p className="mt-2 text-center text-[10px] text-amber-500">
            ※ 먼저 좌측 패널에서 예배(세트리스트)를 선택하거나 만들어 주세요.
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
