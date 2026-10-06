# Prompt 00 – Cài đặt và thiết lập môi trường làm việc với Claude Code

Chạy prompt này TRƯỚC prompt 01, ngay trong thư mục dự án đã chứa `CLAUDE.md`, `docs/`, `design/`, `prompts/`.

---

Bạn đang chuẩn bị môi trường cho dự án này để các giai đoạn sau (prompt 01 đến 15) chạy an toàn và bán tự động.

**Phạm vi:** chỉ thiết lập môi trường và cấu hình `.claude/`. KHÔNG scaffold ứng dụng (đó là việc của prompt 01).

**Ràng buộc:**
- Không chạy lệnh cần đăng nhập Cloudflare (`wrangler login`, `wrangler d1 create`, deploy…).
- Không cài gói hệ thống hoặc gói toàn cục mà chưa báo tôi. Nếu thiếu công cụ, in ra đúng lệnh cài cho hệ điều hành của tôi và tiếp tục phần việc không phụ thuộc.
- Nếu một file đích đã tồn tại thì hợp nhất (merge) nội dung, không ghi đè mất cấu hình hiện có.
- Làm tuần tự từng bước, báo ngắn gọn kết quả mỗi bước.

## Bước 0 – Kiểm tra tài liệu dự án

Đọc `CLAUDE.md` và `docs/ARCHITECTURE.md`. Xác nhận các mục sau tồn tại: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`, thư mục `design/` (có các file `.dc.html`), thư mục `prompts/` (có `01-*.md` đến `15-*.md`). Thiếu mục nào thì liệt kê, rồi dừng để tôi bổ sung.

## Bước 1 – Kiểm tra môi trường

Chạy và ghi lại kết quả: hệ điều hành, `node -v`, `pnpm -v`, `git --version`, `jq --version`, `claude --version` (nếu có).

- Node: cần bản LTS hiện hành. Nếu quá cũ, báo tôi nâng cấp.
- pnpm: nếu thiếu, thử `corepack enable` rồi `corepack prepare pnpm@latest --activate`. Báo kết quả.
- jq: các hook bên dưới cần `jq`. Nếu thiếu, KHÔNG tự cài; in lệnh phù hợp (`brew install jq` trên macOS, `sudo apt install jq` trên Debian/Ubuntu, `winget install jqlang.jq` trên Windows).
- Windows: hook mặc định chạy bằng bash. Nếu máy không có Git Bash hoặc WSL, hãy hỏi tôi trước khi viết bản PowerShell thay thế.

## Bước 2 – Git và .gitignore

Nếu thư mục chưa là repo git: `git init -b main`. Tạo hoặc bổ sung `.gitignore` với các dòng sau (bỏ qua dòng đã có):

```
node_modules/
dist/
.wrangler/
.dev.vars
.env
.env.*
.claude/settings.local.json
coverage/
playwright-report/
test-results/
*.log
.DS_Store
```

## Bước 3 – `.claude/settings.json`

Tạo `.claude/settings.json` (merge nếu đã có):

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(pnpm test)",
      "Bash(pnpm test *)",
      "Bash(pnpm typecheck)",
      "Bash(pnpm lint)",
      "Bash(pnpm db:generate)",
      "Bash(pnpm db:migrate:local)",
      "Bash(git status)",
      "Bash(git diff *)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.dev.vars)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.sh", "args": [] }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/format.sh", "args": [] }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/verify.sh", "args": [], "timeout": 300 }
        ]
      }
    ]
  }
}
```

Sau khi tạo, kiểm tra JSON hợp lệ bằng `jq . .claude/settings.json`.

## Bước 4 – Ba script hook

Tạo thư mục `.claude/hooks/`, ghi đúng nội dung các file sau, rồi `chmod +x .claude/hooks/*.sh`.

**`.claude/hooks/guard.sh`**: chặn lệnh đụng production hoặc xóa dữ liệu. Exit 2 để chặn.

```bash
#!/bin/bash
cmd=$(jq -r '.tool_input.command')
if echo "$cmd" | grep -Eq 'rm -rf|--remote|db:migrate:remote|pnpm deploy|wrangler (deploy|delete)|push (-f|--force)'; then
  echo "Chặn: lệnh này ảnh hưởng production hoặc xóa dữ liệu. Hãy để người dùng tự chạy." >&2
  exit 2
fi
exit 0
```

**`.claude/hooks/format.sh`**: tự format file vừa sửa nếu dự án đã có prettier.

```bash
#!/bin/bash
f=$(jq -r '.tool_input.file_path')
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f "$f" ] || exit 0
[ -x node_modules/.bin/prettier ] || exit 0
pnpm exec prettier --write --ignore-unknown "$f" >/dev/null 2>&1
exit 0
```

**`.claude/hooks/verify.sh`**: không cho kết thúc lượt khi `typecheck` hoặc `test` đang lỗi. Tự bỏ qua khi dự án chưa có package.json hoặc script tương ứng, hoặc khi cây làm việc không có thay đổi.

```bash
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
```

## Bước 5 – Subagent `reviewer`

Tạo `.claude/agents/reviewer.md`:

```markdown
---
name: reviewer
description: Rà soát code trước khi commit. Dùng chủ động sau khi xong một tính năng.
tools: Read, Grep, Glob, Bash
---
Bạn là reviewer khó tính của dự án quản lý cửa hàng (Cloudflare Workers + D1).
Chạy `git diff`, rồi kiểm tra theo CLAUDE.md và docs/DATABASE.md, đặc biệt:
1. Mọi query lọc theo store_id lấy từ session, không nhận từ request body.
2. Ghi nhiều bảng nằm trong một db.batch(); tồn kho và công nợ dùng UPDATE x = x + ?, không đọc rồi ghi.
3. Tiền là integer, số lượng là milli, không dùng float.
4. Chứng từ có idempotencyKey; không sửa hay xóa chứng từ đã hoàn thành.
5. Response cho role staff không chứa cost_price hay lợi nhuận.
6. Có test cho nhánh lỗi (hết hàng, vượt hạn mức, trùng key).
Chỉ báo cáo, không sửa code. Xếp theo Nghiêm trọng / Nên sửa / Gợi ý, kèm file:dòng.
```

## Bước 6 – Lệnh `/phase`

Tạo `.claude/commands/phase.md`:

```markdown
---
description: Thực hiện một giai đoạn trong thư mục prompts/ (ví dụ /phase 05)
---
Làm giai đoạn $ARGUMENTS:
1. Đọc docs/PROGRESS.md để biết đã làm gì, rồi đọc prompts/$ARGUMENTS-*.md.
2. Trình bày kế hoạch ngắn. Nếu là giai đoạn 05, 06 hoặc 09 thì chờ tôi duyệt trước khi code.
3. Thực hiện, chạy `pnpm typecheck && pnpm test`, sửa đến khi qua.
4. Gọi subagent reviewer rà diff, sửa các lỗi Nghiêm trọng.
5. Cập nhật docs/PROGRESS.md (đã làm, quyết định quan trọng, việc còn nợ) rồi dừng. Không commit, để tôi xem diff trước.
```

## Bước 7 – `docs/PROGRESS.md`

Tạo file với nội dung khởi đầu:

```markdown
# Tiến độ dự án

Cập nhật sau mỗi giai đoạn bằng lệnh /phase. Phiên mới đọc file này để biết trạng thái.

| Giai đoạn | Trạng thái | Ghi chú |
|---|---|---|
| 00 Cài đặt môi trường | Xong | |
| 01 Khởi tạo dự án | Chưa làm | |
| 02 Database | Chưa làm | |
| 03 API nền tảng, auth | Chưa làm | |
| 04 API hàng hóa, danh bạ | Chưa làm | |
| 05 API bán hàng | Chưa làm | |
| 06 API nhập hàng, kiểm kho | Chưa làm | |
| 07 API công nợ, báo cáo | Chưa làm | |
| 08 Frontend nền tảng | Chưa làm | |
| 09 Bán hàng (POS) | Chưa làm | |
| 10 Hàng hóa | Chưa làm | |
| 11 Nhập hàng, kiểm kho | Chưa làm | |
| 12 Sổ nợ | Chưa làm | |
| 13 Tổng quan, cài đặt | Chưa làm | |
| 14 In hóa đơn, responsive | Chưa làm | |
| 15 Kiểm thử, deploy | Chưa làm | |

## Quyết định quan trọng

(chưa có)

## Việc còn nợ

(chưa có)
```

## Bước 8 – Cập nhật `CLAUDE.md`

Thêm vào cuối `CLAUDE.md` mục sau (không xóa nội dung cũ):

```markdown
## Tự động hóa (thư mục .claude/)
- Hook `guard.sh` chặn lệnh `--remote`, `db:migrate:remote`, `pnpm deploy`, `wrangler deploy|delete`, `rm -rf`, `push --force`. Không tìm cách né hook; hãy yêu cầu người dùng tự chạy lệnh đó.
- Hook `format.sh` tự chạy prettier cho file vừa sửa; hook `verify.sh` chạy `pnpm typecheck` và `pnpm test` khi kết thúc lượt nếu có thay đổi chưa commit.
- Script `test` trong package.json phải chạy một lần rồi thoát (ví dụ `vitest run`), không dùng chế độ watch.
- Subagent `reviewer` dùng để rà diff trước khi commit; lệnh `/phase NN` chạy một giai đoạn trong `prompts/`.
- Cập nhật `docs/PROGRESS.md` sau mỗi giai đoạn.
```

## Bước 9 – Tự kiểm tra cấu hình

Chạy các kiểm tra sau và báo kết quả dạng bảng (kiểm tra, mong đợi, thực tế, đạt hay không):

1. `jq . .claude/settings.json` chạy không lỗi.
2. `echo '{"tool_input":{"command":"pnpm deploy"}}' | .claude/hooks/guard.sh`: mong đợi exit code 2 và có thông báo chặn.
3. `echo '{"tool_input":{"command":"pnpm test"}}' | .claude/hooks/guard.sh`: mong đợi exit code 0.
4. `echo '{"tool_input":{"command":"pnpm db:migrate:remote"}}' | .claude/hooks/guard.sh`: mong đợi exit code 2.
5. `echo '{}' | .claude/hooks/verify.sh` khi chưa có package.json: mong đợi exit code 0, không chạy gì.
6. `echo '{"tool_input":{"file_path":"/khong/ton/tai.ts"}}' | .claude/hooks/format.sh`: mong đợi exit code 0.
7. Các file `.sh` đều có quyền thực thi.

Nếu `jq` chưa cài thì các mục 2 đến 6 chưa kiểm tra được; ghi rõ là "chưa kiểm tra, cần cài jq".

## Bước 10 – Commit và báo cáo

Nếu mọi thứ ổn, tạo đúng một commit: `chore: set up claude code automation` (gồm `.claude/`, `.gitignore`, `CLAUDE.md`, `docs/PROGRESS.md`, và các tài liệu, thiết kế, prompt đã có). Không push.

Báo cáo cuối cùng gồm:
- Bảng kết quả môi trường (bước 1) và bảng kiểm tra (bước 9).
- Danh sách file đã tạo hoặc sửa.
- Những việc tôi cần tự làm, nêu rõ từng việc (ví dụ: cài jq, `Developer: Reload Window` trong VS Code, mở menu `/` rồi chọn Hooks và Permissions để xác nhận cấu hình đã được nhận, gõ `/` kiểm tra lệnh `/phase` có hiện không, `wrangler login` khi tới lúc cần).
- Bước tiếp theo: chạy `/phase 01`.
