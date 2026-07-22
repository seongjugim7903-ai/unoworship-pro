'use client';

/**
 * components/composer/menu/MiddleTopMenu.tsx
 * 미들 패널 상단 메뉴 바
 *
 * 좌측 정렬 메뉴 버튼:
 *   - 이미지: 로컬 파일에서 이미지를 불러와 에디터 캔버스에 삽입
 *   - 유튜브: 유튜브 링크 입력 → 영상 요소 삽입
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Download, LoaderCircle } from 'lucide-react';
import { useImageImporter } from './ImageImporter';
import { useYouTubeImporter, YouTubeModal } from './YouTubeImporter';
import { useBibleImporter, BibleModal } from './BibleImporter';
import { useHymnImporter, HymnModal } from './HymnImporter';
import { usePptSlideImporter, PptSlideModal } from './PptSlideImporter';
import { useDownloadsPptAutoImporter } from './DownloadsPptAutoImporter';
import { useTemplateRegister, TemplateRegisterModal } from '@/components/composer/template/TemplateRegisterModal';
import { useStore } from '@/lib/store';
import { BroadcastMenu } from '@/components/composer/broadcast';
import { SettingsButton } from '@/components/composer/settings';
import DesignRegistryModal from '@/components/composer/design/DesignRegistryModal';
import LayerOutputWorkspaceButton from '@/components/composer/canvas-tabs/LayerOutputWorkspaceButton';
import ScreenMaskWorkspaceButton from '@/components/composer/canvas-tabs/ScreenMaskWorkspaceButton';

export default function MiddleTopMenu() {
  const { fileInputRef, triggerFilePicker, handleFileChange } = useImageImporter();
  const youtube = useYouTubeImporter();
  const pptSlides = usePptSlideImporter();
  const downloadsPptAuto = useDownloadsPptAutoImporter();
  const bible = useBibleImporter();
  const hymn = useHymnImporter();
  const templateReg = useTemplateRegister();
  const { isMotionMode, setMotionMode, currentSetlistId, clearItems } = useStore();
  const [isDesignRegistryOpen, setDesignRegistryOpen] = useState(false);

  const handleClearProgramList = () => {
    if (!currentSetlistId) return;
    const currentSetlist = useStore.getState().setlists.find((setlist) => setlist.id === currentSetlistId);
    const itemCount = currentSetlist?.items.length ?? 0;
    if (itemCount === 0) return;
    if (!window.confirm(`현재 프로그램 ${itemCount}개를 목록에서 모두 제거할까요?\n저장된 프로그램 파일은 삭제되지 않습니다.`)) {
      return;
    }
    clearItems(currentSetlistId);
  };

  // 헤드 메뉴 공통 아이콘 버튼 스타일 — 글자 없이 정사각(아이콘만), 툴팁은 title 로.
  const ICON_BTN =
    'flex items-center justify-center w-8 h-8 rounded-md bg-[#1a1a1a] hover:bg-[#252525] ' +
    'border border-[#333] hover:border-[#444] text-gray-400 hover:text-gray-200 transition-colors';

  // [임시] 프로그램 리스트(SetlistPanel)의 "변환본" 버튼이 쏘는 이벤트 → PPT 모달을 load 탭으로 연다.
  const pptOpen = pptSlides.open;
  useEffect(() => {
    const handler = () => pptOpen('load');
    window.addEventListener('open-ppt-loader', handler);
    return () => window.removeEventListener('open-ppt-loader', handler);
  }, [pptOpen]);

  // P = PPT/Keynote 이미지 폴더 가져오기. 입력/텍스트 편집 중에는 운영 단축키를 가로채지 않는다.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const isPptShortcut =
        event.code === 'KeyP' || event.key === 'p' || event.key === 'P' || event.key === 'ㅔ';
      if (!isPptShortcut) return;
      event.preventDefault();
      event.stopPropagation();
      pptOpen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pptOpen]);

  return (
    <div className="flex items-center gap-1 px-4 h-full">
      {/* 전역 레이어 · 분리출력 전용 에디터 */}
      <LayerOutputWorkspaceButton />
      <ScreenMaskWorkspaceButton />

      {/* 구분선 */}
      <div className="w-px h-5 bg-[#333] mx-1" />

      {/* 이미지 삽입 */}
      <button onClick={triggerFilePicker} title="이미지 삽입" className={ICON_BTN}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </button>

      {/* PPT/Keynote 이미지 폴더 가져오기 */}
      <button onClick={() => pptSlides.open()} title="PPT/Keynote 악보 이미지 폴더를 프로그램으로 가져오기 (P)" className={ICON_BTN}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16v16H4z" />
          <path d="M8 8h8" />
          <path d="M8 12h8" />
          <path d="M8 16h4" />
        </svg>
      </button>

      <button
        onClick={downloadsPptAuto.toggle}
        title={downloadsPptAuto.message}
        aria-label="Downloads PPT 자동 감지"
        className={`${ICON_BTN} ${
          downloadsPptAuto.enabled
            ? 'border-cyan-500/70 bg-cyan-500/15 text-cyan-300 hover:border-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-100'
            : ''
        } ${
          downloadsPptAuto.status === 'error'
            ? 'border-red-500/70 bg-red-500/15 text-red-300 hover:border-red-400 hover:bg-red-500/20 hover:text-red-100'
            : ''
        }`}
      >
        {downloadsPptAuto.status === 'importing' ? (
          <LoaderCircle size={16} className="animate-spin" />
        ) : downloadsPptAuto.status === 'done' ? (
          <CheckCircle2 size={16} />
        ) : downloadsPptAuto.status === 'error' ? (
          <AlertTriangle size={16} />
        ) : (
          <Download size={16} />
        )}
      </button>

      {/* 유튜브 삽입 */}
      <button onClick={youtube.open} title="유튜브 영상 삽입" className={ICON_BTN}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      </button>

      {/* 구분선 */}
      <div className="w-px h-5 bg-[#333] mx-1" />

      {/* 성경 삽입 [FEATURE: BIBLE] */}
      <button onClick={bible.open} title="성경 본문 직접 입력 · 교회 보유/허가 자료만 사용" className={ICON_BTN}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      </button>

      {/* 찬송 [FEATURE: HYMN] — 교회 보유/허가 자료 직접 입력 */}
      <button onClick={hymn.open} title="찬송/찬양 자료 직접 입력 · 교회 보유/허가 자료만 사용" className={ICON_BTN}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </button>

      {/* 구분선 */}
      <div className="w-px h-5 bg-[#333] mx-1" />

      {/* 모션 토글 */}
      <button
        onClick={() => setMotionMode(!isMotionMode)}
        title="모션/시퀀스 편집 패널 열기/닫기"
        className={`flex items-center justify-center w-8 h-8 rounded-md border transition-colors ${
          isMotionMode
            ? 'bg-purple-600/30 border-purple-500 text-purple-300'
            : 'bg-[#1a1a1a] hover:bg-[#252525] border-[#333] hover:border-[#444] text-gray-400 hover:text-gray-200'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </button>

      {/* 디자인 등록 */}
      <button onClick={() => setDesignRegistryOpen(true)} title="프로그램별 섹션 디자인 등록/관리" className={ICON_BTN}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      </button>

      {/* 템플릿 등록 [FEATURE: SUBTITLE_TEMPLATE] */}
      <button onClick={templateReg.open} title="현재 에디터 디자인을 자막 템플릿으로 등록" className={ICON_BTN}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          <line x1="12" y1="7" x2="12" y2="13" />
          <line x1="9" y1="10" x2="15" y2="10" />
        </svg>
      </button>

      {/* 프로그램 목록 일괄 제거 — 서버의 저장 파일은 삭제하지 않는다. */}
      <button onClick={handleClearProgramList} title="현재 프로그램 목록 일괄 제거 (저장 파일 유지)" className={ICON_BTN}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 15H6L5 6" />
          <path d="M10 10v7" />
          <path d="M14 10v7" />
        </svg>
      </button>

      {/* 디자인 등록 모달 */}
      {isDesignRegistryOpen && (
        <DesignRegistryModal onClose={() => setDesignRegistryOpen(false)} />
      )}

      {/* spacer → 좌측 메뉴와 우측 송출 그룹 분리 */}
      <div className="flex-1" />

      {/* 새 창 출력 (구방식 두 모니터 미러 복구) — 창을 모니터로 끌어다 놓고 클릭해 전체화면 */}
      <button
        onClick={() => window.open('/main', 'unoLive-out1', 'popup')}
        title="출력 창 1 열기 (/main) — 모니터에 배치 후 클릭으로 전체화면"
        className={ICON_BTN}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
          <text x="12" y="13" textAnchor="middle" fontSize="9" fill="currentColor" stroke="none" fontWeight="bold">1</text>
        </svg>
      </button>
      <button
        onClick={() => window.open('/output', 'unoLive-out2', 'popup')}
        title="출력 창 2 열기 (/output) — 두 번째 모니터 미러"
        className={ICON_BTN}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
          <text x="12" y="13" textAnchor="middle" fontSize="9" fill="currentColor" stroke="none" fontWeight="bold">2</text>
        </svg>
      </button>

      {/* 구분선 (새창출력 ↔ 설정) */}
      <div className="w-px h-5 bg-[#333] mx-1" />

      {/* 우측: 설정 버튼 */}
      <SettingsButton />

      {/* 구분선 (설정 ↔ 송출) */}
      <div className="w-px h-5 bg-[#333] mx-1" />

      {/* 우측: 송출 */}
      <BroadcastMenu />

      {/* hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 유튜브 모달 */}
      <YouTubeModal isOpen={youtube.isOpen} onClose={youtube.close} />

      {/* PPT/Keynote 이미지 폴더 모달 */}
      <PptSlideModal isOpen={pptSlides.isOpen} onClose={pptSlides.close} initialMode={pptSlides.initialMode} />

      {/* 성경 모달 */}
      <BibleModal isOpen={bible.isOpen} onClose={bible.close} />

      {/* 찬송 모달 */}
      <HymnModal isOpen={hymn.isOpen} onClose={hymn.close} />

      {/* 자막 템플릿 등록 모달 [FEATURE: SUBTITLE_TEMPLATE] */}
      <TemplateRegisterModal isOpen={templateReg.isOpen} onClose={templateReg.close} />
    </div>
  );
}
