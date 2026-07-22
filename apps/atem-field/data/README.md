# Local Data Placeholder

이 디렉터리는 개발 중 경로 호환을 위한 빈 자리다. 실제 교회 데이터는 GitHub에 커밋하지 않는다.

정식 Electron 앱은 프로젝트 내부 `data/`가 아니라 `~/Documents/UnoWorship Library`를 사용한다. 기존 API의 `process.cwd()/data` 참조는 공통 `LocalLibraryPath` 모듈로 이전해야 한다.
