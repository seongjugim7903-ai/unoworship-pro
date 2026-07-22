'use client';

import { createElement, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '@/lib/store';
import type { SavedProgram } from '@/lib/generators/programTypes';
import type { Section, SetlistItem } from '@/lib/types';
import FixedProgramModal, { type FixedProgramAction } from './FixedProgramModal';

interface SourceSection {
  itemId: string;
  section: Section;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function slugify(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9가-힣]+/g, '-').replace(/^-|-$/g, '') || 'program';
}

/** 고정 자료를 현재 세트리스트에 넣을 때 ID와 clipMask 연결을 새로 만든다. */
function cloneForPlacement(source: SetlistItem): SetlistItem {
  const placementId = `fixed-${slugify(source.title)}-${Date.now()}`;
  const item = clone(source);
  item.id = placementId;
  item.sections = item.sections.map((section, sectionIndex) => {
    const sectionId = `${placementId}-section-${sectionIndex + 1}`;
    const idMap = new Map(section.elements.map((element) => [element.id, `${sectionId}-${element.id}`]));
    return {
      ...section,
      id: sectionId,
      elements: section.elements.map((element) => ({
        ...element,
        id: idMap.get(element.id) ?? `${sectionId}-${element.id}`,
        ...(element.clipMaskId && idMap.has(element.clipMaskId)
          ? { clipMaskId: idMap.get(element.clipMaskId) }
          : {}),
      })),
    };
  });
  return item;
}

async function savePlacement(program: SavedProgram, setlistId: string, setlistName: string, item: SetlistItem) {
  const now = Date.now();
  const record: SavedProgram = {
    id: item.id,
    type: 'worship',
    worshipId: setlistId,
    worshipName: setlistName.trim() || '이름 없는 워십',
    formData: {
      ...program.formData,
      generator: 'fixed-program-placement-v1',
      fixedSourceId: program.id,
      savedFromBroadcastGrid: true,
      preserveElements: true,
    },
    item: clone(item),
    createdAt: now,
    updatedAt: now,
  };
  const response = await fetch('/api/programs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (!response.ok) throw new Error(`고정 프로그램 저장 실패 (${response.status})`);
}

export function useFixedPrograms(
  allSections: SourceSection[],
  sendToOutput: (index: number, forceCommit?: boolean) => void,
): {
  fixedProgramModal: ReactNode;
  openFixedPrograms: () => void;
} {
  const [open, setOpen] = useState(false);
  const [programs, setPrograms] = useState<SavedProgram[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingSectionId, setPendingSectionId] = useState<string | null>(null);

  const gridOpen = useStore((state) => state.broadcastGridOpen);
  const currentSetlistId = useStore((state) => state.currentSetlistId);
  const addItem = useStore((state) => state.addItem);
  const setActiveItem = useStore((state) => state.setActiveItem);
  const setActiveSection = useStore((state) => state.setActiveSection);

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/fixed-programs', { cache: 'no-store' });
      const data = await response.json().catch(() => null) as { programs?: SavedProgram[]; error?: string } | null;
      if (!response.ok || !Array.isArray(data?.programs)) {
        throw new Error(data?.error ?? '고정 프로그램을 불러오지 못했습니다.');
      }
      setPrograms(data.programs);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '고정 프로그램을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const openFixedPrograms = useCallback(() => {
    setOpen(true);
    void loadPrograms();
  }, [loadPrograms]);

  useEffect(() => {
    if (!gridOpen) setOpen(false);
  }, [gridOpen]);

  const handleSelect = useCallback(async (program: SavedProgram, action: FixedProgramAction) => {
    if (!currentSetlistId) throw new Error('현재 예배 세트리스트가 없습니다.');
    const currentSetlist = useStore.getState().setlists.find((setlist) => setlist.id === currentSetlistId);
    if (!currentSetlist) throw new Error('현재 예배 세트리스트를 찾지 못했습니다.');

    const item = cloneForPlacement(program.item);
    addItem(currentSetlistId, item);
    setActiveItem(item.id);
    const firstSection = item.sections[0];
    if (firstSection) {
      setActiveSection(firstSection.id);
      if (action === 'broadcast') setPendingSectionId(firstSection.id);
    }

    void savePlacement(program, currentSetlistId, currentSetlist.name, item).catch((caught) => {
      console.warn('[FixedPrograms] 고정 프로그램 배치 저장 실패', caught);
    });
  }, [addItem, currentSetlistId, setActiveItem, setActiveSection]);

  useEffect(() => {
    if (!pendingSectionId) return;
    const index = allSections.findIndex((entry) => entry.section.id === pendingSectionId);
    if (index < 0) return;
    sendToOutput(index, true);
    setPendingSectionId(null);
  }, [allSections, pendingSectionId, sendToOutput]);

  return {
    openFixedPrograms,
    fixedProgramModal: open
      ? createElement(FixedProgramModal, {
          programs,
          loading,
          error,
          onRefresh: () => void loadPrograms(),
          onSelect: handleSelect,
          onClose: () => setOpen(false),
        })
      : null,
  };
}
