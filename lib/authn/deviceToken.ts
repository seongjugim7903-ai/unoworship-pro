/**
 * lib/authn/deviceToken.ts
 * 디바이스 토큰 발급 / 해시 / 구독 스냅샷 헬퍼
 * (apps/atem-field/lib/auth/deviceToken.ts 에서 클라우드로 이식 — 2026-07-23)
 *
 * 보안 원칙:
 *   - 평문 토큰은 발급 시 딱 1회만 노출. DB 에는 sha256 해시만 저장.
 *   - 32바이트 랜덤 → base64url 인코딩 (URL-safe, 43자)
 */

import crypto from 'crypto';

/** 새 디바이스 토큰 생성. 반환: 평문 토큰(고객에게 1회 노출) */
export function generateDeviceToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** 토큰 → sha256 hex (DB 저장용). */
export function hashDeviceToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 구독 스냅샷 생성 — Electron 오프라인 캐시에도 이 모양이 들어감.
 * active/trial 구독이 없으면 null.
 */
export interface SubscriptionSnapshot {
  plan: string;
  status: string;
  expires_at: string | null;
  trial_ends_at: string | null;
  snapshot_at: string; // ISO
}

export function buildSubscriptionSnapshot(
  row: { plan: string; status: string; expires_at: string | null; trial_ends_at: string | null } | null
): SubscriptionSnapshot | null {
  if (!row) return null;
  return {
    plan: row.plan,
    status: row.status,
    expires_at: row.expires_at,
    trial_ends_at: row.trial_ends_at,
    snapshot_at: new Date().toISOString(),
  };
}

/** 구독이 현재 유효한가? (active 또는 trial + 만료 이전) */
export function isSubscriptionActive(snap: SubscriptionSnapshot | null): boolean {
  if (!snap) return false;
  if (snap.status !== 'active' && snap.status !== 'trial') return false;
  if (!snap.expires_at) return true; // expires_at null = 영구
  return new Date(snap.expires_at) > new Date();
}
