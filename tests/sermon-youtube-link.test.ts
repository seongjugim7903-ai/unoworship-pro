import { describe, expect, it } from 'vitest';
import { extractYoutubeId, parseYoutubeLink, youtubeThumbnailUrl } from '../lib/sermon-compose/youtubeLink';

describe('extractYoutubeId', () => {
  it('유튜브가 쓰는 4가지 링크 형식을 모두 받는다', () => {
    expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('공유 링크에 붙는 부가 파라미터를 무시한다', () => {
    expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ?si=abcdef&t=30')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeId('https://www.youtube.com/watch?list=PLx&v=dQw4w9WgXcQ&t=10s')).toBe('dQw4w9WgXcQ');
  });

  it('앞뒤 공백이 있어도 받는다', () => {
    expect(extractYoutubeId('  https://youtu.be/dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
  });

  it('유튜브가 아니면 null', () => {
    expect(extractYoutubeId('https://vimeo.com/12345678')).toBeNull();
    expect(extractYoutubeId('그냥 문장')).toBeNull();
    expect(extractYoutubeId('')).toBeNull();
  });
});

describe('parseYoutubeLink', () => {
  it('성공하면 썸네일까지 만들어 준다', () => {
    const result = parseYoutubeLink('https://youtu.be/dQw4w9WgXcQ');
    expect(result.ok).toBe(true);
    expect(result.videoId).toBe('dQw4w9WgXcQ');
    expect(result.thumbnailUrl).toBe(youtubeThumbnailUrl('dQw4w9WgXcQ'));
    expect(result.message).toBe('');
  });

  it('빈 입력과 잘못된 링크를 구분해 사유를 돌려준다', () => {
    expect(parseYoutubeLink('   ')).toMatchObject({ ok: false, message: '링크를 입력해 주세요.' });

    const wrong = parseYoutubeLink('https://vimeo.com/12345678');
    expect(wrong.ok).toBe(false);
    expect(wrong.message).toContain('유튜브 링크');
  });

  it('던지지 않는다', () => {
    expect(() => parseYoutubeLink('!!!')).not.toThrow();
  });
});
