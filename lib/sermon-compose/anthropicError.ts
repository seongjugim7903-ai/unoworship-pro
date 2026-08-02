// Anthropic API 오류를 사람이 읽고 조치할 수 있는 문장으로 바꾼다.
// SDK 가 던지는 message 는 JSON 덩어리라 그대로 화면에 흘리면 무슨 일인지 알 수 없다.
//
// server-only 모듈과 분리해 둔다 — 매핑 규칙을 테스트로 묶기 위해서다.

export class AnthropicServiceError extends Error {
  code: string;
  /** 화면에 그대로 보여도 되는 문장인지 */
  userFacing = true;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/** 조치 가능한 사유면 문장으로 바꿔 돌려주고, 아니면 null */
export function toAnthropicServiceError(error: unknown): AnthropicServiceError | null {
  const status = (error as { status?: number })?.status;
  const raw = error instanceof Error ? error.message : String(error ?? '');

  if (/credit balance is too low/i.test(raw)) {
    return new AnthropicServiceError(
      'Claude API 크레딧이 부족해 주보를 읽지 못했습니다. Anthropic 콘솔에서 크레딧을 충전한 뒤 다시 시도해 주세요.',
      'ANTHROPIC_CREDIT_EXHAUSTED',
    );
  }
  if (status === 401 || status === 403) {
    return new AnthropicServiceError(
      'Claude API 키가 유효하지 않습니다. 서버 환경변수 ANTHROPIC_API_KEY 를 확인해 주세요.',
      'ANTHROPIC_AUTH_FAILED',
    );
  }
  if (status === 429) {
    return new AnthropicServiceError(
      '요청이 몰려 잠시 처리하지 못했습니다. 30초쯤 뒤에 다시 올려 주세요.',
      'ANTHROPIC_RATE_LIMITED',
    );
  }
  if (typeof status === 'number' && status >= 500) {
    return new AnthropicServiceError(
      'Claude API 가 일시적으로 응답하지 않습니다. 잠시 뒤 다시 시도해 주세요.',
      'ANTHROPIC_UNAVAILABLE',
    );
  }
  return null;
}
