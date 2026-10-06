# Prompt 08 – Nền tảng frontend, bộ UI và đăng nhập

Mở và đọc `design/Main.dc.html`, `design/HangHoa.dc.html`, `design/DangNhap.dc.html` để nắm phong cách (nhắc lại: chỉ tham khảo bố cục và style, không copy cú pháp template).

1. API client: `hc<AppType>` với `credentials: 'include'` và header `X-Requested-With: fetch`; wrapper chuyển lỗi JSON thành `ApiError` (có code, message). Thiết lập QueryClient (retry 1, không retry lỗi 4xx). Khi gặp lỗi 401 thì về trang đăng nhập.
2. Bộ UI trong `components/ui` theo design tokens ở `CLAUDE.md`:
   - Button (primary/secondary/ghost/danger, size md 44px, lg 48px, loading)
   - Input, MoneyInput (hiển thị 100.000, giá trị số nguyên), QtyInput (hỗ trợ số thập phân dấu phẩy, trả milli), Select, Textarea, Checkbox, RadioCard
   - Table (header nền #F9FAFB, số căn phải, cuộn ngang trong khung riêng)
   - Tabs gạch chân có badge đếm, SegmentedControl
   - Badge, StatusDot (ok/low/out), KpiStrip (các ô ngăn bằng vạch 1px)
   - Dialog (focus trap, Esc để đóng, aria-modal), Toast, EmptyState, Pagination, Kbd, QtyStepper
   Tất cả có label hoặc aria-label đầy đủ, focus ring rõ ràng, vùng bấm ≥ 44px.
3. Layout `AppShell` giống thiết kế: sidebar trắng 232px (ô chọn cửa hàng, nhóm "Vận hành": Bán hàng, Hàng hóa, Sổ nợ có badge số khách nợ; nhóm "Báo cáo": Tổng quan; dưới cùng: Cài đặt), header 64px (đường dẫn trang và tiêu đề, ngày, thông báo, avatar có menu đăng xuất). Staff không thấy mục Tổng quan. Dưới 768px: sidebar ẩn, thay bằng thanh tab dưới cùng (giống `design/BanHangMobile.dc.html`).
4. Router: `/login`, `/register`, và các route có bảo vệ: `/` (chuyển về `/ban-hang`), `/ban-hang`, `/hang-hoa`, `/hang-hoa/moi`, `/hang-hoa/:id`, `/hang-hoa/:id/sua`, `/nhap-hang/moi`, `/nhap-hang/:id`, `/kiem-kho/:id`, `/so-no`, `/so-no/:contactId`, `/tong-quan`, `/cai-dat`, `/in/hoa-don/:id`. Trước mắt các trang chưa làm hiển thị placeholder.
5. Trang Đăng nhập theo `design/DangNhap.dc.html` (đã hoạt động thật) và trang Đăng ký cửa hàng (tên cửa hàng, tên chủ, SĐT, mật khẩu, nhập lại mật khẩu). Form dùng react-hook-form + Zod schema từ `src/shared`. Lỗi từ server hiển thị dưới form.
6. Helper format: tiền, số lượng, ngày giờ `dd/MM/yyyy HH:mm` theo giờ VN.

Hoàn thành khi: đăng ký → đăng nhập → thấy AppShell → đăng xuất chạy thật với API; test component cho MoneyInput, QtyInput, Dialog.
