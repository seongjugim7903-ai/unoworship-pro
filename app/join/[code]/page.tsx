// 초대 링크 — 화면 본체는 features/membership 에 있다.
//   /join/<주소>   팀원에게 코드를 적게 하지 않고 링크만 보낸다
//
// 이 페이지는 껍데기다. 초대가 살아 있는지, 누가 부르는지, 로그인했는지는 전부
// 브라우저에서 물어본다(InvitePanel). 서버에서 사람마다 다른 것을 읽지 않는다.
//
// 그래서 캐시할 수 있게 둔다 — 이게 중요하다. 동적 라우트를 그냥 두면 Next 가
// no-store 를 붙이는데, 브라우저는 no-store 로 내려온 페이지에는 앱 설치를 제안하지
// 않는다. 같은 폰에서 홈(/)에서는 설치창이 뜨는데 초대 화면에서만 안 뜨던 원인이
// 이것이었다. 주소마다 내용이 달라지지 않으므로 캐시해도 잃는 것이 없다.

import InvitePanel from '../../../features/membership/InvitePanel';

/* 미리 만들어 둘 주소는 없다. 들어오는 대로 만들고 캐시한다 */
export function generateStaticParams() {
  return [];
}

export const revalidate = 3600;

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <InvitePanel code={code} />;
}
