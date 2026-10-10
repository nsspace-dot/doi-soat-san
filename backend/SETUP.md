# Cài đặt backend (làm 1 lần)
1. Vào drive.google.com → Mới → Google Trang tính. Đặt tên, vd "Đối soát sàn".
2. Trong Sheet: menu Tiện ích mở rộng → Apps Script.
3. Bấm bánh răng (Cài đặt dự án) → Múi giờ: chọn "(GMT+07:00) Ho Chi Minh" (Asia/Ho_Chi_Minh).
4. Quay lại Trình chỉnh sửa, mở file `Code.gs`: xóa hết, dán TOÀN BỘ nội dung `backend/AppsScript.gs`, bấm Lưu.
5. Chọn hàm `setup` ở thanh trên → Chạy → cấp quyền (Nâng cao → Đi tới dự án → Cho phép).
6. Quay lại tab Sheet, tải lại trang (F5) → có menu "Đối soát".
7. Menu Đối soát → "2. Tạo 3 nhân viên": nhập PIN tạm (≥6 ký tự) cho Tâm, Nhung, Mẫn (đăng nhập: `tam`, `nhung`, `man`).
8. Menu Đối soát → "3. Cài lịch dọn hằng đêm".
9. Apps Script: Triển khai → Tùy chọn triển khai mới → bánh răng → "Ứng dụng web".
   Thực thi dưới dạng: Tôi. Người có quyền truy cập: Bất kỳ ai (Anyone). Bấm Triển khai.
10. Sao chép "URL ứng dụng web" (đuôi `/exec`) cho giao diện. Thử: mở URL + `?action=list` thấy `{"ok":true,...}`.

Cập nhật code: dán lại `AppsScript.gs` → Triển khai → Quản lý triển khai → bút chì → Phiên bản: Mới → Triển khai (URL giữ nguyên).
Đổi PIN: mỗi người tự đổi trong giao diện; quên PIN thì admin đặt lại. Thêm admin: menu Đối soát → "Tạo admin mới".
Không gõ PIN vào code hay vào Sheet. Sửa gian/kho/số ngày dọn: tab Config.
Lập trình viên: sửa `Lib.gs`/`Code.gs` rồi chạy `node tools/build.js` để sinh lại `AppsScript.gs`.
