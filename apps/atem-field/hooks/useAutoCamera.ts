/**
 * useAutoCamera.ts
 * PC1 아웃풋 자동 카메라 연결 훅
 *
 * 동작 순서:
 * 1. localStorage 에 저장된 deviceId 있으면 → 즉시 자동 연결, 선택창 없음
 * 2. 저장된 deviceId 없으면 → 카메라 목록 스캔
 *    a. ATEM/Blackmagic 장치 감지되면 → 자동 연결 + 저장
 *    b. 카메라가 1개뿐이면 → 자동 연결 + 저장
 *    c. 여러 개이고 ATEM 없으면 → 선택창 표시
 * 3. 선택창에서 장치 선택 시 → 저장 + 연결
 * 4. 더블클릭 → 선택창 다시 열기 (장치 변경 또는 문제 해결용)
 *
 * ATEM 자동 감지 키워드: 'atem', 'blackmagic', 'decklink'
 */

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'unoLive-camera-device';

// ATEM/Blackmagic 계열 장치 자동 감지 키워드
const ATEM_KEYWORDS = ['atem', 'blackmagic', 'decklink', 'intensity', 'ultrastudio'];

function isAtemDevice(label: string): boolean {
  const lower = label.toLowerCase();
  return ATEM_KEYWORDS.some((kw) => lower.includes(kw));
}

interface UseAutoCameraResult {
  deviceId: string | undefined;
  showSelector: boolean;
  availableDevices: MediaDeviceInfo[];
  selectCamera: (deviceId: string) => void;
  openSelector: () => void;
  isAutoConnected: boolean;  // 자동 연결 성공 여부
}

export function useAutoCamera(options?: { skip?: boolean }): UseAutoCameraResult {
  const skip = options?.skip ?? false;
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [showSelector, setShowSelector] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [isAutoConnected, setIsAutoConnected] = useState(false);

  // ── 공통: 현재 카메라 목록으로 최적 장치 자동 선택 ──
  //   init 과 devicechange 이벤트에서 모두 사용
  const autoSelect = useCallback((videoDevices: MediaDeviceInfo[]): string | null => {
    if (videoDevices.length === 0) return null;
    const saved = localStorage.getItem(STORAGE_KEY);

    // 1. 저장된 장치가 여전히 존재하면 그걸 사용
    if (saved && videoDevices.some((d) => d.deviceId === saved)) {
      return saved;
    }
    // 2. ATEM/Blackmagic 우선
    const atem = videoDevices.find((d) => isAtemDevice(d.label));
    if (atem) {
      localStorage.setItem(STORAGE_KEY, atem.deviceId);
      return atem.deviceId;
    }
    // 3. 그 외 — 첫 번째 장치
    localStorage.setItem(STORAGE_KEY, videoDevices[0].deviceId);
    return videoDevices[0].deviceId;
  }, []);

  // ── 초기화: 저장된 장치 또는 ATEM 자동 감지 ──
  useEffect(() => {
    if (skip) return;
    async function init() {
      try {
        // 카메라 권한 요청 (label 획득용)
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        stream.getTracks().forEach((t) => t.stop());

        const all = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = all.filter((d) => d.kind === 'videoinput');
        setAvailableDevices(videoDevices);

        const chosen = autoSelect(videoDevices);
        if (chosen) {
          setDeviceId(chosen);
          setIsAutoConnected(true);
          setShowSelector(false);
        }
      } catch {
        // 권한 거부 또는 장치 없음 — 아직 카메라 안 켜진 상태.
        // devicechange 이벤트가 아래에서 걸려 있으므로 나중에 연결되면 자동 처리됨.
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 핫플러그 감지: 카메라 연결/해제 시 자동 재감지 ──
  //   사용자가 페이지 로드 후에 카메라를 켜거나 케이블을 뽑았다 끼워도 자동 반영
  useEffect(() => {
    if (skip) return;
    const handleDeviceChange = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        let videoDevices = all.filter((d) => d.kind === 'videoinput');
        setAvailableDevices(videoDevices);

        console.log('[useAutoCamera] devicechange 감지 — 카메라:', videoDevices.length, '개');

        // 권한이 없어 label 이 비어 있으면 권한 재요청
        if (videoDevices.length > 0 && videoDevices.every((d) => !d.label)) {
          try {
            const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            s.getTracks().forEach((t) => t.stop());
            const all2 = await navigator.mediaDevices.enumerateDevices();
            videoDevices = all2.filter((d) => d.kind === 'videoinput');
            setAvailableDevices(videoDevices);
          } catch { /* ignore */ }
        }

        // 현재 사용 중인 장치가 사라진 경우 → 재선택
        if (deviceId && !videoDevices.some((d) => d.deviceId === deviceId)) {
          console.log('[useAutoCamera] 현재 장치 분리됨 — 재선택 시도');
          const chosen = autoSelect(videoDevices);
          if (chosen) {
            setDeviceId(chosen);
            setIsAutoConnected(true);
          } else {
            setDeviceId(undefined);
            setIsAutoConnected(false);
          }
          return;
        }

        // 아직 장치 없었는데 방금 카메라 연결됨 → 자동 연결
        if (!deviceId && videoDevices.length > 0) {
          console.log('[useAutoCamera] 카메라 신규 감지 — 자동 연결');
          const chosen = autoSelect(videoDevices);
          if (chosen) {
            setDeviceId(chosen);
            setIsAutoConnected(true);
          }
        }
      } catch (err) {
        console.warn('[useAutoCamera] devicechange 처리 실패:', err);
      }
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [deviceId, autoSelect, skip]);

  // ── 장치 선택 (선택창에서 클릭 시) ──
  const selectCamera = useCallback((id: string) => {
    setDeviceId(id);
    localStorage.setItem(STORAGE_KEY, id);
    setIsAutoConnected(false);
    setShowSelector(false);
  }, []);

  // ── 선택창 열기 (더블클릭 등) ──
  const openSelector = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setAvailableDevices(all.filter((d) => d.kind === 'videoinput'));
    } catch { /* ignore */ }
    setShowSelector(true);
  }, []);

  return {
    deviceId,
    showSelector,
    availableDevices,
    selectCamera,
    openSelector,
    isAutoConnected,
  };
}
