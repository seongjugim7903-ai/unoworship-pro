// 예배 종류별로 기본 체크될 정기 프로그램 규칙 — 조건 가감은 이 파일만 고치면 된다

/**
 * [FEATURE: REGULAR_PROGRAM_DEFAULTS]
 *
 * 배경:
 *   예전에는 예배 종류에 따라 프로그램이 자동 선택됐는데, 2026-07 에 그 로직을
 *   걷어내고 전부 수동 체크로 바꿨다(`getRegularProgramOptions` 주석 참조).
 *   그런데 정기예배는 구성이 사실상 정해져 있어서 매번 같은 항목을 손으로
 *   체크해야 했다. 그래서 **기본 체크만 예배별로 되살리고, 해제는 자유롭게**
 *   할 수 있도록 한다.
 *
 * 설계:
 *   - 이 파일은 "어떤 프로그램이 어떤 예배에서 기본 체크되는가" 만 안다.
 *     생성 로직(worshipServiceGenerator)은 전혀 건드리지 않는다. 생성기는
 *     여전히 폼이 넘긴 `selectedRegularProgramIds` 만 보고 동작한다.
 *   - 즉 이 파일을 통째로 지워도 "수동 체크" 동작으로 그대로 돌아간다.
 *
 * 조건을 바꾸려면 아래 RULES 배열만 고칠 것.
 */

import type { RegularProgramId } from './worshipServiceGenerator';

/**
 * 어느 예배에서 기본 체크할지.
 *   - `worships`  : 이 예배들에서만 기본 체크
 *   - `exceptWorships` : 이 예배들을 **제외한** 모든 예배에서 기본 체크
 */
type RegularProgramDefaultRule =
  | { id: RegularProgramId; label: string; worships: readonly string[] }
  | { id: RegularProgramId; label: string; exceptWorships: readonly string[] };

/**
 * 2026-07-28 확정 규칙.
 *
 * 주의: 예배 종류 문자열은 `lib/media/worshipDefaults.ts` 의 `value` 와 정확히
 * 일치해야 한다. "주일1부·2부" 는 별도 예배 종류가 아니라 **주일낮예배** 하나로
 * 관리한다(2026-07-28 확인).
 *
 * 여기에 없는 프로그램은 기본 체크 대상이 아니다.
 */
const RULES: readonly RegularProgramDefaultRule[] = [
  // 왕이신 나의 하나님, 나의 하나님, 오직예수, 사도신경 : 주일1부·2부
  { id: 'king-my-god', label: '왕이신 나의 하나님', worships: ['주일낮예배'] },
  { id: 'my-god', label: '나의 하나님', worships: ['주일낮예배'] },
  { id: 'only-jesus', label: '오직 예수', worships: ['주일낮예배'] },
  { id: 'apostles-creed', label: '사도신경', worships: ['주일낮예배'] },

  // 행복 캠페인, 교회소식, 헵시바 선교단 : 주일1부·2부
  { id: 'campaign', label: '행복한 신앙생활 캠페인', worships: ['주일낮예배'] },
  { id: 'church-news', label: '교회소식', worships: ['주일낮예배'] },
  { id: 'hephzibah', label: '헵시바 선교단', worships: ['주일낮예배'] },

  // 파송의 노래 : 주일오후예배
  { id: 'sending-song', label: '파송의 노래', worships: ['주일오후예배'] },

  // 송축해 내 영혼 : 주일1부·2부 제외하고 모든 예배
  { id: 'bless-my-soul', label: '송축해 내 영혼', exceptWorships: ['주일낮예배'] },
];

function matches(rule: RegularProgramDefaultRule, worshipType: string): boolean {
  return 'worships' in rule
    ? rule.worships.includes(worshipType)
    : !rule.exceptWorships.includes(worshipType);
}

/**
 * 해당 예배에서 기본 체크할 정기 프로그램 id 목록.
 *
 * `worshipType` 은 예배 종류 선택값을 그대로 넘긴다. "기타" 처럼 목록에 없는
 * 값이면 `exceptWorships` 규칙만 걸린다 — 즉 송축해 내 영혼이 기본 체크된다.
 */
export function getDefaultRegularProgramIds(worshipType: string): RegularProgramId[] {
  return RULES.filter((rule) => matches(rule, worshipType)).map((rule) => rule.id);
}

/** 규칙 확인용 — 어떤 프로그램이 어떤 조건인지 사람이 읽는 형태로 */
export function describeRegularProgramDefaults(): string[] {
  return RULES.map((rule) =>
    'worships' in rule
      ? `${rule.label}: ${rule.worships.join(', ')}`
      : `${rule.label}: ${rule.exceptWorships.join(', ')} 제외 전체`,
  );
}
