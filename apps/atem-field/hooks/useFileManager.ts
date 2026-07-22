'use client';

import { useCallback, useRef } from 'react';
import { Setlist } from '@/lib/types';
import {
  exportSetlistToJSON,
  importSetlistFromJSON,
  downloadJSONFile,
  readFileAsText,
  createNewSetlist,
} from '@/lib/fileManager';

interface UseFileManagerOptions {
  /** JSON 불러오기 성공 시 호출 — 컴포넌트에서 store에 추가하는 로직을 여기에 */
  onImport: (setlist: Setlist) => void;
}

/**
 * 파일 관리 React 훅
 *
 * 제공 기능:
 *   exportSetlist(setlist)  - JSON 파일로 내보내기
 *   triggerImport()         - 파일 선택 dialog 열기
 *   handleFileChange(e)     - input[type=file] onChange 핸들러
 *   createSetlist(name)     - 새 Setlist 객체 생성
 *   fileInputRef            - <input type="file" ref={fileInputRef} /> 에 연결
 */
export function useFileManager({ onImport }: UseFileManagerOptions) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const exportSetlist = useCallback((setlist: Setlist) => {
    const json = exportSetlistToJSON(setlist);
    downloadJSONFile(setlist.name || 'setlist', json);
  }, []);

  const triggerImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const json = await readFileAsText(file);
        const setlist = importSetlistFromJSON(json);
        if (setlist) {
          onImport(setlist);
        } else {
          console.warn('유효하지 않은 워십 파일입니다.');
        }
      } catch (err) {
        console.error('파일 불러오기 실패:', err);
      }
      // 같은 파일 재선택 허용
      e.target.value = '';
    },
    [onImport]
  );

  const createSetlist = useCallback((name: string): Setlist => {
    return createNewSetlist(name);
  }, []);

  return {
    exportSetlist,
    triggerImport,
    handleFileChange,
    createSetlist,
    fileInputRef,
  };
}
