'use client';

import type { SetlistItem } from '@/lib/types';

const QUICK_BIBLE_QUOTE_TITLE = '말씀찾기(인용)';

function cloneItem<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function createQuoteItem(dateText: string, now: number): SetlistItem {
  const datePrefix = dateText.replace(/\D/g, '').slice(0, 8);
  return {
    id: `item-quick-quote-ppt-anchor-${now}`,
    title: datePrefix.length === 8 ? `${datePrefix}-${QUICK_BIBLE_QUOTE_TITLE}` : QUICK_BIBLE_QUOTE_TITLE,
    sections: [],
    promptLayout: 'bible',
  };
}

export function isQuickBibleQuoteItem(item: Pick<SetlistItem, 'title'>): boolean {
  return item.title.includes(QUICK_BIBLE_QUOTE_TITLE);
}

export interface QuickBiblePptPlacementResult {
  items: SetlistItem[];
  placedItemId: string;
  firstSectionId: string | null;
  quoteItemCreated: boolean;
}

export function placePptProgramBelowQuickBibleQuote(
  currentItems: SetlistItem[],
  pptItem: SetlistItem,
  options: { dateText: string; now?: number },
): QuickBiblePptPlacementResult {
  const now = options.now ?? Date.now();
  const placedItem = cloneItem(pptItem);
  const withoutExisting = currentItems.filter((item) => item.id !== placedItem.id);
  let quoteItemCreated = false;
  let nextItems = withoutExisting;
  let quoteIndex = nextItems.findIndex(isQuickBibleQuoteItem);

  if (quoteIndex < 0) {
    quoteItemCreated = true;
    quoteIndex = nextItems.length;
    nextItems = [...nextItems, createQuoteItem(options.dateText, now)];
  }

  return {
    items: [
      ...nextItems.slice(0, quoteIndex + 1),
      placedItem,
      ...nextItems.slice(quoteIndex + 1),
    ],
    placedItemId: placedItem.id,
    firstSectionId: placedItem.sections[0]?.id ?? null,
    quoteItemCreated,
  };
}
