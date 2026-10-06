#!/bin/bash
cmd=$(jq -r '.tool_input.command')
if echo "$cmd" | grep -Eq 'rm -rf|--remote|db:migrate:remote|pnpm deploy|wrangler (deploy|delete)|push (-f|--force)'; then
  echo "Chặn: lệnh này ảnh hưởng production hoặc xóa dữ liệu. Hãy để người dùng tự chạy." >&2
  exit 2
fi
exit 0
