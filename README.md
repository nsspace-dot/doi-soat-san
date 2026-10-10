# doi-soat-san

Hệ thống quản lý đơn đối soát lệch Shopee/TikTok: so file mã vận đơn kho quét với file trả hàng / giao không thành công của sàn, theo dõi đơn "lệch" tới khi đóng.

## Cấu trúc
- `backend/` – code Google Apps Script (dán vào Apps Script của Google Sheet). Xem `backend/SETUP.md`, `backend/API.md`.
- `docs/` – giao diện web (GitHub Pages), làm ở bước sau.
- `tests/` – test hàm thuần: `node tests/lib.test.js`.

## Lưu ý
- KHÔNG commit file Excel/CSV thật (đã chặn trong `.gitignore`).
- KHÔNG ghi PIN hay mật khẩu vào code; PIN chỉ nhập lúc chạy tay hoặc qua giao diện.
