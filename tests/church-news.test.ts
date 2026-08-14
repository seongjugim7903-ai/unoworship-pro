import { describe, expect, it } from 'vitest';
import { NEWS_SERVICE_TYPE, splitNewsBlocks } from '../lib/sermon-compose/churchNews';
import { SERVICE_TYPES } from '../lib/sermon-compose/serviceTypeHint';

// 이 규칙은 UnoLive worshipServiceGenerator 의 교회소식 빌더와 같아야 한다.
//   newsText.split(/\n\s*\n+/).map(trim).filter(Boolean)

describe('splitNewsBlocks', () => {
  it('빈 줄마다 소식 한 건으로 나눈다', () => {
    const raw = '매주 목요일은 울주전도의 날로 실천합니다.\n\n8월 1일(토) 월삭감사예배를 드립니다.';
    expect(splitNewsBlocks(raw)).toEqual([
      '매주 목요일은 울주전도의 날로 실천합니다.',
      '8월 1일(토) 월삭감사예배를 드립니다.',
    ]);
  });

  it('한 건 안의 줄바꿈은 유지한다', () => {
    const raw = '새가족 환영회\n다음 주일 오후 2시\n\n제직회 안내';
    expect(splitNewsBlocks(raw)).toEqual(['새가족 환영회\n다음 주일 오후 2시', '제직회 안내']);
  });

  it('빈 줄이 여러 개여도 한 번만 나눈다', () => {
    expect(splitNewsBlocks('첫째\n\n\n\n둘째')).toEqual(['첫째', '둘째']);
  });

  it('공백만 있는 줄도 구분선으로 본다', () => {
    expect(splitNewsBlocks('첫째\n   \n둘째')).toEqual(['첫째', '둘째']);
  });

  it('앞뒤 빈 줄은 빈 섹션을 만들지 않는다', () => {
    expect(splitNewsBlocks('\n\n첫째\n\n둘째\n\n')).toEqual(['첫째', '둘째']);
  });

  it('빈 줄이 없으면 통째로 한 건', () => {
    expect(splitNewsBlocks('소식 하나뿐입니다.')).toEqual(['소식 하나뿐입니다.']);
  });

  it('내용이 없으면 빈 배열', () => {
    expect(splitNewsBlocks('')).toEqual([]);
    expect(splitNewsBlocks('   \n\n  ')).toEqual([]);
  });
});

// 교회소식을 만드는 예배는 하나다. 이 이름이 예배 종류 목록과 어긋나면 규칙이
// 조용히 죽는다 — 어느 예배에서도 소식이 안 만들어진다.
describe('NEWS_SERVICE_TYPE', () => {
  it('실제로 고를 수 있는 예배 종류여야 한다', () => {
    expect(SERVICE_TYPES).toContain(NEWS_SERVICE_TYPE);
  });

  it('주일낮예배다 — 주보 소식은 주일 낮에 한 번 알린다', () => {
    expect(NEWS_SERVICE_TYPE).toBe('주일낮예배');
  });
});
