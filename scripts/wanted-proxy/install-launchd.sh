#!/bin/bash
# 원티드 프록시와, 맥이 켜질 때 VPS를 깨우는 작업을 맥의 launchd로 등록한다. 사용자가 직접 한 번 실행한다.
# 사용: bash scripts/wanted-proxy/install-launchd.sh [Tailscale 주소]   (기본 100.66.95.61)
# 되돌리기: for n in proxy wake; do launchctl bootout gui/$(id -u)/com.kkh.wanted-$n; rm ~/Library/LaunchAgents/com.kkh.wanted-$n.plist; done
set -euo pipefail

TS_IP="${1:-100.66.95.61}"
SCRIPT="$(cd "$(dirname "$0")" && pwd)/connect-proxy.py"
PLIST="$HOME/Library/LaunchAgents/com.kkh.wanted-proxy.plist"
WAKE_PLIST="$HOME/Library/LaunchAgents/com.kkh.wanted-wake.plist"
LOG="$HOME/Library/Logs/wanted-proxy.log"
PY="$(command -v python3)"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.kkh.wanted-proxy</string>
  <key>ProgramArguments</key><array><string>$PY</string><string>$SCRIPT</string><string>$TS_IP</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF

# 깨우기: 원티드 Feed의 next_run_at을 지금으로 바꿔 collector가 곧바로 수집하게 한다.
# 스크립트 파일 없이 ssh를 직접 실행한다. ~/Desktop 안의 파일은 launchd가 열 수 없다(macOS 폴더 보호).
cat > "$WAKE_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.kkh.wanted-wake</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/ssh</string><string>-o</string><string>BatchMode=yes</string><string>-o</string><string>ConnectTimeout=15</string><string>vps</string>
    <string>docker exec vps-postgres psql -U postgres -d vps_info -qc "update feed set next_run_at = now() where id like 'wanted-%' and next_run_at > now()"</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>10800</integer>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/wanted-wake.log</string>
</dict></plist>
EOF

plutil -lint "$PLIST" "$WAKE_PLIST"
launchctl bootout "gui/$(id -u)/com.kkh.wanted-proxy" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl bootout "gui/$(id -u)/com.kkh.wanted-wake" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$WAKE_PLIST"
sleep 4

echo "--- 리스닝 확인"
lsof -nP -iTCP:18888 -sTCP:LISTEN || echo "아직 안 떠 있음: $LOG 확인"
echo "--- 맥에서 프록시 경유 테스트"
curl -s -m 10 -x "http://$TS_IP:18888" -o /dev/null -w 'via proxy: %{http_code}\n' \
  'https://www.wanted.co.kr/api/chaos/navigation/v1/results?job_group_id=518&country=kr&job_ids=873&limit=1'
