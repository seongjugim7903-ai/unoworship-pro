'use client';

/**
 * WebFontLoader.tsx
 * 앱 마운트 시 한글 웹폰트(Google Fonts) 프리로드
 * 렌더링 없이 side-effect만 수행하는 클라이언트 컴포넌트
 */

import { useEffect } from 'react';
import { preloadKoreanWebFonts } from '@/lib/webFonts';

export default function WebFontLoader() {
  useEffect(() => {
    preloadKoreanWebFonts();
  }, []);
  return null;
}
