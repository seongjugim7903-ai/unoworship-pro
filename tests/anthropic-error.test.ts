import { describe, expect, it } from 'vitest';
import { toAnthropicServiceError } from '../lib/sermon-compose/anthropicError';

/** SDK 가 실제로 던지는 모양 — message 가 JSON 덩어리다 */
function apiError(status: number, message: string) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

describe('toAnthropicServiceError', () => {
  it('크레딧 소진을 사람이 읽을 문장으로 바꾼다 (실제 배포에서 받은 오류)', () => {
    const raw = apiError(
      400,
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011Cddeckai5e5wjFbQGkzXo"}',
    );
    const mapped = toAnthropicServiceError(raw);

    expect(mapped?.code).toBe('ANTHROPIC_CREDIT_EXHAUSTED');
    expect(mapped?.message).toContain('크레딧이 부족');
    /* 원문 JSON 이 사용자 문장에 새어 나오면 안 된다 */
    expect(mapped?.message).not.toContain('{');
    expect(mapped?.message).not.toContain('request_id');
  });

  it('인증 실패를 구분한다', () => {
    expect(toAnthropicServiceError(apiError(401, 'unauthorized'))?.code).toBe('ANTHROPIC_AUTH_FAILED');
    expect(toAnthropicServiceError(apiError(403, 'forbidden'))?.code).toBe('ANTHROPIC_AUTH_FAILED');
  });

  it('과부하와 서버 오류를 구분한다', () => {
    expect(toAnthropicServiceError(apiError(429, 'rate limit'))?.code).toBe('ANTHROPIC_RATE_LIMITED');
    expect(toAnthropicServiceError(apiError(529, 'overloaded'))?.code).toBe('ANTHROPIC_UNAVAILABLE');
    expect(toAnthropicServiceError(apiError(500, 'boom'))?.code).toBe('ANTHROPIC_UNAVAILABLE');
  });

  it('모르는 오류는 null — 라우트가 일반 문구로 덮는다', () => {
    expect(toAnthropicServiceError(apiError(400, 'something else'))).toBeNull();
    expect(toAnthropicServiceError(new Error('네트워크 끊김'))).toBeNull();
    expect(toAnthropicServiceError(undefined)).toBeNull();
  });

  it('상태 코드가 없어도 크레딧 문구만 보고 잡는다', () => {
    const noStatus = new Error('Your credit balance is too low to access the Anthropic API.');
    expect(toAnthropicServiceError(noStatus)?.code).toBe('ANTHROPIC_CREDIT_EXHAUSTED');
  });
});
