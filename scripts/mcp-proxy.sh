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
  if [ ! -f "$PID_FILE" ]; then
    echo "MCP Proxy not running (no pid file)"
    return 0
  fi
  local pid
  pid=$(cat "$PID_FILE")
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null
    sleep 1
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
    echo "MCP Proxy stopped (pid: $pid)"
  else
    echo "MCP Proxy was not running"
  fi
  rm -f "$PID_FILE"
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

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  log)     cmd_log ;;
  *)
    echo "Usage: $(basename "$0") {start|stop|restart|status|log}"
    exit 1
    ;;
esac
