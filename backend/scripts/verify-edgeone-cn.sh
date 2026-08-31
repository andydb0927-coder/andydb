#!/usr/bin/env bash

set -uo pipefail

base_url="${EDGEONE_BASE_URL:-${1:-}}"
expected_origin="${EDGEONE_EXPECTED_ORIGIN:-}"
device_token="${EDGEONE_DEVICE_TOKEN:-}"
verify_level="${EDGEONE_VERIFY_LEVEL:-basic}"
connect_timeout="${EDGEONE_CONNECT_TIMEOUT_SECONDS:-10}"
request_timeout="${EDGEONE_REQUEST_TIMEOUT_SECONDS:-30}"

pass_count=0
fail_count=0
skip_count=0

pass() {
  pass_count=$((pass_count + 1))
  echo "PASS：$1"
}

fail() {
  fail_count=$((fail_count + 1))
  echo "FAIL：$1" >&2
}

skip() {
  skip_count=$((skip_count + 1))
  echo "跳过：$1"
}

if [[ -z "$base_url" ]]; then
  echo "FAIL：请通过 EDGEONE_BASE_URL 或第一个参数提供灰度 API 地址。" >&2
  exit 2
fi

if [[ "$base_url" != https://* && "${EDGEONE_ALLOW_HTTP:-0}" != "1" ]]; then
  echo "FAIL：灰度地址必须使用 HTTPS；仅本地测试可显式设置 EDGEONE_ALLOW_HTTP=1。" >&2
  exit 2
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "FAIL：未找到 curl，无法执行灰度验收。" >&2
  exit 2
fi

base_url="${base_url%/}"
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/wireless-canvas-edgeone.XXXXXX")"
trap 'rm -rf "$temp_dir"' EXIT

response_status=""
response_body="$temp_dir/body"
response_headers="$temp_dir/headers"

request() {
  local method="$1"
  local path="$2"
  local auth_header="${3:-}"
  local origin_header="${4:-}"
  local -a args

  args=(
    --silent
    --show-error
    --connect-timeout "$connect_timeout"
    --max-time "$request_timeout"
    --request "$method"
    --dump-header "$response_headers"
    --output "$response_body"
    --write-out '%{http_code}'
  )
  if [[ -n "$auth_header" ]]; then
    args+=(--header "Authorization: Bearer $auth_header")
  fi
  if [[ -n "$origin_header" ]]; then
    args+=(--header "Origin: $origin_header")
    args+=(--header 'Access-Control-Request-Method: GET')
    args+=(--header 'Access-Control-Request-Headers: Authorization, Content-Type')
  fi

  : >"$response_body"
  : >"$response_headers"
  if ! response_status="$(curl "${args[@]}" "$base_url$path")"; then
    response_status="000"
    return 1
  fi
}

if request GET '/api/health' && [[ "$response_status" == "200" ]] && grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$response_body"; then
  pass '健康检查返回 200 与 status=ok。'
else
  fail "健康检查异常，HTTP ${response_status}。"
fi

if request GET '/api/data/projects' && [[ "$response_status" == "401" ]]; then
  pass '未携带设备 token 的数据请求被 401 拒绝。'
else
  fail "鉴权门禁异常，未授权数据请求返回 HTTP ${response_status}。"
fi

if [[ -n "$expected_origin" ]]; then
  if request OPTIONS '/api/health' '' "$expected_origin" && \
    [[ "$response_status" == "204" || "$response_status" == "200" ]] && \
    grep -Fqi "access-control-allow-origin: $expected_origin" "$response_headers"; then
    pass 'CORS 预检精确放行预期前端 origin。'
  else
    fail "CORS 预检未精确放行 ${expected_origin}，HTTP ${response_status}。"
  fi
else
  skip '未提供 EDGEONE_EXPECTED_ORIGIN，未检查跨域白名单。'
fi

if [[ -n "$device_token" ]]; then
  if request GET '/api/data/projects' "$device_token" && [[ "$response_status" == "200" ]]; then
    pass '灰度设备 token 可读取项目列表，数据路由已接通。'
  else
    fail "灰度设备 token 无法读取项目列表，HTTP ${response_status}。"
  fi
elif [[ "$verify_level" == "full" ]]; then
  fail '完整验收要求提供 EDGEONE_DEVICE_TOKEN。'
else
  skip '基础验收未提供 EDGEONE_DEVICE_TOKEN，未检查 EdgeKV 数据读取。'
fi

echo "验收汇总：PASS ${pass_count}，FAIL ${fail_count}，跳过 ${skip_count}。"

if [[ "$fail_count" -gt 0 ]]; then
  exit 1
fi
