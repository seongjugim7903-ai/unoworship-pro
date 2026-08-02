// 악보 페이지 모델과 여백 재기 — 서버·브라우저 양쪽에서 쓴다.
//
// 왜 여백을 재는가
//   스캔·PPT 로 만든 악보는 사방에 흰 여백이 넓다. 태블릿에서 그대로 그리면
//   화면의 3~4할을 여백이 먹고 정작 음표가 작아진다. 디지털 악보 앱이 크롭을
//   가장 많이 쓰는 기능으로 두는 이유다.
//
//   여기서는 사람이 손으로 자르게 하지 않는다. 올릴 때 흰 여백을 재서 넣는다 —
//   반주자에게 한 곡당 크롭 작업을 시키면 아무도 안 쓴다.

export interface SheetCrop {
  /** 원본 대비 비율 0~1 — 왼쪽·위·오른쪽·아래에서 잘라낼 양 */
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface SheetPage {
  path: string;
  contentType: string;
  /** 원본 픽셀 크기. 화면이 크롭 비율을 계산할 때 쓴다 */
  w?: number;
  h?: number;
  crop?: SheetCrop;
}

/** 자르지 않는 상태 */
export const NO_CROP: SheetCrop = { l: 0, t: 0, r: 0, b: 0 };

export function isCropped(crop: SheetCrop | undefined): boolean {
  if (!crop) return false;
  return crop.l > 0 || crop.t > 0 || crop.r > 0 || crop.b > 0;
}

/** 한 줄/한 칸이 '내용 없음'으로 볼 만큼 밝은지 판단하는 기준 */
const BRIGHT = 246;
/** 이 비율보다 어두운 점이 많아야 내용이 있는 줄로 본다 */
const INK_RATIO = 0.01;
/** 비율만으로는 작은 이미지에서 얼룩 한 점(1/200 = 0.5%)이 임계를 넘는다 — 개수도 같이 건다.
    실제 오선은 수백 점, 제목 줄도 수십 점이라 이 정도로는 걸리지 않는다. */
const MIN_INK = 3;
/** 여백을 이만큼은 남긴다. 딱 붙여 자르면 음표 끝이 잘려 보인다 */
const PADDING = 0.012;
/** 이보다 많이 잘리면 여백이 아니라 내용을 자르는 것이다 — 통째로 포기한다 */
const MAX_TRIM = 0.35;

/**
 * 밝기 격자에서 내용이 있는 범위를 찾아 crop 을 만든다.
 *
 * gray 는 행 우선(row-major) 밝기값(0~255) 배열이다. 브라우저에서 canvas 로 축소해
 * 만들어 넘긴다 — 원본 그대로 훑으면 큰 악보에서 느리다.
 *
 * 자를 곳이 없거나(전면이 내용) 너무 많이 잘리면 NO_CROP 을 돌려준다.
 * 애매하면 자르지 않는 편이 안전하다 — 악보가 잘려 보이는 것이 여백보다 나쁘다.
 */
export function detectCrop(gray: ArrayLike<number>, width: number, height: number): SheetCrop {
  if (width <= 0 || height <= 0 || gray.length < width * height) return NO_CROP;

  const rowHasInk = (y: number) => {
    let dark = 0;
    for (let x = 0; x < width; x += 1) if (gray[y * width + x] < BRIGHT) dark += 1;
    return dark >= MIN_INK && dark / width > INK_RATIO;
  };
  const colHasInk = (x: number) => {
    let dark = 0;
    for (let y = 0; y < height; y += 1) if (gray[y * width + x] < BRIGHT) dark += 1;
    return dark >= MIN_INK && dark / height > INK_RATIO;
  };

  let top = 0;
  while (top < height && !rowHasInk(top)) top += 1;
  if (top >= height) return NO_CROP; // 전부 흰 면 — 판단하지 않는다

  let bottom = height - 1;
  while (bottom > top && !rowHasInk(bottom)) bottom -= 1;

  let left = 0;
  while (left < width && !colHasInk(left)) left += 1;
  let right = width - 1;
  while (right > left && !colHasInk(right)) right -= 1;

  const crop: SheetCrop = {
    l: Math.max(0, left / width - PADDING),
    t: Math.max(0, top / height - PADDING),
    r: Math.max(0, (width - 1 - right) / width - PADDING),
    b: Math.max(0, (height - 1 - bottom) / height - PADDING),
  };

  /* 가로·세로 어느 쪽이든 지나치게 잘리면 여백이 아니라 내용을 자르는 중이다 */
  if (crop.l + crop.r > MAX_TRIM || crop.t + crop.b > MAX_TRIM) return NO_CROP;
  return crop;
}

/** 크롭을 반영한 화면 표시 비율 — 화면이 wrapper 의 aspect-ratio 로 쓴다 */
export function croppedAspect(page: SheetPage): number | null {
  if (!page.w || !page.h) return null;
  const crop = page.crop ?? NO_CROP;
  const w = page.w * (1 - crop.l - crop.r);
  const h = page.h * (1 - crop.t - crop.b);
  if (w <= 0 || h <= 0) return null;
  return w / h;
}

/** 곡의 페이지 목록 — 예전 단일 악보만 있는 행도 1페이지로 읽어 준다 */
export function readSheetPages(row: {
  sheet_pages?: unknown;
  sheet_path?: string | null;
  sheet_content_type?: string | null;
}): SheetPage[] {
  const raw = Array.isArray(row.sheet_pages) ? row.sheet_pages : [];
  const pages = raw
    .filter((page): page is SheetPage => Boolean(page && typeof (page as SheetPage).path === 'string'))
    .map((page) => ({ ...page, contentType: page.contentType ?? '' }));
  if (pages.length > 0) return pages;
  if (row.sheet_path) return [{ path: row.sheet_path, contentType: row.sheet_content_type ?? '' }];
  return [];
}
