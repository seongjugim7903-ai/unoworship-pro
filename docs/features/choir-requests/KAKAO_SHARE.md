# 찬양대 자막 카카오톡 공유 설정

작성일: 2026-07-20

## 동작 방식

생성된 자막 이미지 패널의 버튼은 순서가 강제된다.

1. `① 전체 이미지 저장` — 활성 상태로 시작. 누르면 PNG 전체가 250ms 간격으로 다운로드된다.
2. `② 카카오톡으로 보내기` — 전체 저장이 완료될 때까지 비활성. 완료 후 활성화된다.

카카오톡 보내기는 카카오 공식 JavaScript SDK(v2.8.1)의 `Kakao.Share.sendDefault`를 사용해
통상적인 웹사이트들이 쓰는 카카오톡 전용 공유창을 그대로 연다.

- 첫 번째 자막 PNG(5MB 이하)를 `Kakao.Share.uploadImage`로 카카오 서버에 올려
  피드 카드 썸네일로 사용한다 (카카오 서버 보관 100일, 이후 자동 삭제).
- 카드에는 곡명·예배 정보·이미지 장수와 `자막 협조 페이지 열기` 버튼(앱 URL 링크)이 들어간다.
- 썸네일 업로드에 실패하면 텍스트 템플릿으로 대체 발송한다.

구현 파일: `lib/kakaoShare.ts`, `app/choir/ChoirRequestPage.tsx`

## 필수 사전 설정 (사용자 작업)

1. [Kakao Developers](https://developers.kakao.com)에서 애플리케이션 생성 (또는 기존 앱 사용)
2. **앱 키 > JavaScript 키** 복사
3. **플랫폼 > Web** 에 사이트 도메인 등록:
   - `https://unoworship-pro-eight.vercel.app`
   - 로컬 테스트용: `http://localhost:3100`
4. **제품 설정 > 카카오톡 공유** 활성화 + 링크 도메인 등록
5. Vercel 환경변수 등록:

```bash
NEXT_PUBLIC_KAKAO_JS_KEY=발급받은 JavaScript 키
```

주의: JavaScript 키는 브라우저 노출 전제 키라서 `NEXT_PUBLIC_` 접두사가 맞다.
악용 방지는 카카오 콘솔의 도메인 등록으로 이뤄지므로 도메인 등록을 반드시 정확히 할 것.

## 키 미설정 시 동작

`NEXT_PUBLIC_KAKAO_JS_KEY`가 없으면 기존 OS 공유창(`navigator.share`, 파일 첨부)으로
자동 대체된다. 카카오 공유창을 쓰려면 위 사전 설정이 필요하다.
