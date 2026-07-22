'use client';

import { useState } from 'react';
import SetlistPanel from './SetlistPanel';
import EditorPanel from './EditorPanel';
import OperatorPanel from './OperatorPanel';
import MediaPanel from './MediaPanel';
import CanvasPanel from './CanvasPanel';
import LeftPanelTabs, { type LeftTab } from './LeftPanelTabs';
import SectionReferenceView from './setlist/SectionReferenceView';
import { useComposerLayout } from '@/hooks/useComposerLayout';
import { useStore } from '@/lib/store';

// OperatorPanel 고정 너비 — 내부 16:9 미리보기 기준으로 설정
const OPERATOR_WIDTH = 360;

export default function ComposerLayout() {
  const { isOperatorOpen, toggleOperator, setlistWidth, handleSetlistResizeStart } =
    useComposerLayout();

  // [FEATURE: REF_PANEL] 프로그램 우클릭 시 지정되는 참조 대상. 있으면 우측에 OperatorPanel 대신 참조 패널 표시.
  const referenceItemId = useStore((s) => s.referenceItemId);
  const setReferenceItemId = useStore((s) => s.setReferenceItemId);

  // ── 좌측 패널 탭 상태 ──
  const [activeTab, setActiveTab] = useState<LeftTab>('live');

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden select-none">

      {/* ── 좌측 패널: 탭 헤더 + 콘텐츠 (SetlistPanel / MediaPanel / CanvasPanel) ── */}
      <div
        className="flex-shrink-0 border-r border-[#222222] relative flex flex-col"
        style={{ width: setlistWidth }}
      >
        {/* 탭 헤더: UNO LIVE | media | canvas */}
        <LeftPanelTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {/* 탭 콘텐츠: 비활성 탭은 언마운트 → 성능 부하 zero */}
        <div className="flex-1 min-h-0">
          {activeTab === 'live' && <SetlistPanel />}
          {activeTab === 'media' && <MediaPanel />}
          {activeTab === 'canvas' && <CanvasPanel />}
        </div>
        {/* 우측 드래그 핸들 */}
        <div
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10
                     hover:bg-blue-500/60 active:bg-blue-500 transition-colors"
          onMouseDown={handleSetlistResizeStart}
          title="드래그해서 너비 조절"
        />
      </div>

      {/* ── EditorPanel: 남은 공간 전부 차지 ── */}
      <div className="flex-1 min-w-0 relative border-r border-[#222222]">
        <EditorPanel />
      </div>

      {/* ── 우측 패널 토글 버튼 ── (참조 패널 열림 시 클릭하면 참조 닫고 컨트롤 패널로 복귀) */}
      <button
        onClick={referenceItemId ? () => setReferenceItemId(null) : toggleOperator}
        className="flex-shrink-0 w-5 bg-[#1a1a1a] hover:bg-blue-700
                   border-l border-r border-[#222222]
                   flex items-center justify-center
                   transition-colors text-gray-500 hover:text-white z-20"
        title={referenceItemId ? '참조 패널 닫기' : (isOperatorOpen ? '컨트롤 패널 닫기' : '컨트롤 패널 열기')}
      >
        <span className="text-[10px] font-bold leading-none">
          {referenceItemId || isOperatorOpen ? '›' : '‹'}
        </span>
      </button>

      {/* ── 참조 패널: 우클릭 지정 시 OperatorPanel '옆에' 함께 표시 ──
          [FIX] 예전엔 참조 패널이 OperatorPanel 을 언마운트해서 송출 기능(useKeyboard·번호 송출)이
          통째로 죽었다. 이제 OperatorPanel 은 항상 마운트 유지하고, 참조 패널만 왼쪽에 덧붙인다. */}
      {referenceItemId && (
        <div
          className="flex-shrink-0 border-l border-[#222222]"
          style={{ width: OPERATOR_WIDTH, height: '100%' }}
        >
          <SectionReferenceView />
        </div>
      )}

      {/* ── OperatorPanel: 항상 마운트(송출 키보드/번호칸 유지). 접힘 시 width 0, 참조 열림 시 강제 표시 ── */}
      <div
        className="flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out"
        style={{ width: isOperatorOpen || referenceItemId ? OPERATOR_WIDTH : 0 }}
      >
        <div style={{ width: OPERATOR_WIDTH, height: '100%' }}>
          <OperatorPanel />
        </div>
      </div>

    </div>
  );
}
