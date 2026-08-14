// 교회소식 원문을 빈 줄 기준으로 섹션(소식 한 건)으로 나눈다.
// 분할 규칙은 UnoLive `lib/generators/worshipServiceGenerator.ts` 의 교회소식 빌더와 같아야 한다.
//   newsText.split(/\n\s*\n+/).map(trim).filter(Boolean)
// 규칙이 어긋나면 입력 화면 미리보기와 현장 생성 결과가 달라진다.

/**
 * 교회소식을 만드는 예배.
 *
 * 소식은 주보에 한 벌이고 주일낮예배에서 한 번 알린다. 그런데 설교대지를 예배마다
 * 저장하면 수요·금요 것까지 소식 프로그램이 딸려 나왔다 — 같은 소식이 그 주에 네 번
 * 만들어지고, 현장에서는 쓰지도 않는 프로그램이 목록에 쌓인다.
 *
 * 그래서 자동 생성은 이 예배에서만 한다. 예외가 필요하면 교회소식 탭에서 직접
 * 예배를 골라 저장하면 된다 — 그쪽은 사람이 뜻을 갖고 누르는 자리다.
 */
export const NEWS_SERVICE_TYPE = '주일낮예배';

/** 빈 줄(엔터 두 번)마다 나눈다. 소식 한 건이 한 섹션이다. */
export function splitNewsBlocks(raw: string): string[] {
  return raw
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}
