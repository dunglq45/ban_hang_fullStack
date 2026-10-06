---
description: Thực hiện một giai đoạn trong thư mục prompts/ (ví dụ /phase 05)
---
Làm giai đoạn $ARGUMENTS:
1. Đọc docs/PROGRESS.md để biết đã làm gì, rồi đọc prompts/$ARGUMENTS-*.md.
2. Trình bày kế hoạch ngắn. Nếu là giai đoạn 05, 06 hoặc 09 thì chờ tôi duyệt trước khi code.
3. Thực hiện, chạy `pnpm typecheck && pnpm test`, sửa đến khi qua.
4. Gọi subagent reviewer rà diff, sửa các lỗi Nghiêm trọng.
5. Cập nhật docs/PROGRESS.md (đã làm, quyết định quan trọng, việc còn nợ) rồi dừng. Không commit, để tôi xem diff trước.
