'use client';

/**
 * components/composer/setlist/SetlistFileBar.tsx
 * [기능4] JSON 저장 / 불러오기 / 새로저장 — 3버튼 + 중복 안내창
 *
 * 동작:
 *   [저장]     - 이미 저장된 적 있으면 "덮어쓰시겠습니까?" 안내창
 *              - 처음 저장이면 바로 다운로드
 *   [불러오기] - 파일 선택 다이얼로그 → JSON import
 *   [새로저장] - 파일명 입력 다이얼로그 → 새 이름으로 다운로드
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Setlist } from '@/lib/types';
import { exportSetlistToJSON, downloadJSONFile } from '@/lib/fileManager';

// ── 모달 (덮어쓰기 확인 / 새로저장 파일명 입력) ──────────────────────────────

type ModalMode = null | 'overwrite' | 'saveAs';

function FileModal({
  mode,
  defaultName,
  onConfirm,
  onCancel,
}: {
  mode: ModalMode;
  defaultName: string;
  onConfirm: (filename?: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  // Portal 대상 (document.body) — SSR 안전하게 마운트 후 설정
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mode === 'saveAs') {
      setName(defaultName);
      setTimeout(() => {
        inputRef.current?.focus();
        const base = defaultName.replace(/\.json$/, '');
        inputRef.current?.setSelectionRange(0, base.length);
      }, 50);
    }
  }, [mode, defaultName]);

  if (!mode || !mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      style={{ pointerEvents: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="bg-[#1a1a1a] border border-[#333] rounded-xl p-5 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {mode === 'overwrite' ? (
          <>
            <p className="text-sm text-gray-200 mb-1 font-medium">이미 저장된 파일입니다</p>
            <p className="text-xs text-gray-400 mb-5">
              <span className="text-blue-400 font-medium">{defaultName}</span> 파일이 이미
              존재합니다. 덮어쓰시겠습니까?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onCancel(); }}
                className="flex-1 h-8 rounded bg-[#2a2a2a] hover:bg-[#333] text-xs text-gray-400 transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onConfirm(); }}
                className="flex-1 h-8 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium transition-colors cursor-pointer"
              >
                덮어쓰기
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-200 mb-1 font-medium">새 이름으로 저장</p>
            <p className="text-[10px] text-gray-500 mb-3">다운로드 폴더에 저장됩니다 (Electron 전환 시 위치 선택 가능)</p>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirm(name);
                if (e.key === 'Escape') onCancel();
              }}
              className="w-full bg-[#0a0a0a] border border-[#444] rounded px-3 py-2 text-sm text-white
                         outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onCancel(); }}
                className="flex-1 h-8 rounded bg-[#2a2a2a] hover:bg-[#333] text-xs text-gray-400 transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onConfirm(name); }}
                className="flex-1 h-8 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium transition-colors cursor-pointer"
              >
                저장
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  // createPortal → document.body 에 직접 렌더링 (부모 overflow/z-index 영향 제거)
  return createPortal(modalContent, document.body);
}

// ── 메인 파일 바 ──────────────────────────────────────────────────────────────

interface SetlistFileBarProps {
  currentSetlist: Setlist | undefined;
  onImportClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * 저장 이력을 추적: setlistId → 마지막으로 저장한 파일명
 * (컴포넌트 외부에 두어 리렌더 무관하게 유지)
 */
const savedFileMap = new Map<string, string>();

export default function SetlistFileBar({
  currentSetlist,
  onImportClick,
  fileInputRef,
  onFileChange,
}: SetlistFileBarProps) {
  const [modal, setModal] = useState<ModalMode>(null);

  // ── 저장 (기존 이름) ──
  const handleSave = useCallback(() => {
    if (!currentSetlist) return;

    const prevFile = savedFileMap.get(currentSetlist.id);
    if (prevFile) {
      // 이미 저장한 적 있음 → 덮어쓰기 확인
      setModal('overwrite');
    } else {
      // 처음 저장 → 바로 다운로드
      doSave(currentSetlist, currentSetlist.name);
    }
  }, [currentSetlist]);

  // ── 새로저장: 파일명 입력 모달 → 다운로드 폴더에 저장 ──
  // (Electron 전환 시 dialog.showSaveDialog() 로 교체 예정)
  const handleSaveAs = useCallback(() => {
    if (!currentSetlist) return;
    setModal('saveAs');
  }, [currentSetlist]);

  // ── 실제 다운로드 실행 ──
  const doSave = (setlist: Setlist, filename: string) => {
    const json = exportSetlistToJSON(setlist);
    const cleanName = filename.replace(/\.json$/, '');
    downloadJSONFile(cleanName, json);
    savedFileMap.set(setlist.id, cleanName);
  };

  // ── 모달 확인 콜백 ──
  const handleModalConfirm = useCallback(
    (filename?: string) => {
      if (!currentSetlist) return;

      if (modal === 'overwrite') {
        // 같은 이름으로 덮어쓰기
        const prevFile = savedFileMap.get(currentSetlist.id) || currentSetlist.name;
        doSave(currentSetlist, prevFile);
      } else if (modal === 'saveAs' && filename) {
        // 새 이름으로 저장
        doSave(currentSetlist, filename);
      }
      setModal(null);
    },
    [currentSetlist, modal]
  );

  const defaultModalName =
    modal === 'overwrite'
      ? `${savedFileMap.get(currentSetlist?.id ?? '') || currentSetlist?.name || 'setlist'}.json`
      : `${currentSetlist?.name || 'setlist'}.json`;

  return (
    <>
      {/* 모달 */}
      <FileModal
        mode={modal}
        defaultName={defaultModalName}
        onConfirm={handleModalConfirm}
        onCancel={() => setModal(null)}
      />

      {/* 3버튼 바 */}
      <div className="flex-shrink-0 flex gap-1.5 p-2 border-t border-[#222222]">
        <button
          onClick={handleSave}
          className="flex-1 h-8 bg-[#1a1a1a] hover:bg-[#252525] rounded text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          저장
        </button>
        <button
          onClick={onImportClick}
          className="flex-1 h-8 bg-[#1a1a1a] hover:bg-[#252525] rounded text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          불러오기
        </button>
        <button
          onClick={handleSaveAs}
          className="flex-1 h-8 bg-[#1a1a1a] hover:bg-[#252525] rounded text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          새로저장
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={onFileChange}
          className="hidden"
        />
      </div>
    </>
  );
}
