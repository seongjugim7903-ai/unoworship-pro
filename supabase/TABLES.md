# Supabase 테이블 인벤토리

프로젝트: `hwbzztfjzeismosjkmhe` · 확인일: 2026-07-20

## 기능별 테이블

### 찬양대 자막 (헵시바 선교단 탭) — ✅ 적용됨
| 테이블 | 용도 |
|---|---|
| `choir_requests` | 가사 원본 요청 (예배·곡명·가사·섹션수·상태) |
| `choir_generated_images` | 생성 PNG/WebP 메타 (request_id별, storage 경로) |
| `choir_programs` | Composer 가져오기용 프로그램 payload (request_id unique) |
| Storage `choir-generated-images` | 실제 이미지 파일 (png/webp) |

마이그레이션: `202607190001_choir_requests.sql`, `202607190002_choir_webp_storage.sql`

### 설교대지 탭 — ⏳ 미적용
| 테이블 | 용도 |
|---|---|
| `sermon_outlines` | 예배마다 작성 (예배종류·일자·내용·찬양) |
| `weekly_bulletins` | 주 1회 주보 (week_start=그 주 일요일, unique) |

마이그레이션: `202607200002_sermon_outlines.sql`

### 준비찬양 탭 — ⏳ 미적용
| 테이블 | 용도 |
|---|---|
| `worship_prep_songs` | 곡 1개=1행. team별 저장. (제목·악보·조·구성) |
| Storage `worship-sheets` | 찬양 악보 파일 (png/jpg/webp/pdf) |

마이그레이션: `202607200003_worship_prep.sql`

## 공통 규칙
- 모든 테이블 RLS ON, anon 공개 정책 없음. 저장/조회는 서버 Route Handler의 service role key 전용.
- `updated_at`은 `set_updated_at()` 트리거로 자동 갱신 (choir_generated_images 제외 — insert-only).
- Storage 버킷은 전부 private. 공개 공유가 필요하면 signed URL API를 별도로 만든다.

## 미적용 테이블 적용 방법
`supabase/setup-pending.sql`을 Supabase Dashboard > SQL Editor에 붙여넣고 Run.
(idempotent — 여러 번 실행해도 안전, choir_* 는 건드리지 않음)

대시보드: https://supabase.com/dashboard/project/hwbzztfjzeismosjkmhe/sql
