// 교회 관리자 — 코드 발급과 팀 관리 — 화면 본체는 features/membership 에 있다.
// 이 파일은 Next.js 가 요구하는 라우트 껍데기다.

import AdminPanel from '../../features/membership/AdminPanel';

export default function Page() {
  return <AdminPanel />;
}
