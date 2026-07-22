// [FEATURE: MOTION_SEQUENCE] 모션 시퀀스 개선 모듈 배럴 — docs/features/motion-sequence/ 참조
export { SEQ_COLORS, seqColorOf } from './sequenceColors';
export { useMotionPreview, startMotionPreview, stopMotionPreview } from './previewStore';
export { default as MotionPreviewOverlay } from './MotionPreviewOverlay';
export { MOTION_PRESETS } from './motionPresets';
export { default as MotionPresetRow } from './MotionPresetRow';
export { default as MotionToolbar } from './MotionToolbar';
export { default as SequenceTimeline } from './SequenceTimeline';
export { staggerSequence, compactSequences, swapSequence, getSequencedElements } from './autoStagger';
export type { MotionUpdate, StaggerOptions } from './autoStagger';
