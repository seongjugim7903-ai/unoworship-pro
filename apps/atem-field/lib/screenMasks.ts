import {
  DEFAULT_RENDER_TARGETS,
  createShapeElement,
  type CanvasElement,
  type ShapeElement,
} from './canvasTypes';

type MaskBarPreset = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const SAFE_AREA_SCREEN_MASK_PRESET = 'safe-area';

const SAFE_AREA_MASK_BARS: MaskBarPreset[] = [
  { id: '__unolive_safe_area_mask_top__', x: 0, y: 0, width: 100, height: 5 },
  { id: '__unolive_safe_area_mask_bottom__', x: 0, y: 95, width: 100, height: 5 },
  { id: '__unolive_safe_area_mask_left__', x: 0, y: 5, width: 5, height: 90 },
  { id: '__unolive_safe_area_mask_right__', x: 95, y: 5, width: 5, height: 90 },
];

export function createSafeAreaScreenMaskElements(startZIndex = 0): CanvasElement[] {
  return SAFE_AREA_MASK_BARS.map((bar, index) => createShapeElement({
    id: bar.id,
    shapeType: 'rect',
    x: bar.x,
    y: bar.y,
    width: bar.width,
    height: bar.height,
    fill: '#000000',
    fillOpacity: 1,
    stroke: 'transparent',
    strokeWidth: 0,
    opacity: 1,
    zIndex: startZIndex + index,
    layerRole: 'mask',
    fixedLayer: true,
    screenMaskPreset: SAFE_AREA_SCREEN_MASK_PRESET,
    visibleOn: [...DEFAULT_RENDER_TARGETS],
    locked: false,
  }));
}

function almostSame(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

export function isSafeAreaScreenMaskElement(el: CanvasElement): boolean {
  if (el.layerRole !== 'mask' || el.type !== 'shape') return false;
  if (el.screenMaskPreset === SAFE_AREA_SCREEN_MASK_PRESET) return true;

  const shape = el as ShapeElement;
  if (shape.shapeType !== 'rect') return false;
  if (shape.fill !== '#000000') return false;

  return SAFE_AREA_MASK_BARS.some((bar) => (
    almostSame(el.x, bar.x) &&
    almostSame(el.y, bar.y) &&
    almostSame(el.width, bar.width) &&
    almostSame(el.height, bar.height)
  ));
}
