import type { CanvasRenderTarget } from '@/lib/canvasTypes';
import type { SubtitleStyle } from '@/lib/types';

export type AtemOutputChannelId = 'main' | 'sub';
export type AtemPhysicalOutputId = 1 | 2;
export type AtemOutputRole = 'pulpit' | 'mezzanine';
export type AtemOutputContentMode = 'mirror' | 'mirror-with-style' | 'independent' | 'blank';
export type AtemOutputStateSource = 'operator' | 'cue-macro' | 'sync' | 'emergency';

export interface AtemOutputChannelConfig {
  id: AtemOutputChannelId;
  label: string;
  role: AtemOutputRole;
  physicalOutput: AtemPhysicalOutputId;
  renderTarget: CanvasRenderTarget;
  routePath: string;
}

export interface AtemOutputStyleProfile {
  id: string;
  channelId: AtemOutputChannelId;
  name: string;
  description?: string;
  styleOverride: Partial<SubtitleStyle>;
}

export interface AtemOutputChannelState {
  channelId: AtemOutputChannelId;
  contentMode: AtemOutputContentMode;
  text: string;
  sectionId: string | null;
  styleProfileId: string | null;
  styleOverride: Partial<SubtitleStyle>;
  isBlackout: boolean;
  source: AtemOutputStateSource;
  lastUpdatedAt: number;
}

export const ATEM_DUAL_OUTPUT_CHANNELS = {
  main: {
    id: 'main',
    label: 'MAIN / 강대상',
    role: 'pulpit',
    physicalOutput: 1,
    renderTarget: 'output',
    routePath: '/atem-main',
  },
  sub: {
    id: 'sub',
    label: 'SUB / 중상층',
    role: 'mezzanine',
    physicalOutput: 2,
    renderTarget: 'prompt',
    routePath: '/atem-sub',
  },
} as const satisfies Record<AtemOutputChannelId, AtemOutputChannelConfig>;

export const ATEM_DUAL_OUTPUT_CHANNEL_ORDER: AtemOutputChannelId[] = ['main', 'sub'];

export const DEFAULT_ATEM_DUAL_OUTPUT_STYLE_PROFILES: AtemOutputStyleProfile[] = [
  {
    id: 'main-default',
    channelId: 'main',
    name: 'MAIN 기본',
    styleOverride: {},
  },
  {
    id: 'sub-large-white-on-black',
    channelId: 'sub',
    name: 'SUB 큰 흰 글자',
    description: '중상층/맞은편 모니터에서 멀리 읽기 쉬운 프롬프트형 스타일',
    styleOverride: {
      fontSize: 72,
      color: '#ffffff',
      strokeWidth: 0,
      backgroundBar: true,
      backgroundBarColor: '#000000',
      backgroundOpacity: 0.85,
      positionY: 0.72,
    },
  },
];

export function createDefaultAtemOutputState(
  channelId: AtemOutputChannelId,
  now = Date.now(),
): AtemOutputChannelState {
  return {
    channelId,
    contentMode: channelId === 'main' ? 'mirror' : 'mirror-with-style',
    text: '',
    sectionId: null,
    styleProfileId: channelId === 'sub' ? 'sub-large-white-on-black' : 'main-default',
    styleOverride: {},
    isBlackout: false,
    source: 'sync',
    lastUpdatedAt: now,
  };
}

export function getAtemOutputChannel(
  channelId: AtemOutputChannelId,
): AtemOutputChannelConfig {
  return ATEM_DUAL_OUTPUT_CHANNELS[channelId];
}

export function getAtemOutputChannelByRenderTarget(
  renderTarget: CanvasRenderTarget,
): AtemOutputChannelConfig | null {
  return ATEM_DUAL_OUTPUT_CHANNEL_ORDER
    .map((channelId) => ATEM_DUAL_OUTPUT_CHANNELS[channelId])
    .find((channel) => channel.renderTarget === renderTarget) ?? null;
}

export function getAtemSocketTargets(
  channelIds: readonly AtemOutputChannelId[],
): CanvasRenderTarget[] {
  return channelIds.map((channelId) => ATEM_DUAL_OUTPUT_CHANNELS[channelId].renderTarget);
}

export function mergeAtemOutputStyle(
  baseStyle: SubtitleStyle,
  profile: AtemOutputStyleProfile | null,
  state: AtemOutputChannelState,
): SubtitleStyle {
  return {
    ...baseStyle,
    ...(profile?.styleOverride ?? {}),
    ...state.styleOverride,
  };
}
