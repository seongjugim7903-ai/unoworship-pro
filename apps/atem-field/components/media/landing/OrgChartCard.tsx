'use client';

/**
 * OrgChartCard — 교회 미디어부 조직도 (트리)
 *
 * 자막협조 지휘체계의 핵심 시각화.
 * parentId 기준으로 부서를 재귀 렌더.
 */

import { useMediaStore } from '@/lib/media/mediaStore';
import type { Department, Member } from '@/lib/media/mediaTypes';
import { Card, SectionLink } from './_shared';

export default function OrgChartCard() {
  const departments = useMediaStore((s) => s.departments);
  const members = useMediaStore((s) => s.members);

  const roots = departments.filter((d) => !d.parentId);

  return (
    <Card
      title="부서 지휘체계"
      hint="미디어부 + 찬양팀 · 실시간 온라인 표시"
      action={<SectionLink href="/media/team/org-chart">전체 보기 →</SectionLink>}
    >
      <div className="space-y-4">
        {roots.map((root) => (
          <DeptNode
            key={root.id}
            dept={root}
            allDepts={departments}
            allMembers={members}
          />
        ))}
      </div>
    </Card>
  );
}

function DeptNode({
  dept,
  allDepts,
  allMembers,
  depth = 0,
}: {
  dept: Department;
  allDepts: Department[];
  allMembers: Member[];
  depth?: number;
}) {
  const children = allDepts
    .filter((d) => d.parentId === dept.id)
    .sort((a, b) => a.order - b.order);
  const leader = allMembers.find((m) => m.id === dept.leaderId);
  const deptMembers = allMembers.filter((m) => m.departmentIds.includes(dept.id));
  const onlineCount = deptMembers.filter((m) => m.online).length;

  return (
    <div style={{ paddingLeft: depth * 16 }}>
      <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: dept.color ?? '#9ca3af' }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-gray-900 truncate">
              {dept.name}
            </span>
            {leader && (
              <span className="text-[10px] text-gray-500">· {leader.name}</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-500">
            <span>{deptMembers.length}명</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {onlineCount}명 온라인
            </span>
          </div>
        </div>
        <MembersPreview members={deptMembers.slice(0, 4)} total={deptMembers.length} />
      </div>
      {children.length > 0 && (
        <div className="ml-3 border-l border-dashed border-gray-200">
          {children.map((child) => (
            <DeptNode
              key={child.id}
              dept={child}
              allDepts={allDepts}
              allMembers={allMembers}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MembersPreview({ members, total }: { members: Member[]; total: number }) {
  return (
    <div className="flex -space-x-2 shrink-0">
      {members.map((m) => (
        <div
          key={m.id}
          className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white shadow-sm ${
            m.online ? 'bg-gradient-to-br from-violet-400 to-indigo-500' : 'bg-gray-400'
          }`}
          title={m.name}
        >
          {m.name.slice(0, 1)}
        </div>
      ))}
      {total > members.length && (
        <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[9px] font-bold text-gray-600 shadow-sm">
          +{total - members.length}
        </div>
      )}
    </div>
  );
}
