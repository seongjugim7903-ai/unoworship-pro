import {
  CANVAS_LAYER_ROLE_OPTIONS,
  getDefaultLayerRoleForElement,
  type CanvasElement,
} from './canvasTypes';
import type {
  PromptLayoutType,
  Section,
  SectionCueMacro,
} from './types';
import type { SectionTransitionConfig } from './store';
import type { SocketMessageTarget } from './socketEvents';

export const CUE_MACRO_LAYER_OPTIONS = CANVAS_LAYER_ROLE_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

export function isSectionCueMacroEnabled(section: Pick<Section, 'cueMacro'> | null | undefined): boolean {
  return section?.cueMacro?.enabled === true;
}

export function applySectionCueMacroElements(
  elements: CanvasElement[],
  cueMacro: SectionCueMacro | undefined,
): CanvasElement[] {
  if (!cueMacro?.enabled || !cueMacro.hiddenLayerRoles || cueMacro.hiddenLayerRoles.length === 0) {
    return elements;
  }

  const hiddenRoles = new Set(cueMacro.hiddenLayerRoles);
  return elements.filter((el) => {
    const role = el.layerRole ?? getDefaultLayerRoleForElement(el);
    return !hiddenRoles.has(role);
  });
}

export function resolveSectionCueTargets(
  cueMacro: SectionCueMacro | undefined,
  fallback: SocketMessageTarget[] | undefined,
): SocketMessageTarget[] | undefined {
  const outputTarget = cueMacro?.enabled ? cueMacro.outputTarget : undefined;
  if (!outputTarget || outputTarget === 'default') return fallback;
  if (outputTarget === 'all') return undefined;
  return [outputTarget];
}

export function resolvePromptLayoutTargets(
  promptLayout: PromptLayoutType | undefined,
  fallback: SocketMessageTarget[] | undefined,
): SocketMessageTarget[] | undefined {
  // PMT layout selection is a SUB display style, not a routing decision.
  // Routing is controlled separately by promptSendMode or Cue/Macro outputTarget.
  void promptLayout;
  return fallback;
}

export function isPromptOnlyTargets(targets: SocketMessageTarget[] | undefined): boolean {
  return targets?.length === 1 && targets[0] === 'prompt';
}

export function resolveSectionCuePromptLayout(
  cueMacro: SectionCueMacro | undefined,
  fallback: PromptLayoutType | undefined,
): PromptLayoutType | undefined {
  const promptLayout = cueMacro?.enabled ? cueMacro.promptLayout : undefined;
  if (!promptLayout || promptLayout === 'program-default') return fallback;
  return promptLayout;
}

export function resolveSectionCueBlackoutAction(
  cueMacro: SectionCueMacro | undefined,
): NonNullable<SectionCueMacro['blackout']> {
  return cueMacro?.enabled ? cueMacro.blackout ?? 'auto-off' : 'auto-off';
}

export function resolveSectionCueTransitionConfig(
  cueMacro: SectionCueMacro | undefined,
  fallback: SectionTransitionConfig,
): SectionTransitionConfig {
  const transition = cueMacro?.enabled ? cueMacro.transition : undefined;
  if (!transition || transition.type === 'default') return fallback;
  return {
    type: transition.type,
    duration: transition.type === 'cut' ? 0 : Math.max(100, transition.duration || fallback.duration || 500),
  };
}
