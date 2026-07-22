// eslint 설정 — next 기본 + renderer↛editor 경계 규칙 (DEV_PLAN §3-5)
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'apps/atem-field/**'],
  },
  {
    // 렌더러(출력 라우트)는 에디터를 import하지 않는다 — 소켓 수신이 유일한 입력
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/editor/**', '@/editor/**'],
              message: 'renderer는 editor를 import할 수 없습니다 (DEV_PLAN §3-5 경계 규칙 — 소켓 수신이 유일한 입력).',
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
