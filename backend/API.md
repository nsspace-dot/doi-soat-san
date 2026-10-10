# API (Web App URL)
GET công khai: `?action=list`. POST: body JSON gửi `Content-Type: text/plain`, dạng `{action, token, ...}`.
Thành công: `{ok:true, ...}`. Lỗi: `{ok:false, code, message}` (message tiếng Việt).

## GET list
→ `{cases[], khoMeta{lastUpdate,by,count}, config{kho_list[], gians[{san,ten,owner,alias[]}]}, weekly[{tuan,gian,total,found,complained,lost}]}`
Cache ~60s, xóa sau mỗi lần ghi. Case có đủ cột tab Cases (xem SETUP/Code.gs). Số ngày tồn: client tự tính từ created_at → closed_at/now.

## POST
| action | tham số | kết quả |
|---|---|---|
| login | username, pin | token, expires_in (giây), user{username,name,role,gians} |
| me | token | user |
| change_pin | token, old_pin, new_pin (≥6) | {} |
| ingest_kho | token, codes[] (≤20.000) | read, dupInFile, existed, added, autoClosed |
| ingest_san | token, tuan (Thứ 2 yyyy-MM-dd), gian (tên đầy đủ), rows[{ma, loai_tep, ten_sp, phan_loai, ma_don_hang, dvvc}], dry_run | read, dupInFile, existedCase, existedClosed, matchedKho, created, khoLastUpdate |
| update_cases | token, items[{ma, fields{kho, trang_thai, ghi_chu, thoi_gian_tra, tuan}}] | updated, errors[{ma,code,message}] |
| admin_upsert_user | token (admin), username, name?, role?, gians?, pin?, active? | user |

- Mọi action trừ login cần token (hết hạn sau token_hours, tối đa 6h). Sai PIN 5 lần/15 phút → LOCKED.
- loai_tep: `Trả hàng` | `Giao không thành công`. kho: một giá trị trong kho_list hoặc rỗng.
- Trạng thái mở: Mới, Chưa về kho, Chưa tìm thấy. Đóng: Đã tìm thấy, Đã khiếu nại, Xác nhận mất. Đóng→mở chỉ admin.
- staff chỉ thao tác gian của mình (ingest_san, update_cases); admin mọi gian. ingest_kho: mọi user active.
- update_cases xử lý từng dòng: dòng lỗi nằm trong `errors`, dòng hợp lệ vẫn được lưu.
- dry_run=true: chỉ tính kết quả, không ghi.

## Mã lỗi
BAD_JSON, BAD_ACTION, BAD_INPUT, BAD_FIELD, TOO_MANY, AUTH_REQUIRED (đăng nhập lại), INACTIVE, BAD_LOGIN, LOCKED, PIN_SHORT, FORBIDDEN, NOT_FOUND, BAD_TRANSITION, BUSY (thử lại), SERVER.
