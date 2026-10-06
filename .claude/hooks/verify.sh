#!/bin/bash
input=$(cat)
# đã bị nhắc một lần rồi thì cho dừng, tránh vòng lặp vô hạn
[ "$(jq -r '.stop_hook_active // false' <<<"$input")" = "true" ] && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f package.json ] || exit 0
# không có thay đổi chưa commit thì không cần chạy lại
if git rev-parse --git-dir >/dev/null 2>&1; then
  if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    exit 0
  fi
fi
has() { jq -e --arg s "$1" '.scripts[$s]' package.json >/dev/null 2>&1; }
for c in typecheck test; do
  has "$c" || continue
  out=$(pnpm -s "$c" 2>&1) || {
    echo "Lệnh 'pnpm $c' đang lỗi, hãy sửa trước khi kết thúc:" >&2
    echo "$out" | tail -40 >&2
    exit 2
  }
done
exit 0
