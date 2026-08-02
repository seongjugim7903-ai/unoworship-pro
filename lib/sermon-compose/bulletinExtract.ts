import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

// 주보 이미지에서 예배 순서 세 가지만 뽑는다 — 주일낮 · 주일오후 · 수요.
// 기존 lib/bulletin/extractBulletin.ts 는 다섯 섹션(교회소식·금요기도회 포함)을 뽑는
// 다른 용도라 건드리지 않고, 여기에 세 가지 전용 프롬프트를 따로 둔다.
// 뽑을 것을 줄이면 프롬프트가 짧아져 정확도가 올라간다.

import type { BulletinOrders } from './bulletinSections';
import { toAnthropicServiceError } from './anthropicError';

export class BulletinExtractConfigError extends Error {
  code = 'BULLETIN_OCR_NOT_CONFIGURED';
}

export function isBulletinExtractConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const ORDER_DESCRIPTION =
  '예배 순서표. "항목: 내용" 형태로 한 줄에 하나씩. 주보에 없으면 빈 문자열.';

const ORDER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sundayMorning: { type: 'string', description: `주일낮예배 ${ORDER_DESCRIPTION}` },
    sundayAfternoon: { type: 'string', description: `주일오후예배 ${ORDER_DESCRIPTION}` },
    wednesday: { type: 'string', description: `수요예배 ${ORDER_DESCRIPTION}` },
  },
  required: ['sundayMorning', 'sundayAfternoon', 'wednesday'],
} as const;

const PROMPT = `이 이미지는 한국 교회 주보입니다. 예배 순서표 세 가지만 정확히 추출하세요.

1. 주일낮예배 (주일 오전예배로 적혀 있을 수도 있습니다)
2. 주일오후예배
3. 수요예배

형식:
- 각 순서 항목과 내용을 "항목: 내용" 형태로 한 줄씩 적으세요.
  예) "성경봉독: 요12:1-8", "말씀선포: 감사하며 삽시다!", "찬송: 310장"
- 예배 시간(오전 9시 등)이 제목에 붙어 있으면 첫 줄에 "시간: ..." 으로 넣으세요.

규칙:
- 위 세 예배가 아닌 내용(교회소식, 금요기도회, 지도, 차량시간표, 사진, 헌금 안내 등)은 모두 제외하세요.
- 이미지에 실제로 적힌 글자만 옮기고, 없는 내용을 지어내지 마세요.
- 해당 예배가 이 면에 없으면 빈 문자열로 두세요.`;

export async function extractBulletinOrders(input: {
  base64: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
}): Promise<BulletinOrders> {
  if (!isBulletinExtractConfigured()) {
    throw new BulletinExtractConfigError(
      'ANTHROPIC_API_KEY가 설정되지 않았습니다. Vercel 환경변수에 등록해 주세요.',
    );
  }

  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.create({
      /* 기존 주보 추출기와 같은 모델 — 실사용으로 검증된 조합을 그대로 쓴다. */
      model: 'claude-opus-4-8',
      max_tokens: 8000,
      output_config: { format: { type: 'json_schema', schema: ORDER_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.base64 } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });
  } catch (error) {
    /* 크레딧·인증·과부하는 사람이 조치할 수 있는 사유라 문장으로 바꿔 올린다. */
    const known = toAnthropicServiceError(error);
    if (known) throw known;
    throw error;
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  if (!text) {
    throw new Error('주보에서 예배 순서를 읽지 못했습니다.');
  }

  const parsed = JSON.parse(text) as Partial<BulletinOrders>;
  return {
    sundayMorning: parsed.sundayMorning ?? '',
    sundayAfternoon: parsed.sundayAfternoon ?? '',
    wednesday: parsed.wednesday ?? '',
  };
}
