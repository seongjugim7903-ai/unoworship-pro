// 시퀀스 뱃지/타임라인 바 색상 (1~8 순환) — MotionPanel과 SequenceTimeline이 공유
export const SEQ_COLORS = [
  'bg-blue-600', 'bg-green-600', 'bg-yellow-600', 'bg-pink-600',
  'bg-purple-600', 'bg-cyan-600', 'bg-orange-600', 'bg-red-600',
];

export function seqColorOf(sequence: number): string {
  return sequence > 0 ? SEQ_COLORS[(sequence - 1) % SEQ_COLORS.length] : '';
}
