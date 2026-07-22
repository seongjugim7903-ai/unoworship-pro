/**
 * electron/auth/verify.js
 * 디바이스 토큰 서버 검증 + 오프라인 Grace 로직
 *
 * 반환 결과(status):
 *   'ok'                       — 정상, 기동 진행
 *   'offline_grace'            — 네트워크 실패지만 30일 이내 캐시 있음 → 진행
 *   'grace_expired'            — 30일 초과 → 차단, 재로그인 유도
 *   'invalid_token'            — 401, 토큰 삭제 후 재로그인
 *   'subscription_expired'     — 403, 재결제 유도 모달
 *   'no_token'                 — 토큰 아예 없음, 최초 로그인
 */

const { loadToken, updateAfterVerify, clearToken } = require('./tokenStore');

const OFFLINE_GRACE_DAYS = 30;
const VERIFY_TIMEOUT_MS = 5000;

async function verifyWithServer(serverUrl, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(`${serverUrl}/api/auth/device/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Token': token,
      },
      body: '{}',
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    return { networkOk: true, status: res.status, body };
  } catch {
    return { networkOk: false, status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

function withinGrace(lastVerifiedAt) {
  if (!lastVerifiedAt) return false;
  const diffMs = Date.now() - new Date(lastVerifiedAt).getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);
  return days <= OFFLINE_GRACE_DAYS;
}

/**
 * @param {string} serverUrl  Next.js 서버 URL (로컬에서 기동된 것)
 * @returns {Promise<{status: string, reason?: string, snapshot?: object | null}>}
 */
async function checkAuth(serverUrl) {
  const stored = loadToken();
  if (!stored) return { status: 'no_token' };

  const result = await verifyWithServer(serverUrl, stored.token);

  // 1. 네트워크 성공
  if (result.networkOk) {
    if (result.status === 200 && result.body?.ok) {
      updateAfterVerify({ snapshot: result.body.subscription ?? null });
      return { status: 'ok', snapshot: result.body.subscription ?? null };
    }
    if (result.status === 401) {
      // 토큰 무효 or revoked → 삭제하고 로그인 유도
      clearToken();
      return { status: 'invalid_token', reason: result.body?.reason };
    }
    if (result.status === 403) {
      // 구독 만료 — 토큰은 유지 (재결제 후 재사용)
      return { status: 'subscription_expired', snapshot: result.body?.subscription ?? null };
    }
    // 기타 5xx — 네트워크 실패로 처리 (오프라인 grace 적용)
  }

  // 2. 네트워크 실패 — 오프라인 grace 판단
  if (withinGrace(stored.lastVerifiedAt)) {
    return { status: 'offline_grace', snapshot: stored.snapshot };
  }
  return { status: 'grace_expired' };
}

module.exports = { checkAuth, OFFLINE_GRACE_DAYS };
