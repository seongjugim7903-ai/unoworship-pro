'use client';

/**
 * BroadcastMenu — 송출 메뉴 그룹
 *
 * MiddleTopMenu의 우측에 마운트되어 라이브 버튼과 준비 중 녹화 버튼을 제공합니다.
 * 추후 설정 아이콘, 상태 배지 등 확장 가능.
 */

import RecordButton from './RecordButton';
import LiveButton from './LiveButton';

export default function BroadcastMenu() {
  return (
    <div className="flex items-center gap-1">
      <RecordButton />
      <LiveButton />
    </div>
  );
}
