/**
 * lib/generators/designs/choirDesign.ts
 * 찬양대 자막 요청 — 디자인 템플릿
 *
 * 강대상 모니터: 왼쪽 아래, 14pt, 흰색, 그림자
 * 중층 모니터: black-white PMT 레이아웃 (블랙배경 + 큰 흰색 가사)
 */

import { createTextElement } from '@/lib/canvasTypes';
import type { ProgramDesign } from './index';

/**
 * 강대상 모니터용 가사 텍스트 요소
 * - 위치: Title Safe 가이드라인(10%) 안쪽, 왼쪽·아래 기준
 * - 폰트: 30px, 흰색, Bold, 좌측 정렬
 * - 그림자: 검정색 드롭 쉐도우 (2px offset, 6px blur)
 * - linked: true → section.text 가 자동으로 content 에 반영됨
 */
const lyricsTextElement = createTextElement({
  id: 'choir-lyrics-main',
  content: '',        // 제너레이터가 가사로 채움
  linked: true,       // section.text 연동
  x: 10,
  y: 72,
  width: 80,
  height: 18,
  fontSize: 30,
  fontWeight: 'bold',
  fontFamily: 'Noto Sans KR',
  color: '#ffffff',
  textAlign: 'left',
  verticalAlign: 'bottom',
  lineHeight: 1.6,
  letterSpacing: 0,
  strokeColor: 'transparent',
  strokeWidth: 0,
  useShadow: true,
  shadow: {
    color: '#000000cc',
    offsetX: 2,
    offsetY: 2,
    blur: 6,
  },
  opacity: 1,
  zIndex: 10,
  // [FIX: AUTO_WIDTH] 좌측 자막 박스를 콘텐츠 너비에 맞춤(오른쪽 여백 제거). 긴 구절은 92%에서 줄바꿈.
  autoWidth: true,
  autoHeight: true,
});

/**
 * 강대상 모니터용 표지 텍스트 요소
 * - 위치: 중앙 (x: 10%, y: 40%)
 * - 폰트: 24px, 흰색, Bold, 중앙 정렬
 */
const coverTextElement = createTextElement({
  id: 'choir-cover-main',
  content: '',
  linked: true,
  x: 10,
  y: 40,
  width: 80,
  height: 20,
  fontSize: 24,
  fontWeight: 'bold',
  fontFamily: 'Noto Sans KR',
  color: '#ffffff',
  textAlign: 'center',
  verticalAlign: 'middle',
  lineHeight: 1.6,
  letterSpacing: 1,
  strokeColor: 'transparent',
  strokeWidth: 0,
  useShadow: true,
  shadow: {
    color: '#000000cc',
    offsetX: 2,
    offsetY: 2,
    blur: 6,
  },
  opacity: 1,
  zIndex: 10,
  autoWidth: false,
  autoHeight: true,
});

/**
 * 찬양대 자막 프로그램 디자인
 */
export const CHOIR_DESIGN: ProgramDesign = {
  // 중층 모니터: 블랙 배경 + 큰 흰색 가사
  promptLayout: 'black-white',

  // 강대상 모니터: 가사 섹션 디자인
  defaultSection: {
    elements: [lyricsTextElement],
  },

  // 강대상 모니터: 표지 섹션 디자인
  coverSection: {
    elements: [coverTextElement],
  },
};
