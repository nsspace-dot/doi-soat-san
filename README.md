# doi-soat-san

Hệ thống quản lý đơn đối soát lệch Shopee/TikTok: so file mã vận đơn kho quét với file trả hàng / giao không thành công của sàn, theo dõi đơn "lệch" tới khi đóng.

## Cấu trúc
- `backend/` – code Apps Script: nguồn `Lib.gs` + `Code.gs`; dán file gộp `AppsScript.gs` (sinh bằng `node tools/build.js`). Xem `backend/SETUP.md`, `backend/API.md`.
- `docs/` – giao diện web tĩnh (GitHub Pages: branch main, thư mục /docs). `legacy/` – tool cũ, chỉ để tham khảo.
- `tests/` – `node tests/lib.test.js`, `node tests/parse.test.js`, `node tests/export.test.js`.

## Lưu ý
- KHÔNG commit file Excel/CSV thật (đã chặn trong `.gitignore`).
- KHÔNG ghi PIN hay mật khẩu vào code; PIN chỉ nhập lúc chạy tay hoặc qua giao diện.
