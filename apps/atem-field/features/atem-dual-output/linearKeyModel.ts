import type { CanvasRenderTarget } from '@/lib/canvasTypes';

export type AtemLinearKeySourceId = 'fill' | 'key';
export type AtemLinearKeyInputNumber = 4 | 5;
export type AtemLinearKeySignalMode = 'fill' | 'key';
export type MacDisplayRole = 'control' | 'atem-fill' | 'atem-key';

export interface AtemLinearKeySourceConfig {
  id: AtemLinearKeySourceId;
  label: string;
  displayRole: MacDisplayRole;
  routePath: string;
  renderTarget: CanvasRenderTarget;
  signalMode: AtemLinearKeySignalMode;
  atemInput: AtemLinearKeyInputNumber;
  atemSourceRole: 'fill-source' | 'key-source';
  converterChain: string[];
}

export interface AtemLinearKeyRuntimeConfig {
  resolution: '1920x1080';
  frameRate: '59.94' | '60';
  keyType: 'linear-key';
  fillInput: AtemLinearKeyInputNumber;
  keyInput: AtemLinearKeyInputNumber;
}

export const ATEM_LINEAR_KEY_SOURCES = {
  fill: {
    id: 'fill',
    label: 'FILL / 원본 색상',
    displayRole: 'atem-fill',
    routePath: '/atem-fill',
    renderTarget: 'output',
    signalMode: 'fill',
    atemInput: 4,
    atemSourceRole: 'fill-source',
    converterChain: ['USB-C to HDMI', 'HDMI to SDI', 'ATEM Input 4'],
  },
  key: {
    id: 'key',
    label: 'KEY / 마스크',
    displayRole: 'atem-key',
    routePath: '/atem-key',
    renderTarget: 'output',
    signalMode: 'key',
    atemInput: 5,
    atemSourceRole: 'key-source',
    converterChain: ['USB-C to HDMI', 'HDMI to SDI', 'ATEM Input 5'],
  },
} as const satisfies Record<AtemLinearKeySourceId, AtemLinearKeySourceConfig>;

export const ATEM_LINEAR_KEY_SOURCE_ORDER: AtemLinearKeySourceId[] = ['fill', 'key'];

export const DEFAULT_ATEM_LINEAR_KEY_RUNTIME_CONFIG: AtemLinearKeyRuntimeConfig = {
  resolution: '1920x1080',
  frameRate: '60',
  keyType: 'linear-key',
  fillInput: 4,
  keyInput: 5,
};

export function getAtemLinearKeySource(
  sourceId: AtemLinearKeySourceId,
): AtemLinearKeySourceConfig {
  return ATEM_LINEAR_KEY_SOURCES[sourceId];
}

export function getAtemLinearKeySourceByInput(
  atemInput: AtemLinearKeyInputNumber,
): AtemLinearKeySourceConfig {
  return ATEM_LINEAR_KEY_SOURCE_ORDER
    .map((sourceId) => ATEM_LINEAR_KEY_SOURCES[sourceId])
    .find((source) => source.atemInput === atemInput) ?? ATEM_LINEAR_KEY_SOURCES.fill;
}
