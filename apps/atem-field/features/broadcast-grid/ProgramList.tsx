'use client';

// 송출그리드 우측 레일의 프로그램 탭 — 세트리스트를 프로그램 단위로 훑어보고 점프·순서변경한다.
//   제목 클릭 = 그 프로그램 첫 섹션 선택(+맨 위로 스크롤). 송출은 하지 않는다 — Tab 프로그램 점프와 같은 규칙.
//   행을 위아래로 드래그하거나 ▲▼ 를 눌러 순서를 바꾼다. 둘 다 컴포즈 좌측 목록과 같은 store 경로를 쓴다.

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BroadcastGridProgram } from './broadcastGridPrograms';
import { blurThen } from './useBroadcastGridProgramJump';

interface ProgramListProps {
  programs: BroadcastGridProgram[];
  /** 현재 선택(활성) 섹션이 속한 프로그램 위치 */
  activeProgramIndex: number;
  /** 지금 송출 중인 섹션이 속한 프로그램 위치 */
  liveProgramIndex: number;
  onJump: (firstIndex: number) => void;
  /** itemId 프로그램을 targetItemId 자리로 옮긴다. 없으면 순서변경이 꺼진다. */
  onMove?: (itemId: string, targetItemId: string) => void;
}

interface ProgramRowProps {
  program: BroadcastGridProgram;
  order: number;
  isLive: boolean;
  isActive: boolean;
  previous?: BroadcastGridProgram;
  next?: BroadcastGridProgram;
  sortable: boolean;
  onJump: (firstIndex: number) => void;
  onMove?: (itemId: string, targetItemId: string) => void;
}

function ProgramRow({
  program, order, isLive, isActive, previous, next, sortable, onJump, onMove,
}: ProgramRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: program.itemId, disabled: !sortable });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      data-broadcast-grid-program-row={program.itemId}
      className={`flex min-w-0 touch-none items-center gap-0.5 border-b border-white/5 pr-0.5 ${
        sortable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${isLive ? 'bg-red-600/20' : isActive ? 'bg-sky-500/20' : ''}`}
    >
      <button
        type="button"
        data-broadcast-grid-program-index={program.firstIndex}
        aria-current={isActive ? 'true' : undefined}
        title={`${program.title} — ${program.firstIndex + 1}번으로 이동 (끌어서 순서 변경)`}
        onClick={blurThen(() => onJump(program.firstIndex))}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        <span
          className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-black tabular-nums ${
            isLive ? 'bg-red-500 text-white' : isActive ? 'bg-sky-400 text-black' : 'bg-[#2a2a2a] text-gray-400'
          }`}
        >
          {order + 1}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-[13px] leading-tight ${
            isLive || isActive ? 'font-bold text-white' : 'font-medium text-gray-200'
          }`}
        >
          {program.title}
        </span>
        <span className="flex-none font-mono text-[10px] text-gray-500">{program.sectionCount}</span>
      </button>

      {onMove && (
        // 화살표 위에서 누르면 드래그가 아니라 한 칸 이동이어야 하므로 포인터 이벤트를 여기서 끊는다.
        <span className="flex flex-none flex-col justify-center" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            data-broadcast-grid-program-move="up"
            disabled={!previous}
            title={previous ? `${program.title} 위로 이동` : '맨 위 프로그램입니다'}
            aria-label={`${program.title} 위로 이동`}
            onClick={blurThen(() => previous && onMove(program.itemId, previous.itemId))}
            className="flex h-[15px] w-5 items-center justify-center rounded text-[9px] leading-none text-gray-500 transition-colors hover:bg-white/15 hover:text-white disabled:pointer-events-none disabled:opacity-25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-300"
          >
            ▲
          </button>
          <button
            type="button"
            data-broadcast-grid-program-move="down"
            disabled={!next}
            title={next ? `${program.title} 아래로 이동` : '맨 아래 프로그램입니다'}
            aria-label={`${program.title} 아래로 이동`}
            onClick={blurThen(() => next && onMove(program.itemId, next.itemId))}
            className="flex h-[15px] w-5 items-center justify-center rounded text-[9px] leading-none text-gray-500 transition-colors hover:bg-white/15 hover:text-white disabled:pointer-events-none disabled:opacity-25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-300"
          >
            ▼
          </button>
        </span>
      )}
    </li>
  );
}

export default function ProgramList({
  programs,
  activeProgramIndex,
  liveProgramIndex,
  onJump,
  onMove,
}: ProgramListProps) {
  // 3px 이상 끌어야 드래그로 친다 — 제목 클릭(점프)이 드래그로 오인되지 않게. 컴포즈와 같은 설정.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!onMove || !over || active.id === over.id) return;
    onMove(String(active.id), String(over.id));
  };

  if (programs.length === 0) {
    return (
      <div
        role="tabpanel"
        aria-label="프로그램 목록"
        data-testid="broadcast-grid-program-list"
        className="flex min-h-0 flex-1 items-center justify-center px-3 text-center text-[12px] leading-relaxed text-gray-600"
      >
        세트리스트에 프로그램이 없습니다.
      </div>
    );
  }

  const rows = programs.map((program, order) => (
    <ProgramRow
      key={`${program.itemId}-${program.firstIndex}`}
      program={program}
      order={order}
      isLive={order === liveProgramIndex}
      isActive={order === activeProgramIndex}
      previous={programs[order - 1]}
      next={programs[order + 1]}
      sortable={Boolean(onMove)}
      onJump={onJump}
      onMove={onMove}
    />
  ));

  const list = (
    <ol
      role="tabpanel"
      aria-label="프로그램 목록"
      data-testid="broadcast-grid-program-list"
      className="min-h-0 flex-1 overflow-y-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {rows}
    </ol>
  );

  if (!onMove) return list;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={programs.map((p) => p.itemId)} strategy={verticalListSortingStrategy}>
        {list}
      </SortableContext>
    </DndContext>
  );
}
