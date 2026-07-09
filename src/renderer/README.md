# src/renderer — 출력 전용 (경계 규칙)

출력 라우트(fill/key/sub)의 렌더러 코드. **editor를 import할 수 없다** — 소켓 수신이 유일한 입력
(DEV_PLAN §3-5, eslint no-restricted-imports로 강제). Phase 1에서 레퍼런스의
canvasRenderer/AtemOutputCanvas/promptLayouts가 이곳으로 이식된다.
