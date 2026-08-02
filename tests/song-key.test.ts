import { describe, expect, it } from 'vitest';
import { buildKeyFlow, keyRelation, parseSongKey } from '../lib/worship-prep/songKey';

// 조 입력은 자유 텍스트다. 읽을 수 없으면 null 을 돌려주고 화면에서 아무 것도 그리지 않는다 —
// 틀린 관계를 그럴듯하게 보여주는 것보다 아무 말 안 하는 편이 낫다.

const parse = (raw: string) => parseSongKey(raw);
const rel = (a: string, b: string) => keyRelation(parse(a)!, parse(b)!);

describe('parseSongKey', () => {
  it('장조를 읽는다', () => {
    expect(parse('C')).toMatchObject({ pitch: 0, minor: false, label: 'C' });
    expect(parse('G')).toMatchObject({ pitch: 7, minor: false, label: 'G' });
  });

  it('단조를 읽는다', () => {
    expect(parse('Am')).toMatchObject({ pitch: 9, minor: true, label: 'Am' });
    expect(parse('F#m')).toMatchObject({ pitch: 6, minor: true, label: 'F#m' });
  });

  it('올림·내림을 읽고 적은 대로 표기한다', () => {
    // Bb 를 A# 로 바꿔 보여주면 낯설다
    expect(parse('Bb')).toMatchObject({ pitch: 10, label: 'Bb' });
    expect(parse('A#')).toMatchObject({ pitch: 10, label: 'A#' });
    expect(parse('♭E')).toBeNull(); // 기호가 앞에 오면 읽지 않는다
    expect(parse('E♭')).toMatchObject({ pitch: 3, label: 'Eb' });
  });

  it('공백·소문자·라벨을 걷어낸다', () => {
    expect(parse('  g  ')).toMatchObject({ pitch: 7, minor: false });
    expect(parse('bbm')).toMatchObject({ pitch: 10, minor: true });
    expect(parse('키: G')).toMatchObject({ pitch: 7, minor: false });
    expect(parse('Key A')).toMatchObject({ pitch: 9, minor: false });
  });

  it('소문자만으로 단조라고 넘겨짚지 않는다', () => {
    // 'a' 를 A단조로 읽는 관습은 예배 악보에서 거의 안 쓴다
    expect(parse('a')).toMatchObject({ minor: false });
  });

  it('조가 아닌 것은 읽지 않는다', () => {
    expect(parse('')).toBeNull();
    expect(parse('H')).toBeNull();
    expect(parse('Gsus4')).toBeNull();
    expect(parse('1키')).toBeNull();
    expect(parse('모름')).toBeNull();
  });
});

describe('keyRelation', () => {
  it('같은 조', () => {
    expect(rel('G', 'G')).toBe('same');
  });

  it('같은 으뜸음 장단조', () => {
    expect(rel('C', 'Cm')).toBe('parallel');
  });

  it('나란한조 — 양방향', () => {
    expect(rel('C', 'Am')).toBe('relative');
    expect(rel('Am', 'C')).toBe('relative');
    expect(rel('G', 'Em')).toBe('relative');
  });

  it('4도·5도는 장단이 같을 때만 본다', () => {
    expect(rel('G', 'D')).toBe('fifth');
    expect(rel('G', 'C')).toBe('fourth');
    expect(rel('Am', 'Em')).toBe('fifth');
    // 장단이 다르면 4·5도로 부르지 않는다
    expect(rel('G', 'Dm')).toBe('far');
  });

  it('전조 — 반음·온음', () => {
    expect(rel('G', 'Ab')).toBe('semitone-up');
    expect(rel('Ab', 'G')).toBe('semitone-down');
    expect(rel('G', 'A')).toBe('tone-up');
    expect(rel('A', 'G')).toBe('tone-down');
  });

  it('그 외는 판단하지 않는다', () => {
    expect(rel('C', 'F#')).toBe('far');
  });
});

describe('buildKeyFlow', () => {
  it('셋 순서대로 관계를 붙인다. 첫 곡은 관계가 없다', () => {
    expect(buildKeyFlow(['C', 'G', 'Em'])).toEqual([
      { label: 'C', relation: null },
      { label: 'G', relation: 'fifth' },
      { label: 'Em', relation: 'relative' },
    ]);
  });

  it('읽을 수 없는 조는 통째로 뺀다 — 자리를 비우면 관계가 엉뚱해진다', () => {
    expect(buildKeyFlow(['C', '', 'G'])).toEqual([
      { label: 'C', relation: null },
      { label: 'G', relation: 'fifth' },
    ]);
  });

  it('읽을 수 있는 조가 두 개 미만이면 보여줄 흐름이 없다', () => {
    expect(buildKeyFlow(['C'])).toEqual([]);
    expect(buildKeyFlow(['', '모름'])).toEqual([]);
    expect(buildKeyFlow([])).toEqual([]);
  });
});
