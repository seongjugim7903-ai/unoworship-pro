'use client';

/**
 * textEditContext.tsx
 * 텍스트 인라인 편집 상태 전역 공유 Context
 *
 * 문제 배경:
 *   요소가 선택되면 BoundingBox가 TextElementView 위를 덮음.
 *   이 상태에서 더블클릭하면 BoundingBox의 이동 핸들이 이벤트를 가로채서
 *   TextElementView의 onDoubleClick이 발동되지 않음.
 *
 * 해결 방법:
 *   Context로 editingElementId를 공유.
 *   - TextElementView: editingElementId === element.id 이면 편집 모드
 *   - BoundingBox:    이동 핸들 더블클릭 시 requestEdit(selectedId) 호출
 *   - EditorPanel:    <TextEditProvider>로 두 컴포넌트 모두 감쌈
 *
 * ★ EditorCanvas.tsx를 수정하지 않고 동작
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { undoManager } from '@/lib/undoManager';

interface TextEditContextValue {
  /** 현재 편집 중인 텍스트 요소 ID (null = 편집 없음) */
  editingElementId: string | null;
  /** true = 전체 선택 (클릭 진입), false = 커서 위치 (더블클릭 진입) */
  selectAllOnEdit: boolean;
  /** 편집 시작 요청 (elements 전달 → undo 스냅샷, selectAll = 전체 선택 여부) */
  requestEdit: (elementId: string, elements?: import('@/lib/canvasTypes').CanvasElement[], selectAll?: boolean) => void;
  /** 편집 종료 */
  closeEdit: () => void;
}

const TextEditContext = createContext<TextEditContextValue>({
  editingElementId: null,
  selectAllOnEdit: false,
  requestEdit: () => {},
  closeEdit: () => {},
});

export function TextEditProvider({ children }: { children: ReactNode }) {
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [selectAllOnEdit, setSelectAllOnEdit] = useState(false);

  const requestEdit = useCallback((id: string, elements?: import('@/lib/canvasTypes').CanvasElement[], selectAll?: boolean) => {
    if (elements) {
      undoManager.beginBatch(elements);
    }
    setSelectAllOnEdit(selectAll ?? false);
    setEditingElementId(id);
  }, []);

  const closeEdit = useCallback(() => {
    undoManager.endBatch();
    setEditingElementId(null);
    setSelectAllOnEdit(false);
  }, []);

  return (
    <TextEditContext.Provider
      value={{
        editingElementId,
        selectAllOnEdit,
        requestEdit,
        closeEdit,
      }}
    >
      {children}
    </TextEditContext.Provider>
  );
}

export const useTextEdit = () => useContext(TextEditContext);
