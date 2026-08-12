// 설치를 건너 초대 코드를 넘겨주는 다리.
//
// 홈 화면 아이콘은 매니페스트의 start_url(`/`)로 열린다. 설치하기 직전에 보고 있던
// `/join/ulju-sunday1` 로 열리지 않는다. 그래서 설치 안내를 띄우는 순간 코드를
// 브라우저에 적어 두고, 앱으로 처음 들어왔을 때 그것을 읽어 초대를 이어간다.
//
// 안드로이드는 Chrome 과 설치된 앱(WebAPK)이 같은 저장소를 쓰므로 그대로 넘어간다.
// iOS 는 Safari 와 홈 화면 웹앱의 저장소가 갈릴 수 있어 넘어가지 않을 수 있다 —
// 그때를 위해 안내 화면 아래에 코드를 그대로 적어 둔다. 주소가 영문 이름이라
// 손으로 넣어도 부담이 적다.

const KEY = 'ulju:pending-invite';

export function rememberInvite(code: string): void {
  try { window.localStorage.setItem(KEY, code); } catch { /* 사생활 보호 모드 등 — 없으면 없는 대로 */ }
}

export function readPendingInvite(): string {
  try { return window.localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}

export function forgetInvite(): void {
  try { window.localStorage.removeItem(KEY); } catch { /* 무시 */ }
}
