/**
 * electron/auth/loginWindow.js
 * 최초 설치 또는 토큰 무효/만료 시 열리는 로그인 창
 *
 * 흐름:
 *   1. loginWindow 열기 → serverUrl/login?redirectTo=/auth/device/bridge?...
 *   2. 사용자가 로그인 → 미들웨어가 /auth/device/bridge 로 redirect
 *   3. bridge 페이지가 /api/auth/device/issue 호출 → window.unolive.deviceIssued(...)
 *   4. 이 파일의 ipcMain 리스너가 토큰 수신 → tokenStore.saveToken → resolve
 *   5. loginWindow 닫고 main 이 3 모니터 창 배치 진행
 */

const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const { saveToken } = require('./tokenStore');

/**
 * @param {string} serverUrl
 * @param {'server'|'composer'} deviceType
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
function openLoginWindow(serverUrl, deviceType = 'server') {
  return new Promise((resolve) => {
    const deviceName = buildDeviceName(deviceType);

    const win = new BrowserWindow({
      width: 520,
      height: 720,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: 'UnoLive — 기기 인증',
      backgroundColor: '#f8fafc',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        additionalArguments: [
          `--unolive-device-type=${deviceType}`,
          `--unolive-device-name=${encodeURIComponent(deviceName)}`,
          `--unolive-os-platform=${process.platform}`,
        ],
      },
    });

    const bridgePath = `/auth/device/bridge?device_type=${deviceType}&device_name=${encodeURIComponent(deviceName)}&os_platform=${process.platform}`;
    const url = `${serverUrl}/login?redirectTo=${encodeURIComponent(bridgePath)}`;
    win.loadURL(url);

    let settled = false;

    const onIssued = (_ev, payload) => {
      if (settled) return;
      try {
        saveToken({
          token: payload.token,
          tokenId: payload.token_id,
          churchId: payload.church_id ?? null,
          deviceName,
          snapshot: payload.subscription ?? null,
        });
        settled = true;
        ipcMain.removeListener('device:issued', onIssued);
        ipcMain.removeListener('device:cancelled', onCancelled);
        win.close();
        resolve({ success: true });
      } catch (err) {
        console.error('[loginWindow] saveToken 실패:', err);
        resolve({ success: false, reason: 'save_failed' });
      }
    };

    const onCancelled = () => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('device:issued', onIssued);
      ipcMain.removeListener('device:cancelled', onCancelled);
      win.close();
      resolve({ success: false, reason: 'cancelled' });
    };

    ipcMain.on('device:issued', onIssued);
    ipcMain.on('device:cancelled', onCancelled);

    win.on('closed', () => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('device:issued', onIssued);
      ipcMain.removeListener('device:cancelled', onCancelled);
      resolve({ success: false, reason: 'window_closed' });
    });
  });
}

function buildDeviceName(deviceType) {
  const host = os.hostname().replace(/\.local$/, '');
  return `${host} · ${deviceType === 'server' ? '서버' : '컴포저'}`;
}

module.exports = { openLoginWindow };
