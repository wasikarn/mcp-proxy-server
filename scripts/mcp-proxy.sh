#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="/tmp/mcp-proxy.pid"
LOG_FILE="/tmp/mcp-proxy.log"

# Read PORT from .env if exists
if [ -f "$PROJECT_DIR/.env" ]; then
  PORT=$(grep -E '^PORT=' "$PROJECT_DIR/.env" | cut -d= -f2)
fi
PORT="${PORT:-9802}"

cmd_start() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "MCP Proxy already running (pid: $(cat "$PID_FILE"))"
    return 0
  fi
  (cd "$PROJECT_DIR" && nohup bun run src/index.ts > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE")
  sleep 2
  if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "MCP Proxy started (pid: $(cat "$PID_FILE"))"
    echo "Log: $LOG_FILE"
  else
    echo "MCP Proxy failed to start. Check $LOG_FILE"
    rm -f "$PID_FILE"
    return 1
  fi
}

cmd_stop() {
  local stopped=false
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      sleep 1
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
      echo "MCP Proxy stopped (pid: $pid)"
      stopped=true
    fi
    rm -f "$PID_FILE"
  fi
  # Fallback: kill any process still holding the port
  local port_pid
  port_pid=$(lsof -ti:"$PORT" 2>/dev/null || true)
  if [ -n "$port_pid" ]; then
    kill "$port_pid" 2>/dev/null
    sleep 1
    kill -0 "$port_pid" 2>/dev/null && kill -9 "$port_pid" 2>/dev/null
    echo "MCP Proxy stopped (port $PORT, pid: $port_pid)"
    stopped=true
  fi
  if [ "$stopped" = false ]; then
    echo "MCP Proxy not running"
  fi
}

cmd_restart() {
  cmd_stop
  sleep 1
  cmd_start
}

cmd_status() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    local pid
    pid=$(cat "$PID_FILE")
    echo "MCP Proxy: running (pid: $pid)"
    curl -s "http://localhost:${PORT}/health" 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  (health check failed)"
  else
    echo "MCP Proxy: stopped"
    rm -f "$PID_FILE" 2>/dev/null
  fi
}

cmd_log() {
  tail -f "$LOG_FILE"
}

cmd_cleanup() {
  local count
  count=$(pgrep -cf '\.local/bin/claude' 2>/dev/null || echo 0)
  if [ "$count" -eq 0 ]; then
    echo "No orphaned Claude Code processes found"
    return 0
  fi
  echo "Found $count Claude Code processes"
  pkill -f '\.local/bin/claude' 2>/dev/null || true
  pkill -f 'claude-code.*native-binary/claude' 2>/dev/null || true
  sleep 2
  local remaining
  remaining=$(pgrep -cf '\.local/bin/claude' 2>/dev/null || echo 0)
  echo "Killed $((count - remaining)) processes ($remaining still running)"
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  log)     cmd_log ;;
  cleanup) cmd_cleanup ;;
  *)
    echo "Usage: $(basename "$0") {start|stop|restart|status|log|cleanup}"
    exit 1
    ;;
esac
