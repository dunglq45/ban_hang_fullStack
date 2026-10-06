# Bộ khởi động cho Claude Code – App quản lý cửa hàng

## Có gì trong bộ này
```
CLAUDE.md          Bối cảnh và quy tắc dự án. Claude Code tự đọc file này mỗi phiên.
docs/
  ARCHITECTURE.md  Kiến trúc, cấu trúc thư mục, quyết định kỹ thuật
  DATABASE.md      Schema D1 và quy tắc nghiệp vụ (tồn kho, giá vốn, công nợ)
  API.md           Danh sách endpoint
design/            13 màn hình thiết kế (file .dc.html) để Claude Code tham chiếu giao diện
prompts/           15 prompt chạy lần lượt
```

## Cách dùng
1. Tạo thư mục dự án rỗng, chép toàn bộ nội dung bộ này vào, chạy `git init` và commit lần đầu.
2. Mở Claude Code trong thư mục đó.
3. Chạy lần lượt từng prompt: mở file `prompts/01-...md`, copy toàn bộ nội dung và dán vào Claude Code. Với các prompt lớn (05, 06, 09), nên dùng chế độ lập kế hoạch (plan mode) để Claude Code trình bày kế hoạch trước; bạn duyệt rồi mới cho làm.
4. Sau mỗi prompt:
   - Đọc báo cáo của Claude Code, tự chạy `pnpm test` và thử trên trình duyệt.
   - Commit (hoặc yêu cầu Claude Code commit).
   - Bắt đầu phiên mới, hoặc dùng `/clear` trước khi chạy prompt tiếp theo để ngữ cảnh gọn. `CLAUDE.md` và `docs/` sẽ giữ kiến thức dự án giữa các phiên.
5. Nếu kết quả sai, đừng chạy tiếp. Mô tả cụ thể lỗi cho Claude Code sửa ngay trong phiên đó.

## Thứ tự và mục tiêu
| # | Giai đoạn | Kết quả |
|---|---|---|
| 01 | Khởi tạo | Dự án chạy được, Worker + React + D1 local |
| 02 | Database | Schema, migration, helper, seed |
| 03 | Nền tảng API | Lỗi, session, đăng ký/đăng nhập, phân quyền |
| 04 | API hàng hóa, danh bạ | Hàng hóa, đơn vị, nhóm, khách, NCC, import, ảnh |
| 05 | API bán hàng | Hóa đơn, trừ kho, ghi nợ, hủy (phần lõi nhất) |
| 06 | API nhập hàng, kiểm kho | Giá vốn bình quân, nợ NCC, cân bằng kho |
| 07 | API công nợ, báo cáo | Thu chi, sổ công nợ, báo cáo. Backend MVP xong |
| 08 | Frontend nền tảng | Bộ UI, layout, router, đăng nhập |
| 09 | Bán hàng | POS desktop và điện thoại, mã vạch, phím tắt |
| 10 | Hàng hóa | Danh sách, thêm/sửa, chi tiết, import Excel |
| 11 | Nhập hàng, kiểm kho | Phiếu nhập, phiếu kiểm |
| 12 | Sổ nợ | Danh sách nợ, sổ chi tiết, thu nợ |
| 13 | Tổng quan, cài đặt | Báo cáo, nhân viên, danh sách hóa đơn |
| 14 | In và responsive | Hóa đơn 80mm/58mm, hoàn thiện điện thoại |
| 15 | Kiểm thử, deploy | E2E, rà soát bảo mật, CI/CD, vận hành |

Sau prompt 07 bạn nên tự review kỹ phần service bán hàng, nhập hàng và công nợ. Đây là chỗ sai sẽ làm lệch số liệu của khách hàng.

## Những điều bạn tự làm (Claude Code không có quyền)
- Đăng nhập Cloudflare (`wrangler login`), tạo D1/R2 và điền `database_id`.
- Tạo API token Cloudflare cho GitHub Actions.
- Mua domain và gắn domain.
