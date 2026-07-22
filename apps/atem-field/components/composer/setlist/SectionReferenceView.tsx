'use client';
// 송출번호 참조 패널 — 우클릭으로 지정한 프로그램의 전 섹션을 "전역 송출순번 - 책장절(label)"로 나열.
//   행 클릭 한 번 = 송출, 송출 중인 행은 활성 표시, 활성 상태에서 PageUp/Down 으로 이동 송출.
//   송출된 행은 맨 앞 사각 박스에 자동 체크(수동 토글로 해제 가능).
//   송출 기능 자체는 features/section-broadcast/referenceBroadcast.ts 에 분리되어 있다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { Section } from '@/lib/types';
import type { TextElement } from '@/lib/canvasTypes';
import {
  isLayerOutputWorkspaceItem,
  isLayerOutputWorkspaceSection,
} from '@/lib/layerOutputWorkspace';
import { isProgramBackgroundSection } from '@/lib/programBackground';
import { useReferencePanelBroadcast } from '@/features/section-broadcast/referenceBroadcast'; // [FEATURE: REF_BROADCAST]

/** 섹션이 담은 절 번호 추출 — 본문 "26. …" 우선, 없으면 라벨의 숫자("26"/"26절").
 *  성경 임포터 슬라이드는 본문이 절 번호로 시작하고, 우리 말씀찾기 섹션은 라벨이 곧 절 번호. */
function extractVerses(section: Section): number[] {
  const nums: number[] = [];
  const re = /(?:^|\n)\s*(\d{1,3})[.．]\s/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section.text)) !== null) nums.push(Number(m[1]));
  if (nums.length > 0) return nums;
  const lm = (section.label || '').match(/^(\d{1,3})\s*절?$/);
  if (lm) return [Number(lm[1])];
  return [];
}

/** 섹션 요소의 장절표기(fieldRole='reference') 내용 — "단2:1", "마 26:26-28" 등 (책·장 출처) */
function sectionReferenceStr(section: Section): string {
  for (const el of section.elements) {
    if (el.type === 'text') {
      const t = el as TextElement;
      if (t.fieldRole === 'reference' && t.content?.trim()) return t.content.trim();
    }
  }
  return '';
}

/** 대지타이틀 섹션이면 문장 그대로 돌려준다 — "1. 골고다의 언덕"의 앞 번호를 절로 오인하지 않게. */
function pointTitleText(section: Section): string | null {
  for (const el of section.elements) {
    if (el.type === 'text') {
      const t = el as TextElement;
      if (t.fieldRole === 'point' && t.content?.trim()) return t.content.trim();
    }
  }
  // 템플릿 미등록 폴백(fieldRole 없음) 대비 — 생성기가 붙인 라벨("대지 N")로 판별
  if (/^대지\s*\d+$/.test(section.label || '')) {
    const first = (section.text || '').split('\n')[0].trim();
    if (first) return first;
  }
  return null;
}

/** 표시 라벨 = "책장:절" 전체 표기. 장절표기 요소의 책·장 + 실제 절 번호를 합친다.
 *  범위 표기(마 26:26-28)는 절을 본문에서 뽑아 합치고, 절 단위(단2:1)는 그대로. */
function deriveRefLabel(section: Section, verses: number[]): string {
  // 대지타이틀은 절 번호 표기가 아니라 문장 그대로 (예: "1. 골고다의 언덕" — "1절" 아님)
  const point = pointTitleText(section);
  if (point) return point;

  const refStr = sectionReferenceStr(section);
  const src = refStr || section.label || '';
  const colon = src.indexOf(':');
  const bookChapter = colon > 0 ? src.slice(0, colon).trim() : '';

  if (bookChapter && verses.length === 1) return `${bookChapter}:${verses[0]}`;
  if (bookChapter && verses.length > 1) {
    const contiguous = verses.every((n, i) => i === 0 || n === verses[i - 1] + 1);
    return contiguous
      ? `${bookChapter}:${verses[0]}-${verses[verses.length - 1]}`
      : `${bookChapter}:${verses.join(',')}`;
  }
  if (refStr) return refStr;
  if (verses.length === 1) return `${verses[0]}절`;
  return section.label || '(제목 없음)';
}

export default function SectionReferenceView() {
  const setlists = useStore((s) => s.setlists);
  const currentSetlistId = useStore((s) => s.currentSetlistId);
  const referenceItemId = useStore((s) => s.referenceItemId);
  const setReferenceItemId = useStore((s) => s.setReferenceItemId);

  const currentSetlist = setlists.find((s) => s.id === currentSetlistId);
  const item = currentSetlist?.items.find((i) => i.id === referenceItemId);

  // 찾은 본문 표시(마킹) — sectionId 기준. 패널 열려있는 동안 유지(닫으면 초기화).
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const toggleMark = (id: string) =>
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // 전역 송출 순번(번호칸 입력값과 동일, 1-based) 기준으로 해당 프로그램 섹션만 추출.
  //   순번 계산은 SetlistPanel 의 allSections flatten 과 "완전히" 동일 규칙이어야 한다
  //   (layer-workspace 제외 + 프로그램 배경 섹션 제외). 규칙이 어긋나면 클릭/PageDown 이
  //   다음 섹션을 쏘는 오프바이원이 생긴다 — 2026-07-09 실사고.
  const rows = useMemo(() => {
    if (!currentSetlist || !referenceItemId) return [];
    let globalIndex = 0;
    const out: { num: number; label: string; verses: number[]; sectionId: string }[] = [];
    for (const it of currentSetlist.items) {
      if (isLayerOutputWorkspaceItem(it)) continue;
      for (const section of it.sections) {
        if (isLayerOutputWorkspaceSection(section)) continue;
        if (isProgramBackgroundSection(section)) continue;
        globalIndex += 1;
        if (it.id === referenceItemId) {
          const verses = extractVerses(section);
          out.push({ num: globalIndex, label: deriveRefLabel(section, verses), verses, sectionId: section.id });
        }
      }
    }
    return out;
  }, [currentSetlist, referenceItemId]);

  // 이 프로그램에 절 번호를 가진 섹션이 있는지 (절 입력칸 표시 조건)
  const hasVerses = useMemo(() => rows.some((r) => r.verses.length > 0), [rows]);

  // [FEATURE: REF_BROADCAST] 클릭 송출 + 활성(송출 중) 행 + PageUp/Down 이동 송출
  const { activeSectionId, sendRow } = useReferencePanelBroadcast(rows);

  // 절 번호 송출 — 목사님이 "23절 봅시다" 하면 23 치고 Enter → 그 절 담은 섹션 송출.
  //   전역 번호칸과 별개(안전). 같은 절이 여러 행에 있으면 첫 행.
  const [verseQuery, setVerseQuery] = useState('');
  const verseInputRef = useRef<HTMLInputElement | null>(null);
  const handleVerseKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const v = parseInt(verseQuery, 10);
    if (Number.isNaN(v)) return;
    const row = rows.find((r) => r.verses.includes(v));
    if (row) sendRow(row.num);
    setVerseQuery('');
  };

  // 송출된 행은 자동 체크 (수동 토글로 해제 가능) — 스토어 broadcastSection 구독 콜백에서 갱신
  useEffect(() => {
    const unsubscribe = useStore.subscribe((state, prevState) => {
      const sent = state.broadcastSection;
      if (!sent || sent.sectionId === prevState.broadcastSection?.sectionId) return;
      setMarked((prev) => {
        if (prev.has(sent.sectionId)) return prev;
        const next = new Set(prev);
        next.add(sent.sectionId);
        return next;
      });
    });
    return unsubscribe;
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#111111] border-l border-[#222222] text-white">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#222222]">
        <span className="text-sm font-medium truncate">{item?.title ?? '송출번호 참조'}</span>
        <span className="text-xs text-gray-500">({rows.length})</span>
        <button
          type="button"
          onClick={() => setReferenceItemId(null)}
          className="ml-auto text-gray-500 hover:text-white text-sm flex-shrink-0"
          title="닫기 (컨트롤 패널로)"
        >
          ✕
        </button>
      </div>

      {/* 절 번호 송출 — "23절 봅시다" → 23 Enter. 절이 있는 프로그램일 때만 표시. */}
      {hasVerses && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#222222] bg-[#0d0d0d]">
          <span className="text-[10px] font-bold leading-none text-red-400">절 송출</span>
          <div className="flex items-center gap-1 rounded border border-[#333] bg-[#0a0a0a] pl-1.5 focus-within:border-red-500">
            <input
              ref={verseInputRef}
              type="number"
              min={1}
              value={verseQuery}
              placeholder="절"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setVerseQuery(e.target.value)}
              onKeyDown={handleVerseKey}
              style={{ width: 44 }}
              className="border-0 bg-transparent px-0.5 py-1 text-center text-xs text-white placeholder-gray-600 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="pr-1.5 text-[10px] leading-none text-gray-500">↵</span>
          </div>
          <span className="text-[10px] text-gray-500">절 번호 → 그 절 송출</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {rows.length === 0 ? (
          <p className="text-xs text-gray-600 px-2 py-4">표시할 섹션이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {rows.map((r) => {
              const isMarked = marked.has(r.sectionId);
              const isLive = activeSectionId === r.sectionId;
              return (
                <li
                  key={r.sectionId}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded transition-colors ${
                    isLive
                      ? 'bg-red-500/15 border border-red-500'
                      : 'border border-transparent hover:bg-[#1a1a1a]'
                  }`}
                >
                  {/* 송출 이력 체크 박스 — 송출되면 자동 체크, 클릭으로 수동 토글 */}
                  <button
                    type="button"
                    onClick={() => toggleMark(r.sectionId)}
                    className={`flex-shrink-0 w-5 h-5 rounded border transition-colors ${
                      isMarked
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-[#3a3a3a] hover:border-[#555]'
                    }`}
                    title={isMarked ? '체크 해제' : '송출 이력 체크'}
                    aria-pressed={isMarked}
                  />
                  {/* 행 클릭 한 번 = 송출. 송출 중이면 활성(빨강) — PageUp/Down 으로 이동 송출 */}
                  <button
                    type="button"
                    onClick={() => sendRow(r.num)}
                    className="flex flex-1 min-w-0 items-center gap-2 text-left"
                    title={`${r.num}번 송출`}
                  >
                    <span className={`min-w-[2.75rem] text-right font-mono text-base ${isLive ? 'text-red-300 font-bold' : 'text-blue-300'}`}>
                      {r.num}
                    </span>
                    <span className="text-gray-600">-</span>
                    <span className={`text-base truncate ${isLive ? 'text-white font-semibold' : isMarked ? 'text-white font-medium' : ''}`}>
                      {r.label}
                    </span>
                    {isLive && (
                      <span className="ml-auto flex-shrink-0 text-[9px] font-bold tracking-widest text-red-400">
                        LIVE
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
