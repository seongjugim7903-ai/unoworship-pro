// 송출그리드 기억 마커 — 여러 섹션에 동시에 걸 수 있고, 각 마커는 그 섹션에서만 해제된다.

/**
 * localStorage 에 저장된 마커를 읽는다.
 *
 * 마커가 하나뿐이던 시절에는 섹션 id 를 날것 그대로 저장했다.
 * 그때 저장해 둔 값도 마커 하나로 살려 준다 — 업데이트하면서 걸어 둔 마커가
 * 사라지면 운영자가 왜 없어졌는지 알 길이 없다.
 */
export function parseMarkedSectionIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === 'string' && id !== '');
    if (typeof parsed === 'string' && parsed) return [parsed];
    return [];
  } catch {
    // JSON 이 아니면 옛 형식(섹션 id 한 개)이다.
    return [raw];
  }
}

export function serializeMarkedSectionIds(ids: ReadonlySet<string>): string {
  return JSON.stringify([...ids]);
}

/** 그 섹션의 마커만 켜고 끈다 — 다른 섹션의 마커는 건드리지 않는다. */
export function toggleMarkedSectionId(
  current: ReadonlySet<string>,
  sectionId: string,
): Set<string> {
  const next = new Set(current);
  if (!next.delete(sectionId)) next.add(sectionId);
  return next;
}
