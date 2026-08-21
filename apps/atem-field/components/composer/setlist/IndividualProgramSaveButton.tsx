'use client';

// 현재 선택 프로그램을 워십과 무관하게 '자기 이름'으로 개별 저장하는 버튼

import { useMemo, useState } from 'react';
import { BookmarkPlus, Check, LoaderCircle } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { SavedProgram } from '@/lib/generators/programTypes';

type SaveStatus = 'idle' | 'saving' | 'saved';

function cloneItem<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 서버 저장 API와 동일한 ID 정규화 (한글/영숫자/_- 만 허용) */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9가-힣_\-]/g, '');
}

/**
 * 현재 선택 프로그램을 category='program' 개별 프로그램으로 저장한다.
 * - 이름을 입력받아(기본값 = 현재 제목) `program-<이름>` ID로 저장.
 * - 워십 소속 저장(CurrentProgramSaveButton)과 파일 ID가 겹치지 않는다.
 */
export default function IndividualProgramSaveButton() {
  const { setlists, currentSetlistId, activeItemId, updateItem } = useStore();
  const [status, setStatus] = useState<SaveStatus>('idle');

  const current = useMemo(() => {
    const setlist = setlists.find((entry) => entry.id === currentSetlistId);
    const item = setlist?.items.find((entry) => entry.id === activeItemId);
    return { setlist, item };
  }, [setlists, currentSetlistId, activeItemId]);

  const isDivider = current.item?.id.startsWith('__divider__') ?? false;
  const disabled = !current.item || isDivider || status === 'saving';

  const handleSave = async () => {
    if (disabled || !current.item) return;

    const defaultName = current.item.title.trim() || '이름 없는 프로그램';
    const input = window.prompt('개별 프로그램 이름으로 저장', defaultName);
    if (input === null) return; // 취소
    const name = input.trim();
    if (!name) {
      window.alert('프로그램 이름을 입력하세요.');
      return;
    }

    const safeName = sanitizeId(name);
    if (!safeName) {
      window.alert('사용할 수 없는 이름입니다. 한글·영문·숫자를 포함해 주세요.');
      return;
    }
    const programId = `program-${safeName}`;

    setStatus('saving');
    try {
      const existingResponse = await fetch(`/api/programs/${encodeURIComponent(programId)}`);
      let existing: SavedProgram | null = null;
      if (existingResponse.ok) {
        const data = (await existingResponse.json()) as { program: SavedProgram };
        existing = data.program;
      } else if (existingResponse.status !== 404) {
        throw new Error(`기존 프로그램 확인 실패 (${existingResponse.status})`);
      }

      if (existing && !window.confirm(`"${name}" 개별 프로그램이 이미 있습니다. 덮어쓸까요?`)) {
        setStatus('idle');
        return;
      }

      const now = Date.now();
      const item = cloneItem(current.item);
      item.id = programId;
      item.title = name;

      const program: SavedProgram = {
        id: programId,
        type: existing?.type ?? 'worship',
        category: 'program',
        worshipId: programId,
        worshipName: name,
        formData: {
          ...(existing?.formData ?? {}),
          generator: existing?.formData?.generator ?? 'composer-individual-program-v1',
          preserveElements: true,
          savedAsIndividualProgram: true,
        },
        item,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      const response = await fetch(
        existing ? `/api/programs/${encodeURIComponent(programId)}` : '/api/programs',
        {
          method: existing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(program),
        },
      );
      if (!response.ok) {
        throw new Error(`저장 실패 (${response.status})`);
      }

      // [FEATURE: INDIVIDUAL_PROGRAM_SAVE] 저장에 쓴 이름으로 현재 세트리스트의
      //   프로그램 제목도 맞춘다. 예전에는 서버 저장분(item.title)만 바뀌고 화면의
      //   프로그램은 옛 이름 그대로여서, 저장한 이름을 쓰려면 따로 이름을 고쳐야 했다.
      //   저장이 성공한 뒤에만 바꾼다 — 실패했는데 제목만 바뀌면 더 헷갈린다.
      if (currentSetlistId && current.item.title !== name) {
        updateItem(currentSetlistId, current.item.id, { title: name });
      }

      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 1800);
    } catch (error) {
      setStatus('idle');
      window.alert(error instanceof Error ? error.message : '개별 프로그램을 저장하지 못했습니다.');
    }
  };

  const title = isDivider
    ? '구분선은 저장할 수 없습니다'
    : status === 'saved'
      ? '개별 프로그램 저장 완료'
      : '현재 프로그램을 개별 프로그램으로 저장 (이름 지정)';

  return (
    <button
      type="button"
      onClick={() => void handleSave()}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex-shrink-0 w-7 h-7 rounded-md bg-[#2a2317] hover:bg-amber-600 disabled:bg-[#1a1a1a] disabled:text-gray-700 disabled:cursor-not-allowed flex items-center justify-center text-amber-400 hover:text-white transition-colors"
    >
      {status === 'saving' ? (
        <LoaderCircle size={15} className="animate-spin" />
      ) : status === 'saved' ? (
        <Check size={15} />
      ) : (
        <BookmarkPlus size={15} />
      )}
    </button>
  );
}
