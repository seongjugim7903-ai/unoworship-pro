'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Section } from '@/lib/types';
import type { TextElement } from '@/lib/canvasTypes';

export interface QuoteReferenceSourceEntry {
  index: number;
  itemTitle: string;
  section: Section;
}

export interface QuoteReferenceItem {
  index: number;
  sectionId: string;
  reference: string;
}

export function isQuoteReferenceProgram(itemTitle: string): boolean {
  return itemTitle.includes('말씀찾기(인용)');
}

function extractReference(section: Section): string {
  const reference = (section.elements ?? []).find(
    (element): element is TextElement =>
      element.type === 'text' &&
      element.fieldRole === 'reference' &&
      element.visible !== false &&
      Boolean(element.content?.trim()),
  );
  return reference?.content?.trim() ?? '';
}

export function getQuoteReferenceItems(entries: QuoteReferenceSourceEntry[]): QuoteReferenceItem[] {
  const seen = new Set<string>();
  const items: QuoteReferenceItem[] = [];

  for (const entry of entries) {
    if (!isQuoteReferenceProgram(entry.itemTitle)) continue;
    const reference = extractReference(entry.section);
    if (!reference || seen.has(entry.section.id)) continue;
    seen.add(entry.section.id);
    items.push({
      index: entry.index,
      sectionId: entry.section.id,
      reference,
    });
  }

  return items;
}

export function useQuoteSectionViewport(
  sectionId: string,
  isQuoteSection: boolean,
  rootRef: RefObject<HTMLDivElement | null>,
  onVisibilityChange: (sectionId: string, visible: boolean) => void,
): RefObject<HTMLDivElement | null> {
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isQuoteSection) return;

    const element = elementRef.current;
    const root = rootRef.current;
    if (!element || !root || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        onVisibilityChange(sectionId, entry.isIntersecting && entry.intersectionRatio > 0);
      },
      { root, threshold: 0.01 },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      onVisibilityChange(sectionId, false);
    };
  }, [isQuoteSection, onVisibilityChange, rootRef, sectionId]);

  return elementRef;
}

interface QuoteReferenceRailProps {
  items: QuoteReferenceItem[];
  width: string;
  visible: boolean;
  broadcastSectionId: string | null;
  broadcastedSectionIds: ReadonlySet<string>;
  onBroadcast: (index: number) => void;
}

interface RailDensity {
  columns: 1 | 2 | 3;
  rowHeight: number;
  referenceFontSize: number;
  circleSize: number;
  headerFontSize: number;
  itemGap: number;
  itemPaddingX: number;
  itemPaddingY: number;
}

function getRailDensity(itemCount: number, height: number, width: number): RailDensity {
  const contentHeight = Math.max(160, height - 54);
  const safeItemCount = Math.max(1, itemCount);
  const widthScale = Math.max(0.68, Math.min(1.16, (width || 180) / 260));
  const preferredColumns: 1 | 2 | 3 =
    width < 150 ? 1 : width > 330 && safeItemCount >= 6 ? 3 : 2;
  const rowCount = Math.max(1, Math.ceil(safeItemCount / preferredColumns));
  const rowHeight = Math.max(34, Math.min(58, contentHeight / rowCount));
  const heightScale = Math.max(0.66, Math.min(1, rowHeight / 58));
  const scale = Math.min(widthScale, heightScale);

  return {
    columns: preferredColumns,
    rowHeight,
    referenceFontSize: Math.round(16 * scale),
    circleSize: Math.round(36 * scale),
    headerFontSize: Math.round(16 * Math.max(0.75, Math.min(1.12, widthScale))),
    itemGap: Math.round(8 * scale),
    itemPaddingX: Math.round(6 * scale),
    itemPaddingY: Math.round(4 * scale),
  };
}

export default function QuoteReferenceRail({
  items,
  width,
  visible,
  broadcastSectionId,
  broadcastedSectionIds,
  onBroadcast,
}: QuoteReferenceRailProps) {
  const railRef = useRef<HTMLElement | null>(null);
  const [railSize, setRailSize] = useState({ width: 0, height: 0 });
  const density = useMemo(
    () => getRailDensity(items.length, railSize.height, railSize.width),
    [items.length, railSize.height, railSize.width],
  );

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setRailSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(rail);
    return () => observer.disconnect();
  }, []);

  return (
    <aside
      ref={railRef}
      aria-label="말씀찾기(인용) 장절 목록"
      aria-hidden={!visible}
      data-testid="quote-reference-rail"
      className={`relative flex h-full min-w-0 flex-none flex-col overflow-hidden bg-black text-white shadow-[-8px_0_24px_rgba(0,0,0,.45)] transition-[width,opacity] duration-300 ease-out ${
        visible
          ? 'pointer-events-auto border-l border-amber-400/50 opacity-100'
          : 'pointer-events-none border-l-0 opacity-0'
      }`}
      style={{ width: visible ? width : '0px' }}
    >
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[#333] px-2 py-2">
        <span className="truncate font-bold text-amber-300" style={{ fontSize: density.headerFontSize }}>
          말씀찾기(인용)
        </span>
        <span className="font-mono text-gray-500" style={{ fontSize: Math.max(11, density.headerFontSize - 1) }}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 text-center text-[12px] leading-relaxed text-gray-600">
          B 키로 말씀을 추가하면<br />번호송출 목록이 표시됩니다.
        </div>
      ) : (
        <ol
          className="grid min-h-0 flex-1 content-start overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            gridTemplateColumns: `repeat(${density.columns}, minmax(0, 1fr))`,
            padding: `${density.itemPaddingY}px ${density.itemPaddingX}px`,
          }}
        >
          {items.map((item) => {
            const isLive = item.sectionId === broadcastSectionId;
            const isBroadcasted = isLive || broadcastedSectionIds.has(item.sectionId);
            return (
              <li
                key={item.sectionId}
                className="min-w-0 border-b border-white/5"
                style={{ minHeight: density.rowHeight, paddingInline: Math.max(2, Math.floor(density.itemPaddingX / 2)) }}
              >
                <button
                  type="button"
                  data-quote-reference-section-id={item.sectionId}
                  aria-label={`${item.index + 1}번 ${item.reference} 송출`}
                  aria-pressed={isBroadcasted}
                  title={`${item.index + 1}번 ${item.reference} 송출`}
                  onClick={() => onBroadcast(item.index)}
                  className={`flex h-full w-full min-w-0 items-center rounded-md text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                    isLive ? 'bg-red-600/15' : isBroadcasted ? 'bg-white/10' : 'hover:bg-white/10'
                  }`}
                  style={{
                    gap: density.itemGap,
                    padding: `${density.itemPaddingY}px ${density.itemPaddingX}px`,
                  }}
                >
                  <span
                    className={`flex flex-none items-center justify-center rounded-full border font-black tabular-nums ${
                      isBroadcasted
                        ? 'border-white bg-white text-black'
                        : 'border-amber-300 bg-amber-400 text-black'
                    }`}
                    style={{ width: density.circleSize, height: density.circleSize, fontSize: Math.max(11, density.referenceFontSize - 1) }}
                  >
                    {item.index + 1}
                  </span>
                  <span
                    className="min-w-0 break-words font-semibold leading-tight text-gray-100"
                    style={{ fontSize: density.referenceFontSize }}
                    title={item.reference}
                  >
                    {item.reference}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
