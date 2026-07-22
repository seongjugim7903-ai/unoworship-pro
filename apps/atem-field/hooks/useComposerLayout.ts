'use client';

import { useState, useCallback } from 'react';

const MIN_SETLIST_WIDTH = 300;          // 기존 최소(160)의 2.2배
const MAX_SETLIST_WIDTH_RATIO = 0.58;   // 전체 화면 너비의 53%
const DEFAULT_SETLIST_WIDTH = 300;

export function useComposerLayout() {
  const [isOperatorOpen, setIsOperatorOpen] = useState(true);
  const [setlistWidth, setSetlistWidth] = useState(DEFAULT_SETLIST_WIDTH);

  const toggleOperator = useCallback(() => {
    setIsOperatorOpen((prev) => !prev);
  }, []);

  const handleSetlistResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = setlistWidth;

      const handleMouseMove = (ev: MouseEvent) => {
        const maxWidth = Math.floor(window.innerWidth * MAX_SETLIST_WIDTH_RATIO);
        const newWidth = Math.max(
          MIN_SETLIST_WIDTH,
          Math.min(maxWidth, startWidth + ev.clientX - startX)
        );
        setSetlistWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [setlistWidth]
  );

  return {
    isOperatorOpen,
    toggleOperator,
    setlistWidth,
    handleSetlistResizeStart,
  };
}
