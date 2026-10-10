# Cài đặt backend (làm 1 lần)
1. Vào drive.google.com → Mới → Google Trang tính. Đặt tên, vd "Đối soát sàn".
2. Trong Sheet: menu Tiện ích mở rộng → Apps Script.
3. Ở Apps Script, file `Code.gs` có sẵn: xóa hết nội dung, dán nội dung `backend/Code.gs`.
4. Bấm dấu + cạnh "Tệp" → Tập lệnh → đặt tên `Lib` → dán nội dung `backend/Lib.gs`.
5. Bấm biểu tượng bánh răng (Cài đặt dự án) → tick "Hiển thị tệp kê khai appsscript.json". Quay lại Trình chỉnh sửa, mở `appsscript.json`, dán nội dung `backend/appsscript.json`.
6. Bấm Lưu (biểu tượng đĩa). Chọn hàm `setup` ở thanh trên → Chạy → cấp quyền (Nâng cao → Đi tới dự án → Cho phép).
7. Quay lại tab Google Sheet, tải lại trang (F5). Xuất hiện menu "Đối soát".
8. Menu Đối soát → "2. Tạo 3 nhân viên": nhập PIN tạm (≥6 ký tự) cho Tâm, Nhung, Mẫn. Tên đăng nhập: `tam`, `nhung`, `man`.
9. Menu Đối soát → "3. Cài lịch dọn hằng đêm" (chạy lúc 2h sáng mỗi ngày).
10. Ở Apps Script: Triển khai → Tùy chọn triển khai mới → loại "Ứng dụng web".
    Thực thi dưới dạng: Tôi. Người có quyền truy cập: Bất kỳ ai. Bấm Triển khai.
11. Sao chép "URL ứng dụng web" (đuôi `/exec`) – dán vào giao diện ở bước sau.
12. Kiểm tra: mở URL + `?action=list` trên trình duyệt, thấy `{"ok":true,...}` là được.

Sửa code sau này: Triển khai → Quản lý triển khai → bút chì → Phiên bản: Mới → Triển khai (URL giữ nguyên).
Đổi PIN: mỗi người tự đổi trong giao diện (đổi PIN). Quên PIN: admin đặt lại PIN mới trong mục quản lý người dùng.
Tạo thêm admin: menu Đối soát → "Tạo admin mới".
Không gõ PIN vào code hay vào Sheet. Sửa gian/kho/số ngày dọn: tab Config.
