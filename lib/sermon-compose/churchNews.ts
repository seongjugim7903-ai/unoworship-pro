// 교회소식 원문을 빈 줄 기준으로 섹션(소식 한 건)으로 나눈다.
// 분할 규칙은 UnoLive `lib/generators/worshipServiceGenerator.ts` 의 교회소식 빌더와 같아야 한다.
//   newsText.split(/\n\s*\n+/).map(trim).filter(Boolean)
// 규칙이 어긋나면 입력 화면 미리보기와 현장 생성 결과가 달라진다.

/** 빈 줄(엔터 두 번)마다 나눈다. 소식 한 건이 한 섹션이다. */
export function splitNewsBlocks(raw: string): string[] {
  return raw
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}
