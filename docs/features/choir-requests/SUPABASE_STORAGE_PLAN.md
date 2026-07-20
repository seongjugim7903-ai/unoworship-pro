# 찬양대 자막 요청 Supabase 저장 설계

작성일: 2026-07-19

## 목적

`https://unoworship-pro-eight.vercel.app`에서 총무/찬양대 담당자가 가사를 입력하고 PNG 이미지를 생성하면, 브라우저 다운로드에만 의존하지 않고 Supabase에 원본 가사와 생성 이미지를 함께 저장한다. 이후 현장 Composer가 이 데이터를 조회해 예배 프로그램으로 가져오는 기반으로 사용한다.

## 저장 대상

- `choir_requests`: 사용자가 입력한 원본 요청
  - 예배일, 예배 종류, 곡명, 작곡, 편곡, 가사, 메모, 섹션 수
- `choir_generated_images`: 생성된 PNG 파일 메타데이터
  - 요청 ID, 섹션 번호, Storage bucket/path, 파일 크기, checksum
- `choir_programs`: Composer 가져오기용 프로그램 payload
  - 요청 ID, 프로그램 ID, 제목, UnoWorship 프로그램 JSON
- Storage bucket: `choir-generated-images`
  - 실제 PNG 파일 저장 위치

## 적용 파일

- DB 마이그레이션: `supabase/migrations/202607190001_choir_requests.sql`
- 서버 저장 API: `app/api/choir-requests/route.ts`
- Composer 목록 API: `app/api/choir-programs/route.ts`
- Supabase REST/Storage 래퍼: `lib/supabase/server.ts`
- Composer 가져오기 payload 생성: `lib/choirProgramPayload.ts`
- 화면 저장 버튼/자동 저장: `app/choir/ChoirRequestPage.tsx`

## 현재 저장 흐름

1. 사용자가 가사를 입력한다.
2. `자막 이미지 생성`을 누르면 브라우저 Canvas에서 1920x1080 PNG가 생성된다.
3. 생성 직후 `/api/choir-requests`로 `multipart/form-data`를 보낸다.
4. API가 `choir_requests`에 가사 원본 row를 만든다.
5. 생성 PNG를 Supabase Storage `choir-generated-images`에 업로드한다.
6. 각 PNG의 path/checksum을 `choir_generated_images`에 저장한다.
7. 나중에 Composer가 가져갈 수 있도록 `choir_programs.program_payload`에 프로그램 구조를 저장한다.

## Vercel 환경변수

Vercel 프로젝트 `unoworship-pro`에 아래 값을 등록해야 한다.

```bash
SUPABASE_URL=https://hwbzztfjzeismosjkmhe.supabase.co
SUPABASE_SERVICE_ROLE_KEY=Supabase service_role key
NEXT_PUBLIC_APP_URL=https://unoworship-pro-eight.vercel.app
```

주의: `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용이다. 브라우저 코드나 GitHub에 절대 노출하지 않는다.

## 적용 상태 (2026-07-20 확인)

**마이그레이션 적용 완료, 전 기능 프로덕션 동작 확인.**

- `GET /api/choir-requests` — 저장된 곡 목록 정상 반환
- `GET /api/choir-programs` — 프로그램 payload `ready` 상태로 정상 반환
- 이미지 업로드·수정 모드 업데이트(upsert)까지 실사용 확인
- Vercel 환경변수(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) 설정 완료

대시보드: `https://supabase.com/dashboard/project/hwbzztfjzeismosjkmhe`

참고: 로컬 dev(:3100)는 `.env`가 없어 저장 API가 503을 반환한다(의도된 동작).
로컬에서도 DB 저장을 테스트하려면 프로젝트 루트에 `.env` 파일을 만들고
`.env.example` 항목을 채우면 된다 — service role key는 절대 커밋하지 말 것.

이후 스키마 변경이 생기면: 새 마이그레이션 파일 추가 후 Dashboard SQL Editor에서 실행하거나,
`npx supabase login && npx supabase link --project-ref hwbzztfjzeismosjkmhe && npx supabase db push`.

## Composer 가져오기 방향

초기 구현은 Composer에서 `choir_programs`를 조회해 `program_payload`를 그대로 현장 프로그램으로 추가하는 방식이 가장 안전하다.

권장 흐름:

1. Composer 상단 또는 자막협조 메뉴에 `찬양대 요청 가져오기` 추가
2. Supabase API route가 `choir_programs` 목록을 최신순으로 제공
3. 사용자가 곡명을 선택
4. `program_payload`를 현장 `data/programs` 형식으로 변환하거나 그대로 import
5. 필요하면 Storage 이미지 path는 signed URL로 받아 미리보기 제공

현재 준비된 목록 API:

```text
GET /api/choir-programs?limit=30
```

응답의 `programs[].program_payload`를 현장 Composer import 후보로 사용한다.

## 정책

- Supabase table RLS는 켜되 anon 공개 정책은 만들지 않는다.
- 저장은 Next.js 서버 route handler가 service role key로 수행한다.
- 공개 공유가 필요해지면 Storage를 public으로 열지 말고 signed URL API를 별도로 만든다.
