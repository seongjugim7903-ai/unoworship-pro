'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { SavedProgram } from '@/lib/generators/programTypes';
import type { Setlist } from '@/lib/types';

type PptAutoStatus = 'watching' | 'importing' | 'done' | 'error';

interface PptSource {
  id: string;
  type: 'image-folder' | 'presentation';
  name: string;
  imageCount: number;
  updatedAt: number;
}

const AUTO_IMPORT_STORAGE_KEY = 'unolive-ppt-downloads-auto-import';
const POLL_INTERVAL_MS = 4_000;
const STABLE_FILE_MS = 5_000;

function formatDateISO(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function readInitialEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(AUTO_IMPORT_STORAGE_KEY) !== '0';
}

function insertProgramIntoComposer(program: SavedProgram) {
  const {
    currentSetlistId,
    setlists,
    addSetlist,
    addItem,
    updateItem,
    setCurrentSetlist,
    setActiveItem,
    setActiveSection,
  } = useStore.getState();

  const targetSetlistId = currentSetlistId || program.worshipId;
  const existingSetlist = setlists.find((setlist) => setlist.id === targetSetlistId);

  if (!existingSetlist) {
    const newSetlist: Setlist = {
      id: targetSetlistId,
      name: currentSetlistId ? '현장 예배' : program.worshipName,
      date: formatDateISO(),
      items: [program.item],
      createdAt: Date.now(),
    };
    addSetlist(newSetlist);
    setCurrentSetlist(newSetlist.id);
  } else {
    const found = existingSetlist.items.some((item) => item.id === program.item.id);
    if (found) {
      updateItem(existingSetlist.id, program.item.id, program.item);
    } else {
      addItem(existingSetlist.id, program.item);
    }
  }

  setActiveItem(program.item.id);
  setActiveSection(program.item.sections[0]?.id ?? null);
}

async function loadDownloadSources(): Promise<PptSource[]> {
  const response = await fetch('/api/imports/ppt-slides');
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? '다운로드 폴더를 읽지 못했습니다.');
  }
  return (data.sources ?? []) as PptSource[];
}

async function importSource(source: PptSource): Promise<SavedProgram> {
  const response = await fetch('/api/imports/ppt-slides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceId: source.id,
      sourceType: source.type,
      name: source.name,
      libraryType: 'praise',
      keyMode: 'none',
      fit: 'fill',
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    const detail = typeof data.detail === 'string'
      ? data.detail.replace(/^Error:\s*/i, '').trim()
      : '';
    throw new Error(detail || data.error || 'PPT 슬라이드를 자동 변환하지 못했습니다.');
  }
  return data.program as SavedProgram;
}

export function useDownloadsPptAutoImporter() {
  const [enabled, setEnabled] = useState(readInitialEnabled);
  const [status, setStatus] = useState<PptAutoStatus>('watching');
  const [message, setMessage] = useState('다운로드 폴더의 새 PPT/PPTX를 자동 감지합니다.');
  const startedAtRef = useRef(Date.now());
  const baselineReadyRef = useRef(false);
  const seenSourceIdsRef = useRef<Set<string>>(new Set());
  const importingRef = useRef(false);
  const doneTimerRef = useRef<number | null>(null);

  useEffect(() => {
    window.localStorage.setItem(AUTO_IMPORT_STORAGE_KEY, enabled ? '1' : '0');
    if (enabled) {
      startedAtRef.current = Date.now();
      baselineReadyRef.current = false;
      seenSourceIdsRef.current = new Set();
      setStatus('watching');
      setMessage('다운로드 폴더의 새 PPT/PPTX를 자동 감지합니다.');
    } else {
      setStatus('watching');
      setMessage('PPT 자동 감지가 꺼져 있습니다.');
    }
  }, [enabled]);

  useEffect(() => {
    return () => {
      if (doneTimerRef.current !== null) {
        window.clearTimeout(doneTimerRef.current);
      }
    };
  }, []);

  const pollOnce = useCallback(async () => {
    if (!enabled || importingRef.current) return;

    try {
      const sources = await loadDownloadSources();
      const presentations = sources.filter((source) => source.type === 'presentation');

      if (!baselineReadyRef.current) {
        baselineReadyRef.current = true;
      }

      const now = Date.now();
      for (const source of presentations) {
        if (source.updatedAt < startedAtRef.current - 1_000) {
          seenSourceIdsRef.current.add(source.id);
          continue;
        }
        if (seenSourceIdsRef.current.has(source.id)) continue;
        if (now - source.updatedAt < STABLE_FILE_MS) continue;

        seenSourceIdsRef.current.add(source.id);
        importingRef.current = true;
        setStatus('importing');
        setMessage(`${source.name} 자동 변환 중...`);

        const program = await importSource(source);
        insertProgramIntoComposer(program);

        setStatus('done');
        setMessage(`${program.item.title} 자동 삽입 완료`);
        if (doneTimerRef.current !== null) {
          window.clearTimeout(doneTimerRef.current);
        }
        doneTimerRef.current = window.setTimeout(() => {
          setStatus('watching');
          setMessage('다운로드 폴더의 새 PPT/PPTX를 자동 감지합니다.');
        }, 4_000);
        return;
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'PPT 자동 감지 중 오류가 발생했습니다.');
    } finally {
      importingRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    void pollOnce();
    const timer = window.setInterval(() => {
      void pollOnce();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, pollOnce]);

  return {
    enabled,
    status,
    message,
    toggle: () => setEnabled((value) => !value),
  };
}
