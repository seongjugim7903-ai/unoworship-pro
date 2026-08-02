import { describe, expect, it } from 'vitest';
import { parseServiceOrder } from '../lib/sermon-compose/serviceOrder';

// 주보 OCR 이 돌려주는 '항목: 내용' 형태를 그대로 넣는다.
const ORDER = `시간: 오전 11시
묵도: 다같이
찬송: 310장
기도: 김집사
성경봉독: 요14:1-3
말씀선포: 마음에 근심하지 말라!
찬송: 493장
축도: 한만상 목사`;

describe('parseServiceOrder — 주보 순서표', () => {
  const parsed = parseServiceOrder(ORDER);

  it('성경봉독을 본문으로 뽑는다', () => {
    expect(parsed.scriptureRef).toBe('요14:1-3');
  });

  it('말씀선포를 설교제목으로 뽑는다', () => {
    expect(parsed.sermonTitle).toBe('마음에 근심하지 말라!');
  });

  it('다른 단서가 없으면 축도에서 설교자를 끌어오되 추정으로 표시한다', () => {
    expect(parsed.preacher).toBe('한만상 목사');
    expect(parsed.preacherSource).toBe('benediction');
  });

  it('찬송 항목의 장 번호를 순서대로 모은다', () => {
    expect(parsed.hymnNumbers).toEqual([310, 493]);
  });

  it('묵도·기도·시간은 설교대지에 쓰지 않는다', () => {
    expect(parsed.unmatched).toEqual([]);
    expect(parsed.praiseSongs).toEqual([]);
  });
});

describe('parseServiceOrder — 표기 흔들림', () => {
  it('점선과 늘어난 공백을 정리한다', () => {
    const parsed = parseServiceOrder('성경봉독 ................ 요 14:1-3\n찬      송: 310장');
    expect(parsed.scriptureRef).toBe('요 14:1-3');
    expect(parsed.hymnNumbers).toEqual([310]);
  });

  it('전각 콜론도 받는다', () => {
    expect(parseServiceOrder('성경봉독： 시23:1-6').scriptureRef).toBe('시23:1-6');
  });

  it('한 줄에 여러 장 번호를 적어도 모두 받는다', () => {
    expect(parseServiceOrder('찬송: 310장, 493장, 382장').hymnNumbers).toEqual([310, 493, 382]);
  });

  it('같은 찬송이 두 번 나와도 한 번만 담는다', () => {
    expect(parseServiceOrder('찬송: 310장\n찬송: 310장').hymnNumbers).toEqual([310]);
  });

  it('특송·헌금송 곡명을 찬양으로 모으고 담당자 표기는 뗀다', () => {
    const parsed = parseServiceOrder('특송: 주 품에 / 찬양대\n헌금송: 나의 하나님');
    expect(parsed.praiseSongs).toEqual(['주 품에', '나의 하나님']);
  });

  it('설교자를 말씀선포로 잘못 읽지 않는다', () => {
    const parsed = parseServiceOrder('설교자: 한만상 목사');
    expect(parsed.sermonTitle).toBe('');
    expect(parsed.preacher).toBe('한만상 목사');
  });
});

describe('parseServiceOrder — 설교자 판별', () => {
  it('설교자 항목이 축도보다 아래에 있어도 설교자 항목이 이긴다', () => {
    const parsed = parseServiceOrder('축도: 한만상 목사\n설교자: 김동경 강도사');
    expect(parsed.preacher).toBe('김동경 강도사');
    expect(parsed.preacherSource).toBe('explicit');
  });

  it('말씀선포 줄에 붙은 이름을 설교자로 뽑고 제목에서 떼어낸다', () => {
    const parsed = parseServiceOrder('말씀선포: 감사하며 삽시다 / 김동경 강도사\n축도: 한만상 목사');
    expect(parsed.sermonTitle).toBe('감사하며 삽시다');
    expect(parsed.preacher).toBe('김동경 강도사');
    expect(parsed.preacherSource).toBe('sermonLine');
  });

  it('괄호로 묶인 설교자도 떼어낸다', () => {
    const parsed = parseServiceOrder('말씀선포: 감사하며 삽시다(김동경 강도사)');
    expect(parsed.sermonTitle).toBe('감사하며 삽시다');
    expect(parsed.preacher).toBe('김동경 강도사');
  });

  it('축도만 있으면 쓰되 추정으로 표시한다', () => {
    const parsed = parseServiceOrder('말씀선포: 감사하며 삽시다\n축도: 한만상 목사');
    expect(parsed.preacher).toBe('한만상 목사');
    expect(parsed.preacherSource).toBe('benediction');
  });

  it('단서가 없으면 설교자를 비워 둔다 — 지어내지 않는다', () => {
    const parsed = parseServiceOrder('찬송: 310장\n성경봉독: 요14:1-3\n기도: 김집사');
    expect(parsed.preacher).toBe('');
    expect(parsed.preacherSource).toBe('');
  });

  it('기도·반주 담당자를 설교자로 오인하지 않는다', () => {
    const parsed = parseServiceOrder('기도: 이집사\n반주: 박집사\n인도: 최전도사');
    expect(parsed.preacher).toBe('');
  });

  it('콜론이 없는 줄은 미분류로 남긴다', () => {
    expect(parseServiceOrder('주일낮예배 순서').unmatched).toEqual(['주일낮예배 순서']);
  });

  it('빈 입력은 빈 결과', () => {
    const parsed = parseServiceOrder('');
    expect(parsed).toEqual({
      scriptureRef: '',
      sermonTitle: '',
      preacherSource: '',
      preacher: '',
      hymnNumbers: [],
      praiseSongs: [],
      unmatched: [],
    });
  });
});
