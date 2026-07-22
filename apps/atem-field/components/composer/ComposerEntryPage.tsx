'use client';

import { useEffect, useState } from 'react';
import ComposerLayout from '@/components/composer/ComposerLayout';
import { loadProgramsFromServer } from '@/lib/generators/worshipUploader';
import { DEMO_SETLIST, useStore } from '@/lib/store';

export default function ComposerEntryPage() {
  const [mounted, setMounted] = useState(false);
  const hydrated = useStore((s) => s._hydrated);

  useEffect(() => {
    if (!hydrated) return;

    const state = useStore.getState();

    if (state.setlists.length === 0) {
      state.addSetlist(DEMO_SETLIST);
      state.setCurrentSetlist('demo-setlist');
      state.setActiveItem('item-1');
      state.setActiveSection('sec-1-1');
    } else if (!state.currentSetlistId) {
      const first = state.setlists[0];
      state.setCurrentSetlist(first.id);
      if (first.items[0]) {
        state.setActiveItem(first.items[0].id);
        if (first.items[0].sections[0]) {
          state.setActiveSection(first.items[0].sections[0].id);
        }
      }
    }

    loadProgramsFromServer().then((count) => {
      if (count > 0) console.log(`[UnoLive] 서버에서 ${count}개 프로그램 로드 완료`);
    });

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setMounted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a] text-gray-600">
        불러오는 중...
      </div>
    );
  }

  return <ComposerLayout />;
}
