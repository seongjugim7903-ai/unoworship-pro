/**
 * webFonts.ts
 * 무료 한글 웹폰트(Google Fonts) 프리로드
 *
 * - 모든 폰트는 OFL / Apache 2.0 라이선스 (저작권 무료)
 * - 앱 시작 시 한꺼번에 <link> 삽입 → 에디터 + 송출 양쪽에서 사용 가능
 * - Google Fonts는 unicode-range로 필요한 글리프만 분할 다운로드 → 트래픽 최적화
 */

/** Google Fonts에서 제공하는 한글 폰트 전체 목록 (2026-04 기준, 38개) */
export const KOREAN_WEB_FONTS = [
  // ── 고딕 (Sans) ──
  'Noto Sans KR',
  'Gothic A1',
  'IBM Plex Sans KR',
  'Black Han Sans',
  'Do Hyeon',
  'Jua',
  'Dongle',
  'Gowun Dodum',
  'Sunflower',
  'Stylish',
  'Orbit',

  // ── 명조 (Serif) ──
  'Noto Serif KR',
  'Nanum Myeongjo',
  'Gowun Batang',
  'Hahmlet',
  'Song Myung',
  'Diphylleia',
  'Grandiflora One',

  // ── 손글씨 / 필기체 ──
  'Nanum Pen Script',
  'Nanum Brush Script',
  'Hi Melody',
  'Gamja Flower',
  'Gaegu',
  'Poor Story',
  'Cute Font',
  'Yeon Sung',
  'East Sea Dokdo',
  'Dokdo',
  'Kirang Haerang',
  'Single Day',
  'Gugi',

  // ── 코딩 / 모노 ──
  'Nanum Gothic Coding',

  // ── 디스플레이 / 특수 ──
  'Nanum Gothic',
  'Bagel Fat One',
  'Black And White Picture',
  'Gasoek One',
  'Moirai One',
  'Asta Sans',
] as const;

export type KoreanWebFont = (typeof KOREAN_WEB_FONTS)[number];

/**
 * Google Fonts에는 없지만 자주 쓰는 인기 한글 폰트 — jsDelivr CDN 의 @font-face CSS 로 로드.
 * (모두 무료/상업적 이용 가능: Pretendard=OFL, Gmarket Sans·Nanum Square Neo·Jalnan=상업용 무료)
 * family = 셀렉터·캔버스에서 쓰는 정확한 font-family 이름 (CSS 의 @font-face 값과 일치해야 함).
 */
export const KOREAN_CDN_FONTS: { family: string; css: string }[] = [
  { family: 'Pretendard',       css: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css' },
  { family: 'Gmarket Sans',     css: 'https://cdn.jsdelivr.net/gh/fonts-archive/GmarketSans/GmarketSans.css' },
  { family: 'Nanum Square Neo', css: 'https://cdn.jsdelivr.net/gh/fonts-archive/NanumSquareNeo/NanumSquareNeo.css' },
  { family: 'Jalnan Gothic',    css: 'https://cdn.jsdelivr.net/gh/fonts-archive/JalnanGothic/JalnanGothic.css' },
];

/** CDN 폰트의 family 이름 목록 (셀렉터 합산용) */
export const KOREAN_CDN_FONT_FAMILIES = KOREAN_CDN_FONTS.map((f) => f.family);

/**
 * 폰트 셀렉터 표시용 한글 이름.
 * - key = 실제 font-family(값·캔버스에서 사용), value = 화면에 보일 한글 고유 이름.
 * - 확신 있는 폰트만 등록. 없으면 fontDisplayName() 이 원래 family 이름을 그대로 반환.
 */
export const FONT_KOREAN_NAMES: Record<string, string> = {
  // 인기 CDN 폰트
  'Pretendard': '프리텐다드',
  'Gmarket Sans': 'G마켓 산스',
  'Nanum Square Neo': '나눔스퀘어 네오',
  'Jalnan Gothic': '여기어때 잘난고딕',
  // 고딕
  'Noto Sans KR': '노토 산스 KR',
  'Gothic A1': '고딕 A1',
  'IBM Plex Sans KR': 'IBM 플렉스 산스 KR',
  'Black Han Sans': '검은고딕',
  'Do Hyeon': '도현체',
  'Jua': '주아체',
  'Dongle': '동글',
  'Gowun Dodum': '고운돋움',
  'Nanum Gothic': '나눔고딕',
  'Nanum Gothic Coding': '나눔고딕코딩',
  // 명조
  'Noto Serif KR': '노토 세리프 KR',
  'Nanum Myeongjo': '나눔명조',
  'Gowun Batang': '고운바탕',
  'Hahmlet': '함렛',
  'Song Myung': '송명체',
  // 손글씨
  'Nanum Pen Script': '나눔손글씨 펜',
  'Nanum Brush Script': '나눔손글씨 붓',
  'Hi Melody': '하이멜로디',
  'Gamja Flower': '감자꽃',
  'Gaegu': '개구체',
  'Yeon Sung': '연성체',
  'East Sea Dokdo': '동해 독도',
  'Dokdo': '독도',
  'Kirang Haerang': '기랑해랑',
  'Gugi': '구기체',
};

/** 셀렉터에 표시할 이름 — 한글 매핑이 있으면 그것을, 없으면 원래 family 이름. */
export function fontDisplayName(family: string): string {
  return FONT_KOREAN_NAMES[family] ?? family;
}

/* ── 폰트별 지원 두께(weight) ──────────────────────────
 * 폰트마다 실제로 존재하는 굵기가 다르다(검은고딕=400 하나, 노토산스=100~900 9종).
 * 여기 없는 폰트는 getFontWeights()가 [400](단일) 또는 제네릭 [400,700]로 처리.
 * 출처: Google Fonts 메타데이터 + CDN @font-face CSS 실측(2026-07-08).
 */
export const FONT_WEIGHTS: Record<string, number[]> = {
  // 구글 폰트 (다중 두께)
  'Noto Sans KR':        [100, 200, 300, 400, 500, 600, 700, 800, 900],
  'Gothic A1':           [100, 200, 300, 400, 500, 600, 700, 800, 900],
  'IBM Plex Sans KR':    [100, 200, 300, 400, 500, 600, 700],
  'Dongle':              [300, 400, 700],
  'Sunflower':           [300, 500, 700],
  'Noto Serif KR':       [200, 300, 400, 500, 600, 700, 800, 900],
  'Nanum Myeongjo':      [400, 700, 800],
  'Gowun Batang':        [400, 700],
  'Hahmlet':             [100, 200, 300, 400, 500, 600, 700, 800, 900],
  'Gaegu':               [300, 400, 700],
  'Nanum Gothic Coding': [400, 700],
  'Nanum Gothic':        [400, 700, 800],
  'Asta Sans':           [300, 400, 500, 600, 700, 800],
  // CDN 폰트 (다중 두께)
  'Pretendard':          [100, 200, 300, 400, 500, 600, 700, 800, 900],
  'Gmarket Sans':        [300, 500, 700],
  'Nanum Square Neo':    [300, 400, 700, 800, 900],
};

/** 두께 숫자 → 표시 이름 */
export const FONT_WEIGHT_LABELS: Record<number, string> = {
  100: '씬', 200: '엑스라이트', 300: '라이트', 400: '레귤러',
  500: '미디엄', 600: '세미볼드', 700: '볼드', 800: '엑스볼드', 900: '블랙',
};

/** 제네릭·시스템 폰트는 레귤러+볼드가 항상 보장됨 */
const GENERIC_FAMILIES = ['sans-serif', 'serif', 'monospace', 'system-ui', 'Arial', 'Helvetica', 'Georgia'];

/** 이 폰트가 실제로 지원하는 두께 목록 (오름차순). 미등록 폰트는 [400] 또는 제네릭 [400,700]. */
export function getFontWeights(family: string): number[] {
  if (FONT_WEIGHTS[family]) return FONT_WEIGHTS[family];
  if (GENERIC_FAMILIES.includes(family)) return [400, 700];
  return [400];
}

/** 'normal'/'bold'(구 데이터) 및 숫자를 숫자 두께로 정규화 */
export function normalizeFontWeight(w: number | 'normal' | 'bold'): number {
  if (w === 'normal') return 400;
  if (w === 'bold') return 700;
  return w;
}

/** target 두께를 이 폰트가 지원하는 값 중 가장 가까운 것으로 스냅 (폰트 교체 시 사용) */
export function nearestFontWeight(family: string, target: number): number {
  const ws = getFontWeights(family);
  if (ws.includes(target)) return target;
  return ws.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), ws[0]);
}

/**
 * Google Fonts CSS URL 생성
 * - 폰트마다 실제 지원하는 두께 전부를 요청(FONT_WEIGHTS 기준, 미등록은 400)
 *   → 인스펙터 두께 셀렉이 고른 굵기가 실제 폰트 파일로 렌더됨(가짜 볼드 방지).
 *   → @font-face 선언만 늘 뿐 woff2는 해당 두께가 화면에 쓰일 때만 지연 다운로드.
 * - display=swap: 폰트 로드 전 시스템 폰트로 즉시 표시 → 로드 완료 시 교체
 */
export function buildGoogleFontsUrl(fonts: readonly string[]): string {
  const families = fonts
    .map((f) => `family=${f.replace(/ /g, '+')}:wght@${getFontWeights(f).join(';')}`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

let _loaded = false;

/**
 * 한글 웹폰트 프리로드 — <link> 태그를 <head>에 삽입
 * 여러 번 호출해도 한 번만 삽입됨.
 */
export function preloadKoreanWebFonts(): void {
  if (_loaded) return;
  if (typeof document === 'undefined') return;

  _loaded = true;

  const url = buildGoogleFontsUrl(KOREAN_WEB_FONTS);

  // preconnect: DNS + TLS 미리 연결
  const preconnect = document.createElement('link');
  preconnect.rel = 'preconnect';
  preconnect.href = 'https://fonts.gstatic.com';
  preconnect.crossOrigin = 'anonymous';
  document.head.appendChild(preconnect);

  // 폰트 CSS 로드
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);

  // ── 인기 한글 폰트 (jsDelivr CDN @font-face) ──
  const jsdelivrPreconnect = document.createElement('link');
  jsdelivrPreconnect.rel = 'preconnect';
  jsdelivrPreconnect.href = 'https://cdn.jsdelivr.net';
  jsdelivrPreconnect.crossOrigin = 'anonymous';
  document.head.appendChild(jsdelivrPreconnect);

  for (const font of KOREAN_CDN_FONTS) {
    const cdnLink = document.createElement('link');
    cdnLink.rel = 'stylesheet';
    cdnLink.href = font.css;
    document.head.appendChild(cdnLink);
  }
}

/**
 * 폰트 셀렉터용 전체 목록 반환
 * - 기본 시스템 폰트 + 웹폰트 합산
 */
export function getAllFontOptions(systemFonts?: string[]): string[] {
  const base = systemFonts ?? ['Arial', 'Helvetica', 'Georgia', 'monospace'];
  const merged = [...base];
  KOREAN_CDN_FONT_FAMILIES.forEach((f) => {
    if (!merged.includes(f)) merged.push(f);
  });
  KOREAN_WEB_FONTS.forEach((f) => {
    if (!merged.includes(f)) merged.push(f);
  });
  return merged;
}
