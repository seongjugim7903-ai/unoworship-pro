'use client';

// 카메라 1~4 ↔ ATEM 프로그램 전환 제어 훅 — 수동 클릭 전환 + 섹션 송출 연동 자동 전환 (UI와 분리된 단독 모듈)

/**
 * [FEATURE: CAMERA_SWITCH]
 *
 * 제공 기능:
 *   1. 수동 전환 — selectCamera(slot): 타일 클릭 → ATEM ME1 컷 (`/api/atem?action=program`)
 *   2. 탈리 — atemStatus.programInput (3초 폴링) 으로 현재 프로그램 타일 식별
 *   3. 슬롯↔입력 매핑 — localStorage `unolive-camera-atem-inputs` (기본 [1,2,3,0],
 *      슬롯4 비활성: 이 현장 입력4는 맥 Fill — 오전환 방지)
 *   4. 카메라별 프로그램 지정 — localStorage `unolive-camera-program-map`
 *   5. 섹션 송출 연동 자동 전환 — 지정된 프로그램의 섹션이 송출되면 그 카메라로 컷
 *
 * ⚠ 자동 전환 안전 설계 (2026-07-08 사고 교훈 — 절대 완화하지 말 것):
 *   - `_hydrated` 게이트: 스토어 하이드레이션 완료 전의 broadcastSection 변화는 전부 무시.
 *   - 기준점(baseline) 처리: 하이드레이션 직후 처음 관측한 값은 "복원값"으로 간주하고
 *     기준점만 잡는다. 이후 참조가 **바뀔 때만** 실제 송출로 인정.
 *   → 컴포저를 열거나 리로드하는 것만으로는 어떤 경우에도 카메라가 움직이지 않는다
 *     (마운트 송출 금지 원칙).
 */

import { useEffect, useRef, useState } from 'react';
import { useAtemStatus } from '@/hooks/useAtemStatus';
import { useStore } from '@/lib/store';

const CAMERA_INPUT_MAP_KEY = 'unolive-camera-atem-inputs';
const DEFAULT_CAMERA_INPUT_MAP = [1, 2, 3, 0];
const CAMERA_PROGRAM_MAP_KEY = 'unolive-camera-program-map';

function loadCameraInputMap(): number[] {
  if (typeof window === 'undefined') return DEFAULT_CAMERA_INPUT_MAP;
  try {
    const raw = localStorage.getItem(CAMERA_INPUT_MAP_KEY);
    if (!raw) return DEFAULT_CAMERA_INPUT_MAP;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 4 && parsed.every((n) => Number.isInteger(n) && n >= 0)) {
      return parsed;
    }
  } catch { /* 손상된 값은 기본값으로 */ }
  return DEFAULT_CAMERA_INPUT_MAP;
}

function loadCameraProgramMap(): (string | null)[] {
  if (typeof window === 'undefined') return [null, null, null, null];
  try {
    const raw = localStorage.getItem(CAMERA_PROGRAM_MAP_KEY);
    if (!raw) return [null, null, null, null];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 4) {
      return parsed.map((v) => (typeof v === 'string' && v ? v : null));
    }
  } catch { /* 손상된 값은 기본값으로 */ }
  return [null, null, null, null];
}

/** 기준점 미설정 표시용 센티널 (broadcastSection이 null일 수 있어 undefined와 구분) */
const BASELINE_UNSET = Symbol('baseline-unset');

export function useCameraSwitch() {
  const { status: atemStatus, refetch: refetchAtem } = useAtemStatus();
  const [inputMap] = useState<number[]>(loadCameraInputMap);
  const [programMap, setProgramMap] = useState<(string | null)[]>(loadCameraProgramMap);
  const [switchingSlot, setSwitchingSlot] = useState<number | null>(null);
  const atemConnected = atemStatus?.state === 'connected';

  const hydrated = useStore((s) => s._hydrated);
  const broadcastSection = useStore((s) => s.broadcastSection);

  const assignProgram = (slot: number, itemId: string | null) => {
    setProgramMap((prev) => {
      const next = [...prev];
      next[slot] = itemId;
      try {
        localStorage.setItem(CAMERA_PROGRAM_MAP_KEY, JSON.stringify(next));
      } catch { /* 저장 실패는 무시 (세션 내 상태는 유지) */ }
      return next;
    });
  };

  const selectCamera = async (slot: number) => {
    const input = inputMap[slot];
    if (!input || !atemConnected || switchingSlot !== null) return;
    setSwitchingSlot(slot);
    try {
      const res = await fetch('/api/atem?action=program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.warn('[cameraSwitch] 프로그램 전환 실패:', data?.error ?? res.status);
      }
      refetchAtem();
    } catch (err) {
      console.warn('[cameraSwitch] 프로그램 전환 요청 오류:', err);
    } finally {
      setSwitchingSlot(null);
    }
  };

  // ── 섹션 송출 연동 자동 전환 (안전 게이트 — 상단 주석 참조) ─────────────────
  const baselineRef = useRef<typeof broadcastSection | typeof BASELINE_UNSET>(BASELINE_UNSET);
  useEffect(() => {
    // 게이트 1: 하이드레이션 완료 전 값은 전부 무시 (복원 중간값 포함)
    if (!hydrated) return;
    // 게이트 2: 하이드레이션 후 첫 관측값 = 기준점 (복원값이든 null이든 송출 아님)
    if (baselineRef.current === BASELINE_UNSET) {
      baselineRef.current = broadcastSection;
      return;
    }
    // 참조가 안 바뀌었으면 새 송출 아님
    if (broadcastSection === baselineRef.current) return;
    baselineRef.current = broadcastSection;
    if (!broadcastSection) return;

    const slot = programMap.findIndex((id) => id !== null && id === broadcastSection.itemId);
    if (slot < 0) return;
    const input = inputMap[slot];
    if (!input || !atemConnected) return;
    if (atemStatus?.programInput === input) return; // 이미 그 카메라
    void selectCamera(slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcastSection, hydrated]);

  return {
    atemStatus,
    atemConnected,
    inputMap,
    programMap,
    assignProgram,
    selectCamera,
    switchingSlot,
  };
}
