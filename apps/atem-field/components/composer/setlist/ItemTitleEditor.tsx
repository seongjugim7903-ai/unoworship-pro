'use client';

/**
 * components/composer/setlist/ItemTitleEditor.tsx
 * [기능3] 프로그램 제목 인라인 수정
 *
 * 사용법:
 *   <ItemTitleEditor
 *     title={item.title}
 *     isActive={isActive}
 *     sectionCount={item.sections.length}
 *     onSelect={onSelect}
 *     onRename={(newTitle) => updateItem(setlistId, itemId, { title: newTitle })}
 *   />
 *
 * 동작:
 *   - 클릭 1회: 해당 프로그램 선택 (onSelect)
 *   - 더블클릭: 인라인 편집 모드 진입 → input 으로 전환
 *   - Enter / blur: 제목 저장
 *   - Escape: 편집 취소
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface ItemTitleEditorProps {
  title: string;
  isActive: boolean;
  sectionCount: number;
  onSelect: () => void;
  onRename: (newTitle: string) => void;
}

export default function ItemTitleEditor({
  title,
  isActive,
  sectionCount,
  onSelect,
  onRename,
}: ItemTitleEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  // 편집 모드 진입 시 input 포커스 + 전체 선택
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // 외부에서 title 이 변경되면 draft 동기화
  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  const commitEdit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) {
      onRename(trimmed);
    } else {
      setDraft(title); // 원래 값 복원
    }
    setEditing(false);
  }, [draft, title, onRename]);

  const cancelEdit = useCallback(() => {
    setDraft(title);
    setEditing(false);
  }, [title]);

  if (editing) {
    return (
      <div className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') cancelEdit();
            e.stopPropagation(); // 키보드 이벤트 전파 방지
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-[#0a0a0a] border border-blue-500 rounded px-1 py-0
                     text-[13px] font-medium text-white outline-none"
        />
        {sectionCount > 0 && (
          <span className="text-[13px] text-blue-300 font-medium flex-shrink-0">
            ({sectionCount})
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="flex-1 text-left min-w-0 flex items-center gap-1 overflow-hidden"
    >
      <span className="text-[13px] font-medium truncate">
        {title || '제목 없음'}
      </span>
      {sectionCount > 0 && (
        <span className="text-[13px] text-blue-300 font-medium flex-shrink-0">
          ({sectionCount})
        </span>
      )}
    </button>
  );
}
