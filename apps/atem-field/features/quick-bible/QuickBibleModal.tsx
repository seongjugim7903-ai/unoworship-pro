'use client';

// 긴급 말씀찾기 모달 — 송출그리드에서 책장절만 입력하면 로컬 성경DB(/api/bible)에서 본문을 받아
//   섹션 목록으로 만들어 부모에 넘긴다(말씀찾기(인용) 끝 삽입 + 즉시 송출은 useQuickBible 담당).
//   Enter/송출 버튼 = 조회 → 삽입 → 송출. 미리 배치 버튼 = 조회 → 삽입만.
//   ESC = 이 모달만 닫기(그리드 유지).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Section } from '@/lib/types';
import type { SavedProgram } from '@/lib/generators/programTypes';
import { listTemplates } from '@/features/subtitle-template/templateClient';
import { applyBibleTemplate } from '@/features/subtitle-template/templateOverflow';
import { createQuickBibleImageSection } from './quickBibleImageSection';
import QuickBiblePptSearch from './QuickBiblePptSearch';

const BIBLE_TEMPLATE_NAME = 'basic-001';

interface BibleVersePayload {
  num: number;
  text: string;
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
  return `${base}:${firstVerse === lastVerse ? firstVerse : `${firstVerse}-${lastVerse}`}`;
}

interface Props {
  /** 조회 성공 시 — 섹션들. 말씀찾기(인용) 삽입·송출은 부모가 수행 */
  onSubmit: (sections: Section[]) => void;
  /** 조회 성공 시 — 송출하지 않고 말씀찾기(인용) 끝 섹션에만 배치 */
  onPrepare: (sections: Section[]) => void;
  /** PPT 변환본 선택 시 — 말씀찾기(인용) 아래 별도 프로그램 배치는 부모가 수행 */
  onLoadPptProgram: (program: SavedProgram) => void | Promise<void>;
  onClose: () => void;
}

export default function QuickBibleModal({ onSubmit, onPrepare, onLoadPptProgram, onClose }: Props) {
  const [refText, setRefText] = useState('');
  const [versesPer, setVersesPer] = useState(1);
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (shouldBroadcast: boolean) => {
    const q = refText.trim();
    if (!q || busy) return;
    setBusy(true);
    setError('');
    try {
      const [res, templates] = await Promise.all([
        fetch(`/api/bible?ref=${encodeURIComponent(q)}&versesPerSection=${versesPer}`),
        listTemplates(),
      ]);
      const data = await res.json().catch(() => null);
      const blocks: unknown = data?.sections;
      if (!res.ok || !Array.isArray(blocks) || blocks.length === 0) {
        setError(typeof data?.error === 'string' ? data.error : '본문을 찾지 못했습니다 — 예: 요3:16-18');
        return;
      }

      const template = templates.find(
        (item) => item.category === 'bible' && item.name === BIBLE_TEMPLATE_NAME,
      );
      if (!template) {
        setError('성경문구 ' + BIBLE_TEMPLATE_NAME + ' 템플릿을 찾지 못했습니다');
        return;
      }

      const reference: string = typeof data.reference === 'string' ? data.reference : q;
      const versePayloads: unknown[] = Array.isArray(data.verses) ? data.verses : [];
      const verses = versePayloads
        .filter((verse): verse is BibleVersePayload =>
          typeof verse === 'object'
          && verse !== null
          && typeof (verse as BibleVersePayload).num === 'number'
          && typeof (verse as BibleVersePayload).text === 'string',
        );
      const now = Date.now();
      const sections: Section[] = (blocks as string[]).flatMap((block, i) => {
        const group = verses.slice(i * versesPer, (i + 1) * versesPer);
        const body = group.length > 0
          ? group.map((verse) => stripBibleVerseText(verse.text)).filter(Boolean).join('\n')
          : block;
        const sectionReference = group.length > 0
          ? makeSectionReference(reference, group[0].num, group[group.length - 1].num)
          : reference;
        return applyBibleTemplate(
          template,
          { body, reference: sectionReference, verse: '' },
          {
            idPrefix: `sec-quick-${now}-${i}`,
            label: blocks.length > 1 ? `${sectionReference} · ${i + 1}` : sectionReference,
            colorMark: '#ffffff',
          },
        );
      });
      if (shouldBroadcast) {
        onSubmit(sections);
      } else {
        onPrepare(sections);
      }
      onClose();
    } catch {
      setError('성경 API 호출 실패 — 서버 상태를 확인하세요');
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file: File | null | undefined) => {
    if (!file || busy || imageBusy) return;
    setImageBusy(true);
    setError('');
    try {
      const section = await createQuickBibleImageSection(file);
      onSubmit([section]);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '이미지를 인용 프로그램에 추가하지 못했습니다.');
    } finally {
      setImageBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100dvh-40px)] w-[640px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-2xl border border-[#333] bg-[#151515] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-amber-400">⚡ 긴급 말씀찾기</p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              책장절 입력 + Enter = 성경문구 {BIBLE_TEMPLATE_NAME} 적용 · 말씀찾기(인용) 끝에 추가 · 즉시 송출
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" title="닫기 (ESC)">✕</button>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={refText}
            onChange={(e) => setRefText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void submit(true); }
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
            }}
            placeholder="예: 요3:16-18, 시23, 롬8:28"
            className="h-11 flex-1 rounded-lg border border-[#3a3a3a] bg-[#0a0a0a] px-3 text-base text-white
                       placeholder-gray-600 focus:border-amber-500 focus:outline-none"
          />
          <select
            value={versesPer}
            onChange={(e) => setVersesPer(Number(e.target.value))}
            className="h-11 rounded-lg border border-[#3a3a3a] bg-[#0a0a0a] px-2 text-sm text-gray-300 focus:outline-none"
            title="섹션당 절 수"
          >
            <option value={1}>1절</option>
            <option value={2}>2절</option>
            <option value={3}>3절</option>
          </select>
        </div>

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void submit(false)}
            disabled={busy || imageBusy || !refText.trim()}
            className="h-11 rounded-lg border border-amber-700 bg-[#211807] px-3 text-sm font-bold text-amber-100
                       transition-colors hover:bg-[#32240b] disabled:opacity-40"
          >
            {busy ? '불러오는 중…' : '인용 끝에 미리 배치'}
          </button>
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={busy || imageBusy || !refText.trim()}
            className="h-11 rounded-lg bg-amber-600 px-3 text-sm font-bold text-white
                       transition-colors hover:bg-amber-500 disabled:opacity-40"
          >
            {busy ? '불러오는 중…' : '인용 끝에 삽입 + 송출'}
          </button>
        </div>

        <div className="my-4 h-px bg-[#2a2a2a]" />

        <QuickBiblePptSearch onLoadProgram={onLoadPptProgram} />

        <div className="my-4 h-px bg-[#2a2a2a]" />

        <div className="rounded-xl border border-[#2e3b45] bg-[#0b1117] p-3">
          <div className="mb-2">
            <p className="text-sm font-bold text-sky-300">이미지 업로드</p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              PNG/JPG 이미지를 말씀찾기(인용) 마지막 섹션에 추가하고 저장한 뒤 즉시 송출합니다.
            </p>
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => void uploadImage(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={busy || imageBusy}
            className="h-10 w-full rounded-lg border border-sky-700 bg-sky-950/70 text-sm font-bold text-sky-100
                       transition-colors hover:bg-sky-800 disabled:opacity-40"
          >
            {imageBusy ? '이미지 추가 중…' : '이미지 선택 + 인용 끝에 삽입 + 송출'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
