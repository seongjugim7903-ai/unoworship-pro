'use client';

import type { SavedProgram } from '@/lib/generators/programTypes';
import type { Setlist, SetlistItem } from '@/lib/types';

function cloneItem<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 송출그리드 B키 긴급말씀찾기에서 추가된 말씀찾기(인용) 프로그램을 서버 파일에도 저장한다.
 * 상태 업데이트는 useQuickBible 이 담당하고, 이 함수는 재시작/재불러오기 보존용으로만 동작한다.
 */
export async function saveQuickBibleProgram(setlist: Setlist, item: SetlistItem): Promise<void> {
  const existingResponse = await fetch(`/api/programs/${encodeURIComponent(item.id)}`);
  let existing: SavedProgram | null = null;
  if (existingResponse.ok) {
    const data = (await existingResponse.json()) as { program: SavedProgram };
    existing = data.program;
  } else if (existingResponse.status !== 404) {
    throw new Error(`기존 말씀찾기(인용) 프로그램 확인 실패 (${existingResponse.status})`);
  }

  const now = Date.now();
  const program: SavedProgram = {
    id: item.id,
    type: existing?.type ?? 'worship',
    worshipId: setlist.id,
    worshipName: setlist.name.trim() || '이름 없는 워십',
    formData: {
      ...(existing?.formData ?? {}),
      generator: existing?.formData?.generator ?? 'quick-bible-grid-v1',
      preserveElements: true,
      savedFromComposer: true,
      quickBibleAutoSaved: true,
    },
    item: cloneItem(item),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const response = await fetch(
    existing ? `/api/programs/${encodeURIComponent(program.id)}` : '/api/programs',
    {
      method: existing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(program),
    },
  );

  if (!response.ok) {
    throw new Error(`말씀찾기(인용) 프로그램 자동 저장 실패 (${response.status})`);
  }
}
