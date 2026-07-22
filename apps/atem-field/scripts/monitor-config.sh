#!/bin/bash
# =============================================================
# scripts/monitor-config.sh
# 서버 PC(맥미니) 3대 확장 모니터의 macOS 디스플레이 좌표
#
# 모든 키오스크/런처 스크립트가 이 파일을 source 해서 사용.
# 교회별 배포 시 이 파일 한 곳만 수정하면 됨.
#
# 좌표 확인 방법:
#   1. 시스템 설정 → 디스플레이 → 정렬 (Arrangement) 탭
#   2. 각 모니터의 좌상단 픽셀 좌표가 X 값
#      (주의: 정렬 UI 에서 "가운데" 로 보여도 실제 X 값이 다를 수 있음)
#   3. 터미널에서:
#        system_profiler SPDisplaysDataType | grep -i "resolution"
# =============================================================

# ── 제어 모니터 (운영자 브로드캐스트 대시보드) ─────────────────
#   운영자가 직접 조작하는 에디터 화면 (기본 Main)
export MONITOR_CONTROL_X=0
export MONITOR_CONTROL_Y=0
export MONITOR_CONTROL_W=1920
export MONITOR_CONTROL_H=1080

# ── 중층 모니터 (찬양팀, 목사님 / 무대) ──────────────────────
#   /prompt — 프롬프트(가사·대지 크게 보여주기)
#   울주교회 ATEM Linear Key 현장 기준: 왼쪽 확장 화면
export MONITOR_PROMPT_X=-1920
export MONITOR_PROMPT_Y=0
export MONITOR_PROMPT_W=1920
export MONITOR_PROMPT_H=1080

# ── 강대상 모니터 (교인 시야 / FullHD TV) ────────────────────
#   /output — 최종 송출 자막
#   울주교회 ATEM Linear Key 현장 기준: 오른쪽 확장 화면
export MONITOR_OUTPUT_X=1920
export MONITOR_OUTPUT_Y=0
export MONITOR_OUTPUT_W=1920
export MONITOR_OUTPUT_H=1080

# ── ATEM Linear Key 입력 소스용 확장 화면 ─────────────────────
#   M4 Mac mini 실험 구조:
#     - /atem-fill → USB-C to HDMI → HDMI to SDI → ATEM Input 4
#     - /atem-key  → USB-C to HDMI → HDMI to SDI → ATEM Input 5
#   현장 배선:
#     - 오른쪽 확장 화면 → ATEM Input 4 = Fill Source
#     - 왼쪽 확장 화면   → ATEM Input 5 = Key Source
#   일반 MAIN/SUB 출력 좌표와 Fill/Key 입력 좌표를 분리해서 관리한다.
export MONITOR_ATEM_FILL_X="${MONITOR_ATEM_FILL_X:-$MONITOR_OUTPUT_X}"
export MONITOR_ATEM_FILL_Y="${MONITOR_ATEM_FILL_Y:-$MONITOR_OUTPUT_Y}"
export MONITOR_ATEM_FILL_W="${MONITOR_ATEM_FILL_W:-$MONITOR_OUTPUT_W}"
export MONITOR_ATEM_FILL_H="${MONITOR_ATEM_FILL_H:-$MONITOR_OUTPUT_H}"

export MONITOR_ATEM_KEY_X="${MONITOR_ATEM_KEY_X:-$MONITOR_PROMPT_X}"
export MONITOR_ATEM_KEY_Y="${MONITOR_ATEM_KEY_Y:-$MONITOR_PROMPT_Y}"
export MONITOR_ATEM_KEY_W="${MONITOR_ATEM_KEY_W:-$MONITOR_PROMPT_W}"
export MONITOR_ATEM_KEY_H="${MONITOR_ATEM_KEY_H:-$MONITOR_PROMPT_H}"

# ── Chrome 프로필 경로 (현장 운영 세션) ───────────────────────
#   운영자 개인 Chrome 과 섞이지 않도록 UnoLive 전용 프로필 사용.
#   기본값은 공유 런타임 프로필:
#     - 제어/프롬프트/아웃풋/카메라 릴레이가 같은 Supabase 로그인 세션을 읽음
#     - 제어PC 아이콘 실행 후 한 번 로그인하면 로컬 운영 창들이 같은 쿠키를 공유
#   필요 시 UNOLIVE_SHARED_RUNTIME_PROFILE=0 으로 예전처럼 창별 독립 프로필 사용 가능.
#   재부팅 시 /tmp 는 비워지므로 영속 디렉토리 사용.
#   경로에 공백 없음 — Chrome 명령줄 파싱 이슈 방지.
export PROFILE_DIR="$HOME/Library/UnoLive"
export PROFILE_RUNTIME="$PROFILE_DIR/local-runtime-profile"
export UNOLIVE_SHARED_RUNTIME_PROFILE="${UNOLIVE_SHARED_RUNTIME_PROFILE:-1}"

if [ "$UNOLIVE_SHARED_RUNTIME_PROFILE" = "1" ]; then
  export PROFILE_CONTROL="$PROFILE_RUNTIME"
  export PROFILE_PROMPT="$PROFILE_RUNTIME"
  export PROFILE_OUTPUT="$PROFILE_RUNTIME"
  export PROFILE_CAMERAS="$PROFILE_RUNTIME"
  mkdir -p "$PROFILE_RUNTIME"
else
  export PROFILE_CONTROL="$PROFILE_DIR/control-profile"
  export PROFILE_PROMPT="$PROFILE_DIR/prompt-profile"
  export PROFILE_OUTPUT="$PROFILE_DIR/output-profile"
  export PROFILE_CAMERAS="$PROFILE_DIR/cameras-source-profile"
  mkdir -p "$PROFILE_CONTROL" "$PROFILE_PROMPT" "$PROFILE_OUTPUT" "$PROFILE_CAMERAS"
fi

export PROFILE_ATEM_FILL="$PROFILE_DIR/atem-fill-profile"
export PROFILE_ATEM_KEY="$PROFILE_DIR/atem-key-profile"
mkdir -p "$PROFILE_ATEM_FILL" "$PROFILE_ATEM_KEY"

# ── 서버 ─────────────────────────────────────────────────────
export SERVER_PORT=3000
export SERVER_URL="http://localhost:${SERVER_PORT}"
export PORT="${PORT:-$SERVER_PORT}"

detect_lan_ip() {
  local ip=""
  ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
  [ -n "$ip" ] || ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
  if [ -z "$ip" ]; then
    local iface
    iface="$(route get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
    [ -n "$iface" ] && ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
  fi
  echo "$ip"
}

export UNOLIVE_BIND_HOST="${UNOLIVE_BIND_HOST:-0.0.0.0}"
export UNOLIVE_STRICT_HOSTS="${UNOLIVE_STRICT_HOSTS:-1}"
export UNOLIVE_SERVER_LAN_IP="${UNOLIVE_SERVER_LAN_IP:-$(detect_lan_ip)}"

DEFAULT_ALLOWED_LAN_HOSTS="localhost,127.0.0.1"
if [ -n "$UNOLIVE_SERVER_LAN_IP" ]; then
  DEFAULT_ALLOWED_LAN_HOSTS="${DEFAULT_ALLOWED_LAN_HOSTS},${UNOLIVE_SERVER_LAN_IP}"
fi

export UNOLIVE_ALLOWED_LAN_HOSTS="${UNOLIVE_ALLOWED_LAN_HOSTS:-$DEFAULT_ALLOWED_LAN_HOSTS}"
export UNOLIVE_ALLOWED_WRITE_ORIGINS="${UNOLIVE_ALLOWED_WRITE_ORIGINS:-$UNOLIVE_ALLOWED_LAN_HOSTS}"
