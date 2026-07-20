import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

// 주보 이미지에서 다섯 섹션 텍스트만 뽑아온다. Claude 비전(Opus 4.8) + 구조화 출력.

export interface BulletinSections {
  churchNews: string;
  sundayMorning: string;
  sundayAfternoon: string;
  wednesday: string;
  fridayPrayer: string;
}

export class BulletinExtractorConfigError extends Error {
  code = 'BULLETIN_OCR_NOT_CONFIGURED';
}

export function isBulletinExtractorConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    churchNews: { type: 'string', description: '교회소식 섹션의 안내 전문. 번호 항목은 번호를 포함해 줄바꿈으로 나열.' },
    sundayMorning: { type: 'string', description: '주일낮예배 순서. "항목: 내용" 형태로 한 줄에 하나씩.' },
    sundayAfternoon: { type: 'string', description: '주일오후예배 순서. "항목: 내용" 형태로 한 줄에 하나씩.' },
    wednesday: { type: 'string', description: '수요예배 순서. "항목: 내용" 형태로 한 줄에 하나씩.' },
    fridayPrayer: { type: 'string', description: '금요기도회 순서. "항목: 내용" 형태로 한 줄에 하나씩. 없으면 빈 문자열.' },
  },
  required: ['churchNews', 'sundayMorning', 'sundayAfternoon', 'wednesday', 'fridayPrayer'],
} as const;

const PROMPT = `이 이미지는 한국 교회 주보입니다. 아래 다섯 섹션의 텍스트만 정확히 추출하세요.

1. 교회소식 — 번호가 매겨진 안내 항목들을 번호와 함께 순서대로. 원문 그대로, 요약하지 말 것.
2. 주일낮예배 — 예배 순서표. 각 순서 항목과 그 내용을 "항목: 내용" 형태로 한 줄씩. (예: "성경봉독: 요12:1-8", "말씀선포: 감사하며 삽시다!")
3. 주일오후예배 — 위와 같은 형식.
4. 수요예배 — 위와 같은 형식.
5. 금요기도회 — 위와 같은 형식. 주보에 없으면 빈 문자열.

규칙:
- 지도, 차량시간표, 사진, 헌금/봉헌 안내 등 위 다섯 섹션이 아닌 내용은 제외.
- 이미지에 실제로 적힌 글자만 옮기고, 없는 내용을 지어내지 말 것.
- 예배 시간(오전9시 등)이 섹션 제목에 붙어 있으면 첫 줄에 포함.`;

export async function extractBulletinSections(input: {
  base64: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
}): Promise<BulletinSections> {
  if (!isBulletinExtractorConfigured()) {
    throw new BulletinExtractorConfigError(
      'ANTHROPIC_API_KEY가 설정되지 않았습니다. Vercel 환경변수에 등록해 주세요.',
    );
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    output_config: { format: { type: 'json_schema', schema: SECTION_SCHEMA } },
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

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  if (!text) {
    throw new Error('주보에서 텍스트를 읽지 못했습니다.');
  }

  const parsed = JSON.parse(text) as Partial<BulletinSections>;
  return {
    churchNews: parsed.churchNews ?? '',
    sundayMorning: parsed.sundayMorning ?? '',
    sundayAfternoon: parsed.sundayAfternoon ?? '',
    wednesday: parsed.wednesday ?? '',
    fridayPrayer: parsed.fridayPrayer ?? '',
  };
}
