# API (Web App URL)
GET công khai: `?action=list`. POST: body JSON gửi `Content-Type: text/plain`, dạng `{action, token, ...}`.
Thành công: `{ok:true, ...}`. Lỗi: `{ok:false, code, message}` (message tiếng Việt).

## GET list
→ `{cases[], khoMeta{lastUpdate,by,count}, config{kho_list[], nhom_list[], statuses[{ten,dong,thieu}], gians[{san,ten,nhom,owner,owner_name,alias[],active}]}, weekly[{tuan,tuan_key,gian,total,found,complained,lost,hong}]}`
owner_name = tên hiển thị (cột name tab Users) của owner. Cache ~60s, xóa sau mỗi lần ghi. Case có đủ cột tab Cases (xem SETUP/Code.gs). Số ngày tồn: client tự tính từ created_at → closed_at/now.

## POST
| action | tham số | kết quả |
|---|---|---|
| login | username, pin | token, expires_in (giây), user{username,name,role,gians} |
| me | token | user |
| change_pin | token, old_pin, new_pin (≥6) | {} |
| ingest_kho | token, codes[] (≤20.000) | read, dupInFile, existed, added, autoClosed |
| ingest_san | token, tuan ("DD/MM - DD/MM"), gian (tên đầy đủ), rows[{ma, loai_tep, ten_sp, phan_loai, ma_don_hang, dvvc, ly_do_tra?, thoi_gian_tra?}], dry_run | read, dupInFile, existedCase, existedClosed, matchedKho, created, khoLastUpdate |
| update_cases | token, items[{ma, fields{kho, trang_thai, ghi_chu, thoi_gian_tra, tuan, ly_do_tra}}] | updated, errors[{ma,code,message}] |
| admin_upsert_user | token (admin), username, name?, role?, gians?, pin?, active? | user |
| admin_upsert_gian | token (admin), ten, san (Shopee/TikTok/Khác), nhom, owner, alias[], active | gian, created (không xóa được gian, chỉ tắt) |
| admin_list_users | token (admin) | users[{username,name,role,gians,active}] (không có PIN/salt/hash) |

- Mọi action trừ login cần token (hết hạn sau token_hours, tối đa 6h). Sai PIN 5 lần/15 phút → LOCKED.
- Tuần: chuỗi "DD/MM - DD/MM" (vd "05/10 - 11/10"; nhận cả "5/10-11/10", dấu –, hoặc 8 chữ số), cuối cách đầu 0–13 ngày. Backend chuẩn hóa, lưu `tuan` (chuỗi hiển thị) + `tuan_key` (yyyy-MM-dd ngày đầu, năm suy theo ngày thao tác: tháng 12 khi đang tháng 1 → năm trước, tháng 1 khi đang tháng 12 → năm sau). Mỗi case có `tuan`, `tuan_key`; Weekly gom theo `tuan_key`+gian. Sai → BAD_INPUT.
- Gian: `san` = nền tảng (dò định dạng file), `nhom` = nhóm hiển thị (mặc định: owner `tam` → Newtea, còn lại = san). nhom_list: Shopee, TikTok, Newtea rồi các nhóm khác A→Z. Tên gian ≤ 60 ký tự, không trùng (bỏ qua hoa/thường, dấu); owner phải tồn tại. Gian tắt: ingest_san báo lỗi, đơn cũ vẫn hiện.
- ly_do_tra: chuỗi ≤ 300 ký tự (dài hơn bị cắt), tùy chọn; mỗi case có ly_do_tra.
- loai_tep: `Trả hàng` | `Giao không thành công`. kho: một giá trị trong kho_list hoặc rỗng.
- Trạng thái (theo thứ tự `config.statuses`): mở = Mới, Chưa về kho, Chưa tìm thấy, Chờ kiểm tra; kết thúc = Đã tìm thấy, Đã khiếu nại, Xác nhận mất, Hỏng hóc / Lỗi. Đóng→mở chỉ admin. Mã vào kho tự đóng "Đã tìm thấy" cho đơn mở, TRỪ "Chờ kiểm tra" (không tính vào số thiếu). Bộ đếm Weekly: found/complained/lost/hong.
- staff chỉ thao tác gian của mình (ingest_san, update_cases); admin mọi gian. ingest_kho: mọi user active.
- update_cases xử lý từng dòng: dòng lỗi nằm trong `errors`, dòng hợp lệ vẫn được lưu.
- dry_run=true: chỉ tính kết quả, không ghi.

## Mã lỗi
BAD_JSON, BAD_ACTION, BAD_INPUT, BAD_FIELD, TOO_MANY, AUTH_REQUIRED (đăng nhập lại), INACTIVE, BAD_LOGIN, LOCKED, PIN_SHORT, FORBIDDEN, NOT_FOUND, BAD_TRANSITION, BUSY (thử lại), SERVER.
