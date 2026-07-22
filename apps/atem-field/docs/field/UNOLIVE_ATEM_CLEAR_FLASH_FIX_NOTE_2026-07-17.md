# ATEM Fill/Key 송출해제 번쩍임 수정 메모

예배 중에는 코드 수정하지 않고, 예배 후 아래 방향으로 구현한다.

## 현상

- 송출그리드 또는 번호 입력에서 `Delete`로 송출해제할 때 화면이 순간적으로 번쩍이는 느낌이 있다.
- 현재 해제는 주로 `CLEAR_TEXT`를 보내 `/atem-fill`, `/atem-key` 브라우저 화면을 비우는 방식이다.
- ATEM DSK가 `ON AIR`인 상태에서 Fill/Key 화면이 미세하게 다른 프레임에 비워지면 검정 Fill 또는 이전 Key가 잠깐 합성될 수 있다.

## 판단

- Fill과 Key를 각각 비우는 것보다, ATEM의 한 Keyer를 먼저 컷으로 내리는 것이 안전하다.
- `autoDownstreamKey(false)`처럼 rate가 걸리는 전환보다 `setDownstreamKeyOnAir(false)` 컷 해제가 예배 중 즉시 해제에 적합하다.

## 구현 방향

1. `Delete` 송출해제 시 `CLEAR_TEXT` 전에 `/api/atem?action=dsk`로 `{ "onAir": false }`를 먼저 보낸다.
2. 그 다음 Fill/Key 브라우저 화면에 `CLEAR_TEXT`를 보내 내부 화면을 정리한다.
3. 다음 송출 시에는 Fill/Key 화면이 먼저 갱신된 뒤 DSK `ON AIR`를 올리는 순서를 검토한다.
4. ATEM 미연결 상태에서는 기존처럼 `CLEAR_TEXT`만 수행하게 fallback한다.

## 주의

- 예배 중 운영자가 직접 DSK를 내린 상태를 서버 자동 연결이 다시 올리지 않도록 기존 `fillKeyEnsured` 정책은 유지한다.
- `/atem-main`, `/atem-sub` 출력 분리 로직과 PMT 레이아웃 로직은 건드리지 않는다.
