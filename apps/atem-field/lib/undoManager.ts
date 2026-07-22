/**
 * undoManager.ts
 * 캔버스 요소 Undo/Redo 히스토리 관리 모듈
 *
 * - elements 스냅샷 기반의 undo/redo 스택
 * - 최대 50단계 히스토리 보관
 * - 싱글톤 패턴으로 전역 상태 유지
 *
 * 지원하는 작업 유형:
 *
 *  1) 이산적(discrete) 변경 — pushState()
 *     색상 변경, 토글(lock/visible), 폰트 선택 등
 *     매 변경 전에 pushState() 호출 → 1회 변경 = 1 undo 단계
 *
 *  2) 연속적(continuous) 변경 — beginBatch() + endBatch()
 *     드래그 이동, 리사이즈, 회전, 텍스트 인라인 편집, 슬라이더 드래그 등
 *     beginBatch() → 스냅샷 1회 저장 → 중간의 pushState 무시 → endBatch()
 *     전체 연속 조작 = 1 undo 단계
 *
 * 사용법:
 *   pushState(elements)          — 변경 전 상태를 스택에 푸시 (discrete)
 *   beginBatch(elements)         — 연속 조작 시작, 스냅샷 1회 저장
 *   endBatch()                   — 연속 조작 종료
 *   undo(current) / redo(current) — 이전/다음 상태 반환
 */

import { CanvasElement } from '@/lib/canvasTypes';

// ─────────────────────────────────────────
// 설정
// ─────────────────────────────────────────
/**
 * 최대 undo 히스토리 단계 수
 * 피그마 기준: 세션당 100 단계
 */
const MAX_HISTORY = 100;

// ─────────────────────────────────────────
// 스냅샷 타입
// ─────────────────────────────────────────
type Snapshot = CanvasElement[];

/** 딥카피 — 중첩 객체(gradient, motion 등)도 안전하게 복사 */
function deepCopy(elements: CanvasElement[]): Snapshot {
  return JSON.parse(JSON.stringify(elements));
}

// ─────────────────────────────────────────
// UndoManager 클래스
// ─────────────────────────────────────────
class UndoManager {
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private _batchActive = false;

  /**
   * 현재 상태를 undo 스택에 기록 (변경이 일어나기 전에 호출)
   *
   * batch가 leak된 상태(endBatch 누락)면 자동으로 batch 종료 후 기록.
   * 이렇게 해야 텍스트 편집 등에서 endBatch가 호출되지 않은 경우에도
   * 이후 삭제·드래그 등의 Undo 체인이 끊기지 않음.
   */
  pushState(elements: CanvasElement[]): void {
    // 이전 batch가 leak된 경우 자동 정리
    this._batchActive = false;
    this._pushInternal(elements);
  }

  /**
   * 연속 조작 시작 — 스냅샷 1회 저장 후 batch 활성화
   *
   * 기존 batch가 남아있으면 먼저 종료 후 새 batch 시작 (leak 방지).
   * 이후 pushState() 호출은 endBatch()까지 내부적으로 batch 상태에서 동작하지만,
   * 드래그/리사이즈/회전/텍스트 편집 중에는 pushState가 호출되지 않으므로 문제 없음.
   */
  beginBatch(elements: CanvasElement[]): void {
    // 이전 batch가 leak된 경우 자동 정리 후 새 batch 시작
    this._batchActive = false;
    this._pushInternal(elements);
    this._batchActive = true;
  }

  /** 연속 조작 종료 */
  endBatch(): void {
    this._batchActive = false;
  }

  /** batch 활성 여부 조회 */
  get isBatchActive(): boolean {
    return this._batchActive;
  }

  /** Undo: 이전 상태 반환, 현재 상태는 redo 스택으로 이동 */
  undo(currentElements: CanvasElement[]): Snapshot | null {
    if (this.undoStack.length === 0) return null;
    this.redoStack.push(deepCopy(currentElements));
    return this.undoStack.pop()!;
  }

  /** Redo: 다음 상태 반환, 현재 상태는 undo 스택으로 이동 */
  redo(currentElements: CanvasElement[]): Snapshot | null {
    if (this.redoStack.length === 0) return null;
    this.undoStack.push(deepCopy(currentElements));
    return this.redoStack.pop()!;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** 히스토리 초기화 (섹션 전환 등) */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this._batchActive = false;
  }

  // ── 내부 ──────────────────────────────
  private _pushInternal(elements: CanvasElement[]): void {
    const snapshot = deepCopy(elements);
    this.undoStack.push(snapshot);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    // 새로운 변경이 들어오면 redo 스택 비움
    this.redoStack = [];
  }
}

// 싱글톤 인스턴스
export const undoManager = new UndoManager();
