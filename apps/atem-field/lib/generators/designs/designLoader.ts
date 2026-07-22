/**
 * lib/generators/designs/designLoader.ts
 *
 * 서버에 저장된 디자인(data/designs/*.json)을 로드하여
 * 제너레이터에서 사용할 수 있는 형태로 반환.
 *
 * 우선순위:
 *   1. 서버 저장 디자인 (디자인 등록 모달에서 캡처한 것)
 *   2. 코드 기본 디자인 (choirDesign.ts 등)
 */

import type { CanvasElement } from '@/lib/canvasTypes';
import type { ProgramDesign, SectionDesign } from './index';
import { CHOIR_DESIGN } from './choirDesign';
import { CONTI_DESIGN } from './contiDesign';

/** 서버 저장 디자인의 슬롯 구조 */
interface ElementSlot {
  elements: CanvasElement[];
  updatedAt?: string;
}

interface SectionPair {
  default?: ElementSlot;
  cover?: ElementSlot;
}

interface ServerDesignData {
  main?: SectionPair;
  prompt?: SectionPair;
  promptLayouts?: Array<{
    id: string;
    name: string;
    sections: SectionPair;
  }>;
}

/** 코드 기본 디자인 매핑 */
const CODE_DEFAULTS: Record<string, ProgramDesign> = {
  choir: CHOIR_DESIGN,
  conti: CONTI_DESIGN,
  // 향후: sermon, bulletin, special 추가
};

const DESIGN_TYPE_ALIASES: Record<string, string[]> = {
  conti: ['conti', 'worship'],
  worship: ['worship', 'conti'],
};

/**
 * 서버 디자인을 로드하여 ProgramDesign 형태로 반환.
 * 서버에 저장된 것이 있으면 코드 기본값 위에 덮어쓰기.
 */
export async function loadDesignForProgram(programType: string): Promise<ProgramDesign> {
  const codeDefault = CODE_DEFAULTS[programType];
  const fallback: ProgramDesign = codeDefault ?? {
    promptLayout: 'none',
    defaultSection: { elements: [] },
  };

  try {
    const res = await fetch('/api/designs');
    if (!res.ok) return fallback;

    const { designs } = await res.json();
    const designKeys = DESIGN_TYPE_ALIASES[programType] ?? [programType];
    let serverKey = programType;
    let server: ServerDesignData | undefined;
    for (const key of designKeys) {
      const candidate = designs[key] as ServerDesignData | undefined;
      if (candidate) {
        serverKey = key;
        server = candidate;
        break;
      }
    }
    if (!server) return fallback;

    // 강대상 모니터 디자인 병합
    const mainDefault: SectionDesign = server.main?.default?.elements?.length
      ? { elements: server.main.default.elements }
      : fallback.defaultSection;

    const mainCover: SectionDesign | undefined = server.main?.cover?.elements?.length
      ? { elements: server.main.cover.elements }
      : fallback.coverSection;

    const promptLayout = server.prompt?.default?.elements?.length || server.prompt?.cover?.elements?.length
      ? (`prompt-base-${serverKey}` as ProgramDesign['promptLayout'])
      : fallback.promptLayout;

    return {
      promptLayout,
      subtitleStyle: fallback.subtitleStyle,
      defaultSection: mainDefault,
      coverSection: mainCover,
    };
  } catch {
    return fallback;
  }
}
