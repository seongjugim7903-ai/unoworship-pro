'use client';

/**
 * ContextMenu.tsx
 * 캔버스 요소 우클릭 시 표시되는 컨텍스트 메뉴
 *
 * 기능:
 *  - 레이어 순서: 맨 앞으로 / 앞으로 / 뒤로 / 맨 뒤로
 *  - 복사 / 붙여넣기 / 삭제
 *  - 잠금 / 표시 토글
 */

import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: false;
}

export interface ContextMenuDivider {
  divider: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuDivider;

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  /* 외부 클릭 또는 Escape로 닫기 */
  useEffect(() => {
    function handleDown(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('touchstart', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('touchstart', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  /* 뷰포트 경계 처리 — 메뉴가 화면 밖으로 나가지 않도록 */
  const MENU_W = 168;
  const MENU_H_EST = items.length * 30;
  const adjustedX = Math.min(x, window.innerWidth  - MENU_W  - 8);
  const adjustedY = Math.min(y, window.innerHeight - MENU_H_EST - 8);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedX,
        top:  adjustedY,
        zIndex: 99999,
        width: MENU_W,
      }}
      className="bg-[#1e1e1e] border border-[#333] rounded-lg shadow-2xl py-1 overflow-hidden
                 animate-in fade-in zoom-in-95 duration-100"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((entry, idx) => {
        if ('divider' in entry && entry.divider) {
          return <div key={idx} className="my-1 border-t border-[#2a2a2a]" />;
        }

        const item = entry as ContextMenuItem;
        return (
          <button
            key={idx}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-[6px] text-[11px] text-left
                        transition-colors select-none
                        ${item.disabled
                          ? 'text-gray-700 cursor-not-allowed'
                          : item.danger
                            ? 'text-red-400 hover:bg-red-900/30'
                            : 'text-gray-300 hover:bg-[#2a2a2a] hover:text-white'
                        }`}
          >
            {item.icon && (
              <span className="w-3.5 h-3.5 flex-shrink-0 opacity-70">{item.icon}</span>
            )}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
