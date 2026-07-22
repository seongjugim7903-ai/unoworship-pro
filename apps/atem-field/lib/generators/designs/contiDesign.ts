/**
 * lib/generators/designs/contiDesign.ts
 * 찬양콘티 — 기본 디자인 템플릿
 *
 * 준비찬양/콘티 섹션은 강대상 화면 하단에 제목과 가사를 안정적으로 표시한다.
 * 디자인 등록 기능에서 저장한 conti 디자인이 있으면 이 기본값 위에 덮어쓴다.
 */

import { createTextElement } from '@/lib/canvasTypes';
import type { ProgramDesign } from './index';

const lyricsTextElement = createTextElement({
  id: 'conti-lyrics-main',
  content: '',
  linked: true,
  x: 8,
  y: 63,
  width: 84,
  height: 24,
  fontSize: 34,
  fontWeight: 'bold',
  fontFamily: 'Noto Sans KR',
  color: '#ffffff',
  textAlign: 'center',
  verticalAlign: 'bottom',
  lineHeight: 1.45,
  letterSpacing: 0,
  strokeColor: '#000000',
  strokeWidth: 3,
  useShadow: true,
  shadow: {
    color: '#000000cc',
    offsetX: 2,
    offsetY: 2,
    blur: 8,
  },
  opacity: 1,
  zIndex: 10,
  autoWidth: false,
  autoHeight: true,
});

const coverTextElement = createTextElement({
  id: 'conti-cover-main',
  content: '',
  linked: true,
  x: 10,
  y: 36,
  width: 80,
  height: 26,
  fontSize: 30,
  fontWeight: 'bold',
  fontFamily: 'Noto Sans KR',
  color: '#ffffff',
  textAlign: 'center',
  verticalAlign: 'middle',
  lineHeight: 1.55,
  letterSpacing: 0,
  strokeColor: '#000000',
  strokeWidth: 3,
  useShadow: true,
  shadow: {
    color: '#000000cc',
    offsetX: 2,
    offsetY: 2,
    blur: 8,
  },
  opacity: 1,
  zIndex: 10,
  autoWidth: false,
  autoHeight: true,
});

export const CONTI_DESIGN: ProgramDesign = {
  promptLayout: 'black-white',
  defaultSection: {
    elements: [lyricsTextElement],
  },
  coverSection: {
    elements: [coverTextElement],
  },
};
