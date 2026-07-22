'use client';

import { useStore } from '@/lib/store';
import BottomPanels from '@/components/composer/BottomPanels';
import EditorCanvas from '@/components/composer/EditorCanvas';
import { TextEditProvider } from '@/lib/textEditContext';
import MiddleTopMenu from '@/components/composer/menu/MiddleTopMenu';
import VideoControlBar from '@/components/video/VideoControlBar';
import MotionPanel from '@/components/composer/MotionPanel';
import ProgramBackgroundButton from '@/components/composer/ProgramBackgroundButton';

/**
 * 에디터 너비 기준: min(패널 100%, 60vh × 16/9)
 * — EditorCanvas + 하단 3개 패널이 동일 너비로 좌측 정렬됩니다.
 */
const EDITOR_WIDTH = 'min(100%, calc(66vh * 16 / 9))';
const MOTION_PANEL_WIDTH = 400;

function EmptyEditorCanvas({ message }: { message: string }) {
  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-xl border border-[#2f2f2f] bg-[#111] shadow-2xl"
      data-editor-empty-canvas
    >
      <div className="absolute inset-0 bg-[repeating-conic-gradient(#353535_0%_25%,#2a2a2a_0%_50%)] bg-[length:28px_28px] opacity-45" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-md border border-[#2a2a2a] bg-[#0b0b0b]/85 px-5 py-3 text-center shadow-lg">
          <p className="text-[11px] font-semibold text-gray-500">{message}</p>
          <p className="mt-1 text-[10px] text-gray-700">섹션을 선택하면 이 캔버스에서 바로 편집됩니다</p>
        </div>
      </div>
    </div>
  );
}

function EmptyEditorBottomPanel() {
  return (
    <div className="flex h-full items-center justify-center bg-[#0d0d0d] px-4 text-center text-[10px] text-gray-600">
      속성창은 섹션을 선택한 뒤 사용할 수 있습니다
    </div>
  );
}

export default function EditorPanel() {
  const {
    setlists,
    currentSetlistId,
    activeItemId,
    activeSectionId,
    isMotionMode,
  } = useStore();

  const currentSetlist = setlists.find((s) => s.id === currentSetlistId);
  const currentItem    = currentSetlist?.items.find((i) => i.id === activeItemId);
  const currentSection = currentItem?.sections.find((s) => s.id === activeSectionId);
  const emptyCanvasMessage = currentItem
    ? '좌측 패널에서 섹션을 선택하세요'
    : '좌측에서 프로그램을 선택하세요';

  if (!currentSetlist) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm bg-[#0d0d0d]">
        워십을 선택하세요
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#0d0d0d] text-white overflow-hidden">

      {/* ── 좌측: 에디터 메인 영역 ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* ── 1. 상단 메뉴 바 (에디터 너비로 고정) ── */}
        <div
          className="flex-shrink-0 h-[48px] border-b border-[#1a1a1a]"
          style={{ width: EDITOR_WIDTH }}
        >
          <MiddleTopMenu />
        </div>

        {/* ── 2+3. 에디터 너비로 고정된 컬럼 (좌측 정렬) ── */}
        <div
          className="flex flex-col flex-1 min-h-0"
          style={{ width: EDITOR_WIDTH }}
        >
          {/* ── 2. 16:9 WYSIWYG 에디터 캔버스 ── */}
          <div className="relative flex-shrink-0 px-4 pt-4">
            {currentSection ? (
              <>
                {/* 헤드메뉴~캔버스 여백에 뜨는 프로그램 배경 편집 버튼 (여백은 그대로) */}
                <ProgramBackgroundButton />
                <TextEditProvider>
                  <EditorCanvas
                    className="rounded-xl border border-[#3a3a3a] shadow-2xl overflow-hidden"
                  />
                </TextEditProvider>
              </>
            ) : (
              <EmptyEditorCanvas message={emptyCanvasMessage} />
            )}
          </div>

          {/* ── 3. 영상 컨트롤 바 ── */}
          <div className="flex-shrink-0 mt-4 border-t border-[#1a1a1a]">
            {currentSection && <VideoControlBar />}
          </div>

          {/* ── 4. 하단 패널 ── */}
          <div className="flex-1 border-t border-[#1a1a1a] min-h-0">
            {currentSection ? <BottomPanels /> : <EmptyEditorBottomPanel />}
          </div>
        </div>
      </div>

      {/* ── 우측: 모션 패널 (모션 모드 활성 시에만 표시) ── */}
      {isMotionMode && currentSection && (
        <div
          className="flex-shrink-0 border-l border-[#222222] bg-[#111111] overflow-hidden"
          style={{ width: MOTION_PANEL_WIDTH }}
        >
          <MotionPanel />
        </div>
      )}
    </div>
  );
}
