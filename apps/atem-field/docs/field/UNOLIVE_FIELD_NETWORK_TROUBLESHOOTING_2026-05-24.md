# UnoLive Field Network Troubleshooting - 2026-05-24

이 문서는 새로운 교회/행사장 네트워크에서 UnoLive-plus 접속, 송출, Socket.io 인증 문제가 발생했을 때 원인과 해결 순서를 빠르게 확인하기 위한 현장 기록이다.

## 울주교회 현장 사례

- 날짜: 2026-05-24
- 서버 PC: Mac mini 제어 PC
- 현장 서버 IP: `172.30.1.98`
- 게이트웨이: `172.30.1.254`
- 서버 포트: `3000`
- 기본 접속 주소: `http://172.30.1.98:3000/`
- 점검 주소:
  - `http://172.30.1.98:3000/lan-check.html`
  - `http://172.30.1.98:3000/socket-room-check.html`
  - `http://172.30.1.98:3000/login`

## 핵심 판단

울주교회에서 발생한 문제는 하나의 장애가 아니라 아래 단계가 섞인 현상이었다.

1. 새 현장 IP가 기존 허용 Host 목록에 없어서 `Forbidden / host not allowed`가 발생했다. 이후 서버 Mac의 현재 사설 LAN IP를 자동 허용하도록 보완했다.
2. 이후 HTTP 연결은 정상인데 Socket.io가 `unauthorized`를 반환했다. 이는 LAN 브라우저에 로그인 세션 또는 device token이 없어서 발생한 인증 문제다.
3. 일부 브라우저에서 `사이트에 연결할 수 없음`이 보였지만, Mac 서버에서 같은 URL이 `200 OK`로 확인되어 서버 다운은 아니었다. 이 경우는 브라우저 상태, 주소 입력, 프록시/VPN/보안 설정, 캐시, 일시적 네트워크 상태를 분리해서 본다.

## 증상별 원인과 솔루션

| 증상 | 주된 원인 | 확인 방법 | 솔루션 |
| --- | --- | --- | --- |
| `Forbidden` 또는 `host not allowed` | 현재 서버 IP가 자동 허용 목록에 잡히지 않았거나 수동 allowlist와 불일치 | 브라우저 주소의 IP, `/api/health`, 서버 시작 로그의 `allowedLanHosts` 비교 | `UNOLIVE_AUTO_ALLOW_LOCAL_LAN=1` 확인 후 서버 재시작. 특수망이면 `UNOLIVE_SERVER_LAN_IP`, `UNOLIVE_ALLOWED_LAN_HOSTS`, `UNOLIVE_ALLOWED_WRITE_ORIGINS`에 현재 Mac IP 추가 |
| `lan-check.html`도 열리지 않음 | 서버 미실행, 포트 미개방, 방화벽, 서로 다른 네트워크/VLAN | Mac에서 `lsof -nP -iTCP:3000 -sTCP:LISTEN`, 클라이언트에서 `curl -I http://<IP>:3000/lan-check.html` | 서버 실행, Mac 방화벽 허용, 같은 공유기/대역 연결 확인 |
| `lan-check.html`은 정상, `/login`만 안 열림 | 브라우저 캐시/보안 확장/프록시 또는 주소 입력 문제 가능 | Mac에서 `curl -I http://<IP>:3000/login` 확인 | 짧은 주소 `http://<IP>:3000/login` 사용, 시크릿 창/다른 브라우저, 프록시/VPN 해제 |
| `socket-room-check.html`에서 `unauthorized` | HTTP 연결은 됐지만 Socket.io 인증 없음 | 로그인 전후로 socket-room-check 비교 | LAN 주소 기준으로 로그인 후 재시도. Electron 창은 device token, 일반 브라우저는 Supabase 로그인 세션 필요 |
| Broadcast dashboard에 `아웃풋 PC 송출 대기` 표시 | `/output` 창이 열려 있지 않아 PGM WebRTC 소스가 없음 | `/api/health`의 `roomCounts.output` 확인 | `http://<IP>:3000/output` 창을 아웃풋 PC/모니터에서 열고 송출 시작 |
| Compose는 열리지만 PGM 미러가 안 들어옴 | viewer/output room join 실패, 인증 세션 없음, WebRTC signaling 실패 | `socket-room-check.html`, `/api/health` room count 확인 | 로그인 세션 확인, Output 창 실행, 같은 LAN/VLAN 확인 |
| 프롬프트/강대상 화면 색이 초록/보라로 깨짐 | 앱 레이아웃 문제가 아니라 HDMI/SDI 컨버터, 케이블, 컬러 포맷/EDID 문제 가능성이 큼 | 같은 URL을 노트북 화면에서 직접 보면 색이 정상인지 비교 | 케이블/젠더 교체, 컨버터 방향 확인, 출력 해상도/주사율 고정, 다른 모니터로 교차 테스트 |

## 현장 진단 순서

### 1. Mac 서버 IP 확인

```bash
ipconfig getifaddr en0
ipconfig getifaddr en1
ifconfig | grep "inet "
```

현장에서는 Wi-Fi와 유선 어댑터가 동시에 잡힐 수 있다. 실제 노트북이 접속해야 하는 공유기 대역의 IP를 사용한다.

### 2. UnoLive 서버가 포트 3000을 열고 있는지 확인

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

정상 예:

```text
node  2195  ...  TCP *:3000 (LISTEN)
```

`127.0.0.1:3000`만 열려 있으면 같은 LAN 클라이언트가 접속할 수 없다. 운영 시에는 `UNOLIVE_BIND_HOST=0.0.0.0`이어야 한다.

### 3. Mac에서 자기 자신에게 HTTP 확인

```bash
curl -I http://<Mac-IP>:3000/lan-check.html
curl -I http://<Mac-IP>:3000/login
curl -s http://<Mac-IP>:3000/api/health
```

`200 OK`가 나오면 서버와 라우팅은 기본적으로 정상이다.

### 4. 클라이언트 노트북에서 LAN 체크

브라우저에서 아래 주소를 연다.

```text
http://<Mac-IP>:3000/lan-check.html
```

정상이어야 하는 항목:

- Canvas 2D
- WebGL/GPU
- 정적 파일
- 로그인 페이지
- Output 페이지 HTML
- WebSocket

### 5. 로그인 후 Socket 룸 체크

브라우저에서 먼저 로그인한다.

```text
http://<Mac-IP>:3000/login
```

그 다음 Socket 룸 체크를 연다.

```text
http://<Mac-IP>:3000/socket-room-check.html
```

`unauthorized`가 나오면 연결 문제가 아니라 인증 문제다. 같은 LAN 브라우저는 Electron device token이 없으므로 로그인 세션이 필요하다.

### 6. Output 창 확인

Broadcast dashboard PGM은 Compose가 직접 만드는 것이 아니라 `/output` 창이 최종 PGM을 렌더링하고 WebRTC로 넘겨주는 구조다.

따라서 아래 창이 반드시 하나 이상 열려 있어야 한다.

```text
http://<Mac-IP>:3000/output
```

`/api/health`에서 `roomCounts.output`이 `1` 이상이면 Output 창이 붙어 있는 상태다.

## 현장 환경 변수 체크

새 교회나 행사장에서는 아래 값이 현재 Mac IP와 일치해야 한다.

```bash
UNOLIVE_BIND_HOST=0.0.0.0
UNOLIVE_STRICT_HOSTS=1
UNOLIVE_AUTO_ALLOW_LOCAL_LAN=1
UNOLIVE_SERVER_LAN_IP=172.30.1.98
UNOLIVE_ALLOWED_LAN_HOSTS=localhost,127.0.0.1,172.30.1.98
UNOLIVE_ALLOWED_WRITE_ORIGINS=localhost,127.0.0.1,172.30.1.98
UNOLIVE_HEALTH_PUBLIC=1
UNOLIVE_LATENCY_PUBLIC=1
```

`UNOLIVE_AUTO_ALLOW_LOCAL_LAN`이 `1` 또는 미설정이면 서버 Mac이 현재 가지고 있는 사설 LAN IP는 자동 허용된다. 따라서 사무실 `192.168.0.8`, 울주교회 `172.30.1.98`처럼 이동해도 현재 서버 IP로 접속하면 기본적으로 통과한다.

고정 현장 IP를 명시적으로 관리해야 하면 아래 세 값은 같이 바꾼다.

- `UNOLIVE_SERVER_LAN_IP`
- `UNOLIVE_ALLOWED_LAN_HOSTS`
- `UNOLIVE_ALLOWED_WRITE_ORIGINS`

## 임시 우회 정책

시연 시간이 촉박하고 로그인/세션 문제 때문에 Socket.io만 막히는 경우, 개발 환경에서만 임시로 `UNOLIVE_SOCKET_DEV_BYPASS=1`을 켜는 방법이 있다.

주의:

- 이 설정은 같은 LAN의 인증 없는 브라우저가 Socket.io 룸에 붙을 수 있게 만들 수 있다.
- 고객 운영 기본값으로 저장하면 안 된다.
- 현장 시연용 임시 실행 옵션으로만 사용하고, 시연 후 끈다.

우선순위는 항상 로그인 세션 또는 device token 기반 인증 복구다.

## 제품화 개선 과제

현장마다 IP/공유기/방화벽/브라우저 상태가 달라지므로, 제품화 단계에서는 다음 기능을 넣는 것이 좋다.

1. 시작 시 현재 Mac의 주요 LAN IP 자동 표시
2. 접속 주소 QR 코드 표시
3. 허용 Host/Origin 자동 갱신 상태 표시 또는 설정 UI 제공
4. `lan-check`, `socket-room-check`, `/api/health`를 하나로 묶은 현장 진단 페이지 제공
5. 로그인 세션 없음, Output 창 없음, Host 미허용을 사용자 메시지로 명확히 분리
6. 교회별 네트워크 프로파일 저장
7. 출력 프로파일과 함께 네트워크 프로파일을 예배 장소 단위로 불러오기

## 운영 메모

- `사이트에 연결할 수 없음`은 서버 다운, 방화벽, 브라우저 상태가 모두 같은 문구로 보일 수 있으므로 `lan-check.html`부터 확인한다.
- `unauthorized`는 접속 실패가 아니라 인증 실패다.
- `아웃풋 PC 송출 대기`는 대개 `/output` 창이 없다는 뜻이다.
- 색상 깨짐은 앱보다 케이블/컨버터/EDID 계통일 가능성이 높다.
- 현장 시연 전에는 서버 PC, 송출 노트북, 강대상/프롬프트 출력 장치별로 주소와 역할을 종이에 적어두면 혼선이 크게 줄어든다.
