# ATEM USB Relay v2

ATEM Webcam Clean Feed 한 개를 Mac mini 전면 USB-C에서 받아 Composer PGM,
Camera Grid, SUB PGM에 전달하는 독립 릴레이 모듈입니다.

## 운영 기준

1. Canvas 복사 루프를 사용하지 않고 `getUserMedia()`의 원본
   `MediaStreamTrack`을 WebRTC 송신기에 직접 연결합니다.
2. 부팅 직후 Blackmagic 장치가 늦게 나타나면 2초 간격으로 기다렸다가 자동
   연결합니다.
3. 재부팅으로 `deviceId`가 달라져도 저장된 장치 이름을 기준으로 다시 찾습니다.
4. 연결 시청자, 실제 캡처 해상도/FPS, 인코딩 프레임 진행, 재획득 횟수를
   진단 화면에 표시합니다. 연결된 시청자에게 12초 동안 인코딩 프레임이
   진행되지 않으면 캡처를 자동 재획득합니다.

## 경로

- Source: `/atem-usb-relay-v2`
- Viewer 계약: 기존 `CAMERAS_SOURCE` / `CAMERAS_VIEWER` Socket.io 및 WebRTC
  이벤트를 그대로 사용합니다.

## 하드웨어

- 입력: 현재 사용 중인 Mac mini 전면 USB-C의 Blackmagic/ATEM Webcam 장치
- 추가 USB-C/HDMI/SDI 연결 없음
- Fill/Key/SUB 출력 배선과 무관하며 기존 3화면 구조를 변경하지 않습니다.

## 이전 릴레이와의 관계

`components/cameras/CamerasSourcePage.tsx`는 수정하지 않고 비상 복귀용으로
남겨 둡니다. 운영 실행기는 새 경로만 열어 두 소스 퍼블리셔가 동시에 켜지는
상황을 방지합니다.
