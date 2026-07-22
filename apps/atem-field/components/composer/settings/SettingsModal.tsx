'use client';

/**
 * SettingsModal — 전역 설정 모달
 *
 * 좌측: 카테고리 내비게이션 (VS Code / Figma 스타일)
 * 우측: 선택된 카테고리의 콘텐츠
 *
 * - createPortal로 body에 마운트
 * - ESC 키로 닫힘
 * - 배경 클릭 시 닫힘
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { SettingsCategory } from '@/lib/settings/settingsTypes';

import GeneralSettings from './categories/GeneralSettings';
import EditorSettings from './categories/EditorSettings';
import OutputSettings from './categories/OutputSettings';
import BroadcastSettings from './categories/BroadcastSettings';
import ShortcutSettings from './categories/ShortcutSettings';
import AboutSettings from './categories/AboutSettings';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: SettingsCategory;
}

interface NavItem {
  id: SettingsCategory;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'general',
    label: '일반',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    id: 'editor',
    label: '에디터',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
    ),
  },
  {
    id: 'output',
    label: '아웃풋',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    id: 'broadcast',
    label: '송출',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2" />
        <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
      </svg>
    ),
  },
  {
    id: 'shortcuts',
    label: '단축키',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
        <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: '정보',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
];

export default function SettingsModal({
  isOpen,
  onClose,
  initialCategory = 'general',
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<SettingsCategory>(initialCategory);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) setActive(initialCategory);
  }, [isOpen, initialCategory]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const renderContent = useCallback(() => {
    switch (active) {
      case 'general':
        return <GeneralSettings />;
      case 'editor':
        return <EditorSettings />;
      case 'output':
        return <OutputSettings />;
      case 'broadcast':
        return <BroadcastSettings />;
      case 'shortcuts':
        return <ShortcutSettings />;
      case 'about':
        return <AboutSettings />;
    }
  }, [active]);

  if (!mounted || !isOpen) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[780px] max-w-[94vw] h-[560px] max-h-[90vh] flex flex-col bg-[#111] border border-[#2a2a2a] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1f1f1f] flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <h2 className="text-sm font-semibold text-white">설정</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#1f1f1f] text-gray-400 hover:text-white transition-colors"
            title="닫기 (ESC)"
          >
            ✕
          </button>
        </div>

        {/* 본문: 좌측 내비 + 우측 콘텐츠 */}
        <div className="flex flex-1 min-h-0">
          {/* 좌측 내비 */}
          <nav className="w-[168px] flex-shrink-0 border-r border-[#1f1f1f] bg-[#0c0c0c] py-2 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const isActive = item.id === active;
              return (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-[12px] transition-colors ${
                    isActive
                      ? 'bg-[#1a1a1a] text-white border-l-2 border-blue-500'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#151515] border-l-2 border-transparent'
                  }`}
                >
                  <span className={isActive ? 'text-blue-400' : ''}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* 우측 콘텐츠 */}
          <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
            {renderContent()}
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#1f1f1f] flex-shrink-0 bg-[#0c0c0c]">
          <span className="text-[10px] text-gray-600">
            변경사항은 자동으로 저장됩니다.
          </span>
          <button
            onClick={onClose}
            className="px-4 h-8 text-[11px] text-gray-300 hover:text-white bg-[#1a1a1a] hover:bg-[#252525] border border-[#2a2a2a] rounded transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
