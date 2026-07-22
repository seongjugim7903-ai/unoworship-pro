'use client';

import { useMemo, useState } from 'react';
import { Check, LoaderCircle, Save } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { SavedProgram } from '@/lib/generators/programTypes';

type SaveStatus = 'idle' | 'saving' | 'saved';

function cloneItem<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 현재 선택 프로그램을 서버 프로그램 레코드로 저장하거나 갱신한다. */
export default function CurrentProgramSaveButton() {
  const { setlists, currentSetlistId, activeItemId } = useStore();
  const [status, setStatus] = useState<SaveStatus>('idle');

  const current = useMemo(() => {
    const setlist = setlists.find((entry) => entry.id === currentSetlistId);
    const item = setlist?.items.find((entry) => entry.id === activeItemId);
    return { setlist, item };
  }, [setlists, currentSetlistId, activeItemId]);

  const isDivider = current.item?.id.startsWith('__divider__') ?? false;
  const disabled = !current.setlist || !current.item || isDivider || status === 'saving';

  const handleSave = async () => {
    if (disabled || !current.setlist || !current.item) return;

    setStatus('saving');
    try {
      const existingResponse = await fetch(`/api/programs/${encodeURIComponent(current.item.id)}`);
      let existing: SavedProgram | null = null;
      if (existingResponse.ok) {
        const data = (await existingResponse.json()) as { program: SavedProgram };
        existing = data.program;
      } else if (existingResponse.status !== 404) {
        throw new Error(`기존 프로그램 확인 실패 (${existingResponse.status})`);
      }

      const now = Date.now();
      const program: SavedProgram = {
        id: current.item.id,
        type: existing?.type ?? 'worship',
        worshipId: current.setlist.id,
        worshipName: current.setlist.name.trim() || '이름 없는 워십',
        formData: {
          ...(existing?.formData ?? {}),
          generator: existing?.formData?.generator ?? 'composer-current-program-v1',
          preserveElements: true,
          savedFromComposer: true,
        },
        item: cloneItem(current.item),
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
        throw new Error(`저장 실패 (${response.status})`);
      }

      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 1800);
    } catch (error) {
      setStatus('idle');
      window.alert(error instanceof Error ? error.message : '현재 프로그램을 저장하지 못했습니다.');
    }
  };

  const title = isDivider
    ? '구분선은 프로그램으로 저장할 수 없습니다'
    : status === 'saved'
      ? '현재 프로그램 저장 완료'
      : '현재 선택 프로그램을 서버에 저장';

  return (
    <button
      type="button"
      onClick={() => void handleSave()}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex-shrink-0 w-7 h-7 rounded-md bg-[#17311f] hover:bg-green-700 disabled:bg-[#1a1a1a] disabled:text-gray-700 disabled:cursor-not-allowed flex items-center justify-center text-green-400 hover:text-white transition-colors"
    >
      {status === 'saving' ? (
        <LoaderCircle size={15} className="animate-spin" />
      ) : status === 'saved' ? (
        <Check size={15} />
      ) : (
        <Save size={15} />
      )}
    </button>
  );
}
