#!/bin/bash
# =============================================================
# scripts/detect-monitors.sh
# 실제 연결된 모니터의 X/Y 좌표를 NSScreen API 로 조회
#
# 출력 형식 (stdout):
#   MONITOR_CONTROL_X=0
#   MONITOR_CONTROL_Y=0
#   MONITOR_CONTROL_W=1920
#   MONITOR_CONTROL_H=1080
#   MONITOR_PROMPT_X=1920
#   ...
#
# 사용법:
#   ./scripts/detect-monitors.sh                # 출력만
#   ./scripts/detect-monitors.sh > monitor-config.auto.sh   # 파일로 저장
#   ./scripts/detect-monitors.sh --apply        # monitor-config.sh 에 Y 좌표 반영
#
# 매핑 규칙:
#   - Main Display (메뉴바 있는 것) → 제어 (CONTROL)
#   - 나머지 중 X 가 작은 것 → 중층 (PROMPT)
#   - 나머지 중 X 가 큰 것 → 강대상 (OUTPUT)
# =============================================================

OUTPUT=$(/usr/bin/swift - <<'SWIFT' 2>/dev/null
import AppKit

struct ScreenInfo { let x: Int; let y: Int; let w: Int; let h: Int; let isMain: Bool }

let all = NSScreen.screens.map { s -> ScreenInfo in
  let f = s.frame
  return ScreenInfo(
    x: Int(f.origin.x), y: Int(f.origin.y),
    w: Int(f.size.width), h: Int(f.size.height),
    isMain: (s == NSScreen.main)
  )
}

if let main = all.first(where: { $0.isMain }) {
  print("MONITOR_CONTROL_X=\(main.x)")
  print("MONITOR_CONTROL_Y=\(main.y)")
  print("MONITOR_CONTROL_W=\(main.w)")
  print("MONITOR_CONTROL_H=\(main.h)")
}

let extras = all.filter { !$0.isMain }.sorted { $0.x < $1.x }

if extras.count >= 1 {
  let p = extras[0]
  print("MONITOR_PROMPT_X=\(p.x)")
  print("MONITOR_PROMPT_Y=\(p.y)")
  print("MONITOR_PROMPT_W=\(p.w)")
  print("MONITOR_PROMPT_H=\(p.h)")
}

if extras.count >= 2 {
  let o = extras[1]
  print("MONITOR_OUTPUT_X=\(o.x)")
  print("MONITOR_OUTPUT_Y=\(o.y)")
  print("MONITOR_OUTPUT_W=\(o.w)")
  print("MONITOR_OUTPUT_H=\(o.h)")
}
SWIFT
)

if [ -z "$OUTPUT" ]; then
  echo "❌ 디스플레이 정보 조회 실패 (AppKit/PyObjC 문제)" >&2
  exit 1
fi

# --apply: monitor-config.sh 의 값들을 실제값으로 교체
if [ "$1" = "--apply" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  CONFIG="$SCRIPT_DIR/monitor-config.sh"

  while IFS='=' read -r KEY VAL; do
    [ -z "$KEY" ] && continue
    # 기존 export KEY=... 라인을 새 값으로 교체
    sed -i.bak "s/^export ${KEY}=.*/export ${KEY}=${VAL}/" "$CONFIG"
  done <<< "$OUTPUT"

  rm -f "${CONFIG}.bak"
  echo "✅ $CONFIG 에 실제 모니터 좌표 반영 완료:"
  echo ""
  grep -E "MONITOR_(CONTROL|PROMPT|OUTPUT)_[XY]" "$CONFIG" | sed 's/^/  /'
else
  # 평문 출력
  echo "$OUTPUT"
fi
