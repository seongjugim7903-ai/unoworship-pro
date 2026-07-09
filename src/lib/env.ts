// 환경 플래그 — 현장 모드(UNOWORSHIP_FIELD_MODE)를 NODE_ENV와 분리한다 (DEV_PLAN §3-7)

/** 현장(오프라인 LAN) 모드 — 인증 우회 등은 이 플래그로만 판단. NODE_ENV와 무관. */
export function isFieldMode(): boolean {
  return process.env.UNOWORSHIP_FIELD_MODE === '1';
}
