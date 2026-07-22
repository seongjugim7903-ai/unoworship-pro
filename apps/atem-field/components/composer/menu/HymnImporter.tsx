'use client';

/**
 * components/composer/menu/HymnImporter.tsx
 *
 * 찬송가/찬양곡 가사 DB를 제품에 기본 탑재하지 않고, 교회가 보유하거나
 * 사용 허가를 받은 텍스트를 직접 붙여넣어 섹션으로 등록한다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CopyrightComplianceNotice from '@/components/compliance/CopyrightComplianceNotice';
import { useStore } from '@/lib/store';
import type { SetlistItem } from '@/lib/types';
import { applyTemplate } from '@/features/subtitle-template/applyTemplate';
import { makeAdhocTemplate, type SubtitleTemplate } from '@/features/subtitle-template/model';
import { listTemplates } from '@/features/subtitle-template/templateClient';

export function useHymnImporter() {
  const [isOpen, setIsOpen] = useState(false);
  return {
    isOpen,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
  };
}

interface HymnModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HymnSearchItem {
  num: number;
  title: string;
  lineCount: number;
  sectionCount: number;
  preview: string;
}

interface HymnDetail {
  num: number;
  title: string;
  lyrics: string;
  lines: string[];
  sections: string[];
}

function splitBlocks(value: string): string[] {
  return value
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/**
 * 찬송가 가사 정리:
 *  - 줄 앞의 절 번호 표기("(1)", "(2)" …)를 제거한다(가사 본문은 유지).
 *  - 줄 앞의 후렴 표기("후렴 : …", "후렴:", "(후렴) …")를 제거한다(가사 본문은 유지).
 *  - 마지막 절 끝에 "아멘"이 없으면 붙인다.
 *
 * [FEATURE: HYMN_VERSE_REFRAIN] 절/후렴을 원곡 구조(절-후렴-절-후렴 반복)로 재구성하고
 * 아멘을 별도 스타일 슬롯으로 분리하는 전체 로직은 자동 생성기(worshipServiceGenerator.ts)에만
 * 적용되어 있다 — 이 도구는 자유 텍스트 붙여넣기 구조라 절 번호 제거까지만 동일하게 맞춘다.
 */
function cleanHymnLyrics(raw: string): string {
  // 개행은 유지하기 위해 줄 앞 공백/탭만 소비하며 절 번호·후렴 표기를 제거.
  let text = raw.replace(/^[ \t]*\(?\d+\)[ \t]*/gm, '');
  text = text.replace(/^[ \t]*\(?후렴\)?[ \t]*[:：]?[ \t]*/gm, '');
  text = text.trimEnd();
  if (text && !/아멘[.!]?\s*$/.test(text)) text += ' 아멘';
  return text;
}

export function HymnModal({ isOpen, onClose }: HymnModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const {
    currentSetlistId,
    activeItemId,
    setlists,
    addItem,
    addSection,
    updateItem,
    setActiveItem,
    setActiveSection,
  } = useStore();

  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [perBlockSection, setPerBlockSection] = useState(true);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [textOnly, setTextOnly] = useState(false); // 번호·곡명 없이 붙여넣은 텍스트만 섹션으로 삽입
  const [templates, setTemplates] = useState<SubtitleTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [maxCharsPerSlide, setMaxCharsPerSlide] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HymnSearchItem[]>([]);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'ready' | 'not-installed' | 'error'>('idle');
  const [searchError, setSearchError] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setTimeout(() => titleInputRef.current?.focus(), 100);
  }, [isOpen]);

  // 저장된 찬송 카테고리 템플릿 목록을 모달 열릴 때 불러온다.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void listTemplates().then((all) => {
      if (!cancelled) setTemplates(all.filter((t) => t.category === 'hymn'));
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const blocks = useMemo(() => splitBlocks(lyrics), [lyrics]);
  const contentTitle = number.trim()
    ? `${number.trim()}장${title.trim() ? ` - ${title.trim()}` : ''}`
    : title.trim();
  // 텍스트 모드면 번호/곡명(contentTitle) 없이도 붙여넣은 텍스트만으로 삽입 허용.
  const canInsert = Boolean(currentSetlistId && lyrics.trim() && (textOnly || contentTitle));

  const searchLocalHymns = useCallback(async () => {
    setSearchStatus('loading');
    setSearchError('');
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      params.set('limit', '50');
      const res = await fetch(`/api/hymn?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setSearchStatus('not-installed');
          setSearchResults([]);
          setSearchError(data.message || '로컬 설치 자료가 없습니다.');
          return;
        }
        throw new Error(data.message || data.error || '찬송가 검색 실패');
      }
      setSearchResults(Array.isArray(data.hymns) ? data.hymns : []);
      setSearchStatus('ready');
    } catch (error) {
      setSearchResults([]);
      setSearchStatus('error');
      setSearchError(error instanceof Error ? error.message : '찬송가 검색 실패');
    }
  }, [searchQuery]);

  const loadLocalHymn = useCallback(async (num: number) => {
    setSearchStatus('loading');
    setSearchError('');
    try {
      const res = await fetch(`/api/hymn?num=${num}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || '찬송가 불러오기 실패');
      const hymn = data.hymn as HymnDetail;
      setNumber(String(hymn.num));
      setTitle(hymn.title);
      // 출처 문구를 자동으로 채우지 않는다(자막/프로그램에 "로컬 설치 …" 문장이 유입되지 않게).
      // 실제 출처·허가 정보가 필요하면 사용자가 아래 '출처/허가 정보' 칸에 직접 입력한다.
      setSource('');
      setLyrics(cleanHymnLyrics((hymn.sections?.length ? hymn.sections : [hymn.lyrics]).join('\n\n')));
      setPerBlockSection(true);   // 빈 줄 기준으로 섹션 분리(두 줄짜리 가사 블록 = 한 섹션)
      setIncludeHeader(false);    // 몇장·제목을 섹션 본문에 넣지 않는다(가사만 깨끗하게 섹션화)
      setSearchStatus('ready');
    } catch (error) {
      setSearchStatus('error');
      setSearchError(error instanceof Error ? error.message : '찬송가 불러오기 실패');
    }
  }, []);

  const handleInsert = useCallback(() => {
    if (!currentSetlistId || !lyrics.trim() || (!textOnly && !contentTitle)) return;

    // 번호/곡명이 없을 때 라벨·제목용 대체값.
    const baseTitle = contentTitle || '텍스트';
    // 프로그램 제목: 번호 있으면 "345장", 곡명 있으면 "찬양 · 곡명", 둘 다 없으면(텍스트 모드) "텍스트".
    const programTitle = number.trim()
      ? `${number.trim()}장`
      : (contentTitle ? `찬양 · ${contentTitle}` : '텍스트');

    let targetItemId = activeItemId;
    if (!targetItemId) {
      const id = `item-${Date.now()}`;
      const newItem: SetlistItem = {
        id,
        title: programTitle,
        sections: [],
      };
      addItem(currentSetlistId, newItem);
      setActiveItem(id);
      targetItemId = id;
    } else {
      // 활성 프로그램이 비어 있으면(기본 '새 프로그램' 등) 찬송가 이름으로 바꿔준다.
      const activeItem = setlists
        .find((sl) => sl.id === currentSetlistId)
        ?.items.find((it) => it.id === targetItemId);
      if (activeItem && (activeItem.sections?.length ?? 0) === 0) {
        updateItem(currentSetlistId, targetItemId, { title: programTitle });
      }
    }

    const now = Date.now();
    const sourceBlocks = perBlockSection ? (blocks.length ? blocks : [lyrics.trim()]) : [lyrics.trim()];
    let firstSectionId: string | null = null;

    // 템플릿을 고르면 그것을, 아니면 빈 템플릿(기존처럼 디자인 없음)을 통과시킨다.
    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
    const template = selectedTemplate ?? makeAdhocTemplate([], 'hymn');
    // 제목/장 등 본문 외 슬롯이 있으면 구조화 바인딩, 없으면 기존 헤더-in-본문 유지.
    const roleSet = new Set<string>();
    template.variants.forEach((v) =>
      v.elements.forEach((e) => {
        if (e.type === 'text' && e.fieldRole) roleSet.add(e.fieldRole);
      }),
    );
    const hasStructuredSlots = [...roleSet].some((r) => r !== 'body');

    sourceBlocks.forEach((block, index) => {
      const sectionId = `sec-${now}-${index}`;
      const label = sourceBlocks.length > 1 ? `${baseTitle} · ${index + 1}` : baseTitle;

      let fields: Record<string, string>;
      if (hasStructuredSlots) {
        fields = { body: block };
        if (includeHeader) {
          if (title.trim()) fields.title = title.trim();
          if (number.trim()) fields.number = number.trim();
          if (source.trim()) fields.copyright = source.trim();
        }
      } else {
        const headerLines = [label, source.trim() ? `출처/허가: ${source.trim()}` : ''].filter(Boolean);
        fields = { body: includeHeader ? `${headerLines.join('\n')}\n\n${block}` : block };
      }

      const sections = applyTemplate(
        template,
        { fields },
        { idPrefix: sectionId, label, colorMark: '#ffffff', maxCharsPerSlide },
      );
      sections.forEach((section) => {
        if (!firstSectionId) firstSectionId = section.id;
        addSection(currentSetlistId, targetItemId!, section);
      });
    });

    if (firstSectionId) setActiveSection(firstSectionId);
    onClose();
  }, [
    currentSetlistId,
    contentTitle,
    textOnly,
    lyrics,
    activeItemId,
    setlists,
    perBlockSection,
    blocks,
    source,
    title,
    number,
    templates,
    selectedTemplateId,
    maxCharsPerSlide,
    includeHeader,
    addItem,
    addSection,
    updateItem,
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
        className="flex max-h-[85vh] w-[620px] flex-col rounded-xl border border-[#333] bg-[#1a1a1a] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-200">찬송/찬양 자료 삽입</p>
            <p className="mt-0.5 text-[10px] text-gray-500">가사 DB는 제공하지 않고, 허가받은 텍스트만 직접 입력합니다</p>
          </div>
          <button onClick={onClose} className="text-lg leading-none text-gray-500 hover:text-gray-300">×</button>
        </div>

        <CopyrightComplianceNotice tone="dark" compact className="mb-3" />

        <div className="mb-3 rounded-lg border border-[#333] bg-[#111] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-gray-300">로컬 설치 찬송가 검색</p>
              <p className="mt-0.5 text-[10px] text-gray-600">선택하면 2줄 단위 자막 섹션으로 불러옵니다</p>
            </div>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
              Local only
            </span>
          </div>
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') searchLocalHymns();
              }}
              placeholder="번호 또는 제목 검색"
              className="h-8 min-w-0 flex-1 rounded-md border border-[#333] bg-[#0a0a0a] px-3 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500"
            />
            <button
              onClick={searchLocalHymns}
              disabled={searchStatus === 'loading'}
              className="h-8 rounded-md border border-[#333] bg-[#1a1a1a] px-3 text-xs text-gray-300 hover:border-[#555] hover:text-white disabled:opacity-50"
            >
              {searchStatus === 'loading' ? '확인 중' : '검색'}
            </button>
          </div>
          {searchError && (
            <p className={`mt-2 text-[10px] ${searchStatus === 'not-installed' ? 'text-amber-400' : 'text-red-400'}`}>
              {searchError}
            </p>
          )}
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-28 overflow-y-auto rounded-md border border-[#222]">
              {searchResults.map((item) => (
                <button
                  key={item.num}
                  onClick={() => loadLocalHymn(item.num)}
                  className="block w-full border-b border-[#222] px-3 py-2 text-left text-xs text-gray-300 hover:bg-[#1d2636] last:border-b-0"
                >
                  <span className="font-semibold text-white">{item.num}장 · {item.title || '제목 없음'}</span>
                  <span className="ml-2 text-[10px] text-gray-500">{item.sectionCount}개 섹션</span>
                  {item.preview && <span className="mt-0.5 block truncate text-[10px] text-gray-500">{item.preview.replace(/\n/g, ' / ')}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-3 grid grid-cols-[100px_minmax(0,1fr)] gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-gray-500">번호</span>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="선택"
              className="h-9 w-full rounded-md border border-[#333] bg-[#0a0a0a] px-3 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-gray-500">곡명</span>
            <input
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="찬송가 또는 찬양곡 제목"
              className="h-9 w-full rounded-md border border-[#333] bg-[#0a0a0a] px-3 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500"
            />
          </label>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-[11px] text-gray-500">출처/허가 정보</label>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="예: CCLI 번호, 권리자 허가번호, 교회 보유 자료"
            className="h-9 w-full rounded-md border border-[#333] bg-[#0a0a0a] px-3 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500"
          />
        </div>

        {templates.length > 0 && (
          <div className="mb-3">
            <label className="mb-1 block text-[11px] text-gray-500">적용 템플릿</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="h-9 w-full rounded-md border border-[#333] bg-[#0a0a0a] px-3 text-sm text-gray-200 outline-none focus:border-blue-500"
            >
              <option value="">디자인 없음(기존)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="mb-3 min-h-0 flex-1">
          <label className="mb-1 block text-[11px] text-gray-500">
            가사/텍스트 <span className="text-gray-600">(빈 줄로 섹션 구분)</span>
          </label>
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder="교회가 보유하거나 사용 허가를 받은 가사를 붙여넣어 주세요."
            className="h-[260px] w-full resize-none rounded-md border border-[#333] bg-[#0a0a0a] px-3 py-3 text-sm leading-6 text-gray-100 placeholder-gray-600 outline-none focus:border-blue-500"
          />
        </div>

        <div className="mb-3 flex items-center gap-4 text-xs text-gray-400">
          <label className="flex cursor-pointer items-center gap-1.5" title="번호·곡명 없이 붙여넣은 텍스트만 섹션으로 삽입합니다.">
            <input
              type="checkbox"
              checked={textOnly}
              onChange={(e) => setTextOnly(e.target.checked)}
              className="accent-blue-500"
            />
            텍스트
          </label>
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
            곡명/허가 정보 포함
          </label>
          <label className="ml-auto flex items-center gap-1.5" title="가사가 이 글자 수를 넘으면 여러 섹션(슬라이드)으로 자동 분할합니다. 0이면 끔.">
            긴 가사 자동 분할
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
