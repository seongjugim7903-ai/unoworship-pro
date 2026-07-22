'use client';

/**
 * /cameras-source
 * [FEATURE: CAMERAS_RELAY]
 *
 * 서버 Mac mini 에서만 실행되는 카메라 퍼블리셔 페이지.
 *
 * 워크플로:
 *   1. 페이지 로드 → enumerateDevices 로 비디오 장치 목록 조회
 *   2. 사용자가 "ATEM MultiView 캡처" 장치 선택 (localStorage 저장)
 *   3. 선택된 장치를 getUserMedia 로 획득
 *   4. 1920×1080 캔버스에 그려넣기 (rAF 루프)
 *   5. canvas.captureStream() → useCamerasPublisher 로 WebRTC 송출
 *   6. 같은 LAN 의 원격 composer CameraGrid 가 구독 → 4분할 표시
 *
 * 이 페이지는 시각적 출력이 아닌 "릴레이 전용" 페이지이므로
 * 서버 Mac mini 에서 키오스크/백그라운드 탭으로 열어두면 됨.
 */

import CamerasSourcePage from '@/components/cameras/CamerasSourcePage';

export default function Page() {
  return <CamerasSourcePage />;
}
