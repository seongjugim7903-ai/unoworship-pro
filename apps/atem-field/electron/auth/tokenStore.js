/**
 * electron/auth/tokenStore.js
 * OS 키체인(safeStorage) 기반 디바이스 토큰 + 캐시 스토리지
 *
 * 저장 항목:
 *   device.token        — 평문 토큰 (safeStorage 로 암호화)
 *   device.tokenId      — 서버 DB 상 id (해제 시 사용)
 *   device.snapshot     — SubscriptionSnapshot JSON
 *   device.lastVerifiedAt — ISO 타임스탬프 (오프라인 grace 계산용)
 *   device.churchId
 *   device.deviceName
 *
 * 저장 위치:
 *   app.getPath('userData')/auth-store.json
 *   평문 토큰은 safeStorage.encryptString() 으로 암호화된 base64 문자열만 저장.
 */

const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

const FILE = () => path.join(app.getPath('userData'), 'auth-store.json');

function read() {
  try {
    const raw = fs.readFileSync(FILE(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function write(obj) {
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true });
    fs.writeFileSync(FILE(), JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.error('[tokenStore] 저장 실패:', err);
  }
}

function encryptString(plain) {
  if (!safeStorage.isEncryptionAvailable()) {
    // 키체인 사용 불가 환경(예: Linux 의 일부 헤드리스) — 평문 저장으로 폴백.
    // 프로덕션 환경(macOS/Windows)에서는 항상 암호화 가능.
    return 'PLAIN:' + Buffer.from(plain, 'utf-8').toString('base64');
  }
  return 'ENC:' + safeStorage.encryptString(plain).toString('base64');
}

function decryptString(stored) {
  if (!stored) return null;
  if (stored.startsWith('PLAIN:')) {
    return Buffer.from(stored.slice(6), 'base64').toString('utf-8');
  }
  if (stored.startsWith('ENC:')) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
    } catch {
      return null;
    }
  }
  return null;
}

function saveToken({ token, tokenId, churchId, deviceName, snapshot }) {
  const store = read();
  store.device = {
    token: encryptString(token),
    tokenId,
    churchId: churchId ?? null,
    deviceName,
    snapshot: snapshot ?? null,
    lastVerifiedAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
  };
  write(store);
}

function loadToken() {
  const { device } = read();
  if (!device) return null;
  const token = decryptString(device.token);
  if (!token) return null;
  return {
    token,
    tokenId: device.tokenId,
    churchId: device.churchId,
    deviceName: device.deviceName,
    snapshot: device.snapshot,
    lastVerifiedAt: device.lastVerifiedAt,
  };
}

function updateAfterVerify({ snapshot }) {
  const store = read();
  if (!store.device) return;
  store.device.snapshot = snapshot ?? null;
  store.device.lastVerifiedAt = new Date().toISOString();
  write(store);
}

function clearToken() {
  const store = read();
  delete store.device;
  write(store);
}

module.exports = {
  saveToken,
  loadToken,
  updateAfterVerify,
  clearToken,
};
