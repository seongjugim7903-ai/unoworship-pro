// 교회 참여 — 로그인과 참여 코드 — 화면 본체는 features/membership 에 있다.
// 이 파일은 Next.js 가 요구하는 라우트 껍데기다.

import JoinPanel from '../../features/membership/JoinPanel';

export default function Page() {
  return <JoinPanel />;
}
