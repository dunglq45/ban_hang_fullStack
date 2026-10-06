# Tiến độ dự án

Cập nhật sau mỗi giai đoạn bằng lệnh /phase. Phiên mới đọc file này để biết trạng thái.

| Giai đoạn | Trạng thái | Ghi chú |
|---|---|---|
| 00 Cài đặt môi trường | Xong | Cần chuyển Node 22 (`nvm use 22.15.1`), bật pnpm, cài jq |
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

- Hook gọi qua `bash "${CLAUDE_PROJECT_DIR}/..."` (có ngoặc kép) để chạy đúng trên Windows/Git Bash với đường dẫn chứa `\`.
- `.gitattributes` ép `*.sh` dùng LF vì máy dev bật `core.autocrlf=true`.

## Việc còn nợ

- Cài `jq` (`winget install jqlang.jq`). Khi thiếu jq, hook `guard.sh` KHÔNG chặn được gì; chạy lại các kiểm tra 2–6 ở Bước 9 của prompt 00 sau khi cài.
