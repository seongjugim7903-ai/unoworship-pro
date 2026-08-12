// 초대 링크 — 화면 본체는 features/membership 에 있다.
//   /join/<코드>   팀원에게 코드를 적게 하지 않고 링크만 보낸다

import InvitePanel from '../../../features/membership/InvitePanel';

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <InvitePanel code={code} />;
}
