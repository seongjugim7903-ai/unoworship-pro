import { describe, expect, it } from 'vitest';
import { croppedAspect, detectCrop, NO_CROP, readSheetPages } from '../lib/worship-prep/sheetPages';

// 여백을 재는 쪽은 '애매하면 자르지 않는다'가 규칙이다.
// 악보가 잘려 보이는 것이 여백이 남는 것보다 나쁘다.

/** 흰 바탕(255)에 지정한 사각형만 검게 칠한 밝기 격자 */
function grid(width: number, height: number, box?: { x0: number; y0: number; x1: number; y1: number }) {
  const gray = new Uint8Array(width * height).fill(255);
  if (!box) return gray;
  for (let y = box.y0; y <= box.y1; y += 1) {
    for (let x = box.x0; x <= box.x1; x += 1) gray[y * width + x] = 0;
  }
  return gray;
}

describe('detectCrop', () => {
  it('사방 여백을 재서 잘라낸다', () => {
    // 실제 악보에 가깝게 — 사방 8% 여백, 나머지가 내용
    const crop = detectCrop(grid(100, 100, { x0: 8, y0: 8, x1: 91, y1: 91 }), 100, 100);
    expect(crop).not.toEqual(NO_CROP);
    // 8% 여백에서 여유분(1.2%)을 뺀 값
    expect(crop.l).toBeCloseTo(0.068, 2);
    expect(crop.t).toBeCloseTo(0.068, 2);
    expect(crop.r).toBeCloseTo(0.068, 2);
    expect(crop.b).toBeCloseTo(0.068, 2);
  });

  it('여유를 남긴다 — 딱 붙여 자르면 음표 끝이 잘려 보인다', () => {
    const crop = detectCrop(grid(100, 100, { x0: 10, y0: 10, x1: 89, y1: 89 }), 100, 100);
    // 실제 여백은 10% 인데 그보다 덜 자른다
    expect(crop.l).toBeLessThan(0.1);
    expect(crop.l).toBeGreaterThan(0);
  });

  it('전부 흰 면은 판단하지 않는다', () => {
    expect(detectCrop(grid(50, 50), 50, 50)).toEqual(NO_CROP);
  });

  it('여백이 없으면 자르지 않는다', () => {
    expect(detectCrop(grid(50, 50, { x0: 0, y0: 0, x1: 49, y1: 49 }), 50, 50)).toEqual(NO_CROP);
  });

  it('너무 많이 잘릴 상황이면 통째로 포기한다', () => {
    // 가운데 한 점만 있는 면 — 여백으로 보면 96% 를 잘라야 한다
    expect(detectCrop(grid(100, 100, { x0: 50, y0: 50, x1: 50, y1: 50 }), 100, 100)).toEqual(NO_CROP);
  });

  it('점 몇 개짜리 얼룩은 내용으로 보지 않는다', () => {
    // 사방 10% 여백 + 왼쪽 위 구석에 스캔 얼룩 한 점
    const gray = grid(200, 200, { x0: 20, y0: 20, x1: 179, y1: 179 });
    gray[2 * 200 + 2] = 0;
    const crop = detectCrop(gray, 200, 200);
    // 얼룩을 내용으로 봤다면 l 이 0 에 붙었을 것이다
    expect(crop.l).toBeCloseTo(0.088, 2);
  });

  it('격자가 모자라면 자르지 않는다', () => {
    expect(detectCrop(new Uint8Array(10), 100, 100)).toEqual(NO_CROP);
    expect(detectCrop(new Uint8Array(0), 0, 0)).toEqual(NO_CROP);
  });
});

describe('croppedAspect', () => {
  it('크롭을 반영한 가로세로비를 낸다', () => {
    const aspect = croppedAspect({
      path: 'p', contentType: 'image/png', w: 100, h: 200,
      crop: { l: 0.1, t: 0, r: 0.1, b: 0 },
    });
    expect(aspect).toBeCloseTo(80 / 200, 5);
  });

  it('원본 크기를 모르면 null — 화면이 원본 그대로 그린다', () => {
    expect(croppedAspect({ path: 'p', contentType: 'image/png' })).toBeNull();
  });
});

describe('readSheetPages', () => {
  it('페이지 배열을 그대로 읽는다', () => {
    const pages = readSheetPages({ sheet_pages: [{ path: 'a.png', contentType: 'image/png' }] });
    expect(pages).toEqual([{ path: 'a.png', contentType: 'image/png' }]);
  });

  it('예전 단일 악보 행도 1페이지로 읽어 준다', () => {
    expect(readSheetPages({ sheet_path: 'old.png', sheet_content_type: 'image/png' }))
      .toEqual([{ path: 'old.png', contentType: 'image/png' }]);
  });

  it('악보가 없으면 빈 배열', () => {
    expect(readSheetPages({})).toEqual([]);
    expect(readSheetPages({ sheet_pages: [], sheet_path: null })).toEqual([]);
  });

  it('망가진 항목은 버린다', () => {
    expect(readSheetPages({ sheet_pages: [null, { nope: 1 }, { path: 'ok.png' }] }))
      .toEqual([{ path: 'ok.png', contentType: '' }]);
  });
});
