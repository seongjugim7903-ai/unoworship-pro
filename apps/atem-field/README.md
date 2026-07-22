# UnoWorship Pro ATEM Field

교회 방송실에 설치할 UnoWorship Pro Electron 자막 프로그램의 클린 소스다.

현재 상태는 기존 `UnoLive-plus-atem-field` 운영판에서 코드와 운영 스크립트만 선별한 기준점이다. 아직 설치용 DMG 완성 상태가 아니며, Next.js standalone 런타임·외부 로컬 라이브러리·Electron 4화면 배치를 구현하고 검증한 뒤 배포한다.

## 제품 역할

- Composer 자막 편집·송출 제어
- ATEM Fill/Key 출력
- 무대용 Sub 출력
- ATEM USB 카메라 릴레이
- 라이브·녹화·송출그리드 운영
- 구독 교회 웹 입력자료 수동 가져오기

## 개발 실행

```bash
npm ci
cp .env.example .env.local
npm run dev
```

기본 주소:

```text
http://localhost:3000/composer
```

현장 4화면 비상 실행은 `scripts/UnoLive-Pro-4Screen-Start.command`를 사용한다. 이 스크립트는 특정 교회의 EDID와 ATEM IP를 포함할 수 있으므로 정식 Electron에서는 교회별 설정 프로필로 대체한다.

## 데이터 원칙

이 폴더와 GitHub에는 다음 실데이터를 넣지 않는다.

- 성경·찬송가·CCM 원문
- 교회 PPT·악보·미디어
- 실제 예배 프로그램
- 생성 이미지와 녹화 파일
- `.env.local`, 인증 토큰, 서비스 역할 키

최종 설치 앱은 `~/Documents/UnoWorship Library`를 로컬 자료 저장소로 사용한다. 앱 코드와 교회 데이터는 분리한다.

상세 절차는 저장소 루트의 `docs/UNOWORSHIP_PRO_GITHUB_ELECTRON_RELEASE_RUNBOOK.md`를 따른다.
