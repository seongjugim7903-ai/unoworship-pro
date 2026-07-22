'use client';

/**
 * OnlineMembersCard — 현재 온라인인 팀원 목록
 */

import { useMediaStore } from '@/lib/media/mediaStore';
import { Avatar, Card, formatRelative, SectionLink } from './_shared';
import type { MediaRole } from '@/lib/media/mediaTypes';

const ROLE_LABELS: Record<MediaRole, string> = {
  head: '미디어부장',
  director: '감독',
  operator: '오퍼레이터',
  conti: '찬양콘티',
  subtitle: '자막',
  camera: '카메라',
  audio: '음향',
  editor: '영상편집',
  photographer: '사진',
  volunteer: '자원봉사',
};

export default function OnlineMembersCard() {
  const members = useMediaStore((s) => s.members);
  const onlineMembers = members.filter((m) => m.online);
  const offlineMembers = members.filter((m) => !m.online).slice(0, 4);

  return (
    <Card
      title="지금 함께 있는 사람"
      hint={`온라인 ${onlineMembers.length}명 · 전체 ${members.length}명`}
      action={<SectionLink href="/media/team/members">모두 보기 →</SectionLink>}
    >
      <div className="space-y-4 overflow-y-auto max-h-[320px] pr-1">
        <div>
          <p className="text-[10px] font-semibold tracking-wide text-green-600 uppercase mb-2">
            ● 온라인
          </p>
          <ul className="space-y-1">
            {onlineMembers.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-gray-50 transition-colors"
              >
                <div className="relative">
                  <Avatar name={m.name} size={30} />
                  <span className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-gray-900 truncate">
                    {m.name}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {ROLE_LABELS[m.role]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {offlineMembers.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase mb-2">
              오프라인
            </p>
            <ul className="space-y-1">
              {offlineMembers.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 py-1.5 px-2 rounded-md opacity-60"
                >
                  <Avatar name={m.name} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-gray-700 truncate">
                      {m.name}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {m.lastSeenAt ? formatRelative(m.lastSeenAt) : '오프라인'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
