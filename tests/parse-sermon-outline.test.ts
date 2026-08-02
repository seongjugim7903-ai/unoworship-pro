import { describe, expect, it } from 'vitest';
import {
  findDuplicateQuotes,
  isScriptureRefLine,
  parseSermonOutline,
} from '../lib/sermon-compose/parseSermonOutline';
import { detectServiceType } from '../lib/sermon-compose/serviceTypeHint';

/** 실제로 올라온 주일 오전예배 협조문 (첫 줄 끝 공백까지 원문 그대로) */
const SAMPLE = `주일 오전예배 대지 참조구절 및 찬양입니다.
성경: 요14:1-3
제목: 마음에 근심하지 말라!
1. 마음에 근심하지 말라 하심(1)
빌4:6-7
고후7:10
2. 하나님을 믿으니 또 나를 믿으라하심(1)
롬8:1
행16:31
요14:27
롬8:1
행16:31
3. 내 아버지의 집에 거할 곳이 많다 하심(2-3)
딤전3:15
히6:20
눅10:17-20
히11:16
계21:1
고후12:2
눅17:20-21
계21:4
찬양: 310장, 493장, 382장, 주님 내 길 예비하시니`;

describe('parseSermonOutline — 실제 협조문 샘플', () => {
  const parsed = parseSermonOutline(SAMPLE);

  it('첫 줄에서 예배 종류를 뽑고 그 줄을 소비한다', () => {
    expect(parsed.serviceTypeHint).toBe('주일낮예배');
    expect(parsed.unresolved).toEqual([]);
  });

  it('제목·본문 라벨을 분리한다', () => {
    expect(parsed.sermonTitle).toBe('마음에 근심하지 말라!');
    expect(parsed.scriptureRef).toBe('요14:1-3');
  });

  it('대지 3개를 순서대로 뽑고 절범위 괄호를 제목에서 떼어낸다', () => {
    expect(parsed.points).toHaveLength(3);

    expect(parsed.points[0].number).toBe('1');
    expect(parsed.points[0].title).toBe('마음에 근심하지 말라 하심');
    expect(parsed.points[0].verseRange).toBe('1');

    expect(parsed.points[1].title).toBe('하나님을 믿으니 또 나를 믿으라하심');
    expect(parsed.points[1].verseRange).toBe('1');

    expect(parsed.points[2].title).toBe('내 아버지의 집에 거할 곳이 많다 하심');
    expect(parsed.points[2].verseRange).toBe('2-3');
  });

  it('인용구절을 직전 대지에 붙이고 총 15개를 보존한다', () => {
    expect(parsed.points[0].quotes).toEqual(['빌4:6-7', '고후7:10']);
    expect(parsed.points[1].quotes).toEqual(['롬8:1', '행16:31', '요14:27', '롬8:1', '행16:31']);
    expect(parsed.points[2].quotes).toEqual([
      '딤전3:15', '히6:20', '눅10:17-20', '히11:16',
      '계21:1', '고후12:2', '눅17:20-21', '계21:4',
    ]);

    const total = parsed.points.reduce((sum, point) => sum + point.quotes.length, 0);
    expect(total).toBe(15);
  });

  it('중복 인용을 지우지 않고 배지 대상으로만 알려준다', () => {
    expect(findDuplicateQuotes(parsed.points[1])).toEqual(new Set(['롬8:1', '행16:31']));
    expect(findDuplicateQuotes(parsed.points[0]).size).toBe(0);
  });

  it('찬양 줄을 장 번호와 곡명으로 나눈다', () => {
    expect(parsed.hymnNumbers).toEqual(['310', '493', '382']);
    expect(parsed.praiseSongs).toEqual(['주님 내 길 예비하시니']);
    expect(parsed.praiseLine).toBe('310장, 493장, 382장, 주님 내 길 예비하시니');
  });
});

describe('parseSermonOutline — 판정 순서', () => {
  it('라벨을 대지보다 먼저 본다 (제목 줄이 대지로 잡히면 안 된다)', () => {
    const parsed = parseSermonOutline('제목: 1. 첫째 이유');
    expect(parsed.sermonTitle).toBe('1. 첫째 이유');
    expect(parsed.points).toHaveLength(0);
  });

  it('대지를 인용보다 먼저 본다', () => {
    const parsed = parseSermonOutline('1. 요14:1 을 붙든 사람');
    expect(parsed.points).toHaveLength(1);
    expect(parsed.points[0].title).toBe('요14:1 을 붙든 사람');
  });

  it('대지가 나오기 전의 인용구절은 미분류로 남긴다', () => {
    const parsed = parseSermonOutline('롬8:28\n1. 첫째\n빌4:6');
    expect(parsed.unresolved).toEqual(['롬8:28']);
    expect(parsed.points[0].quotes).toEqual(['빌4:6']);
  });

  it('분류되지 않은 문장은 미분류로 모은다', () => {
    const parsed = parseSermonOutline('1. 첫째\n여기는 설명 문장입니다');
    expect(parsed.unresolved).toEqual(['여기는 설명 문장입니다']);
  });
});

describe('isScriptureRefLine', () => {
  it('공백 없는 표기와 범위·목록 표기를 받는다', () => {
    for (const ref of ['요14:1-3', '빌4:6-7', '딤전3:15', '눅10:17-20', '벧전 2:5-9', '롬8:28,31-39']) {
      expect(isScriptureRefLine(ref)).toBe(true);
    }
  });

  it('라벨 줄과 대지 줄은 구절로 보지 않는다', () => {
    for (const line of ['성경: 요14:1-3', '제목: 마음에 근심하지 말라!', '1. 마음에 근심하지 말라 하심(1)']) {
      expect(isScriptureRefLine(line)).toBe(false);
    }
  });
});

describe('detectServiceType', () => {
  it('협조문 표기를 시스템 예배 종류명으로 옮긴다', () => {
    expect(detectServiceType('주일 오전예배 대지')).toBe('주일낮예배');
    expect(detectServiceType('주일 오후예배 대지')).toBe('주일오후예배');
    expect(detectServiceType('수요예배 대지입니다')).toBe('수요예배');
    expect(detectServiceType('금요기도회 참조구절')).toBe('금요기도회');
    expect(detectServiceType('월삭감사예배')).toBe('월삭감사예배');
  });

  it('오후를 낮보다 먼저 판정한다', () => {
    expect(detectServiceType('주일오후')).toBe('주일오후예배');
  });

  it('예배 종류를 못 찾으면 빈 문자열', () => {
    expect(detectServiceType('안녕하세요')).toBe('');
  });
});
