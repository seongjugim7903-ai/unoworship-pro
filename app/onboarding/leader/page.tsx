// 담당자 코드 입력 — 화면 본체는 features/membership 에 있다.
// 이 파일은 Next.js 가 요구하는 라우트 껍데기다.

import LeaderPanel from '../../../features/membership/LeaderPanel';

export default function Page() {
  return <LeaderPanel />;
}
