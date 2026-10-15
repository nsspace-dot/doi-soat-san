const assert = require('assert');
const X = require('../docs/vendor/xlsx.full.min.js'), E = require('../docs/export.js');

assert.deepStrictEqual([E.fmtDateTime('2026-10-01 14:05:09'), E.fmtDateTime('1/10 14:00', '2026'), E.fmtDateTime('01/10/2026'), E.fmtDateTime('chưa rõ')],
  ['01/10/2026 14:05:09', '01/10/2026 14:00:00', '01/10/2026 00:00:00', 'chưa rõ']);
const cases = [{ tuan: '05/10 - 11/10', tuan_key: '2026-10-05', gian: 'G1', san: 'Shopee', ma: '852123456789012345', ma_don_hang: '0012', loai_tep: 'Trả hàng',
  ly_do_tra: 'x', ten_sp: 'Sản phẩm', phan_loai: 'Đỏ', kho: 'TSN', thoi_gian_tra: '06/10 09:30', trang_thai: 'Mới', ghi_chu: '' }];
const rows = E.caseRows(cases.concat([{ tuan: '28/09 - 05/10', tuan_key: '2026-09-28', kho: 'VL', ma: '0001234567890', gian: 'TikTok Nhà Sách', loai_tep: 'Giao không thành công',
  ten_sp: 'Lịch', phan_loai: 'LẺ', thoi_gian_tra: '2026-09-30 17:45:00' }]));
const wb = X.read(E.workbook(rows, [['Gian', 'G1'], ['Tổng số dòng', 2]], X.CFB), { type: 'array' });
const a = X.utils.sheet_to_json(wb.Sheets['Đối soát'], { header: 1 });
assert.deepStrictEqual(a[0], ['Tuần đối soát', 'KHO', 'Mã vận đơn', 'Gian hàng TikTok', 'Loại tệp tin', 'Tên sản phẩm', 'Phân loại', 'Thời gian trả trên hệ thống']);
assert.deepStrictEqual(a.slice(1), [['05/10 - 11/10', 'TSN', '852123456789012345', 'G1', 'Trả hàng', 'Sản phẩm', 'Đỏ', '06/10/2026 09:30:00'],
  ['28/09 - 05/10', 'VL', '0001234567890', 'TikTok Nhà Sách', 'Giao không thành công', 'Lịch', 'LẺ', '30/09/2026 17:45:00']]);
const s1 = wb.Sheets['Đối soát'];
assert.deepStrictEqual([s1.C2.t, s1.C3.v, s1['!autofilter'].ref], ['s', '0001234567890', 'A1:H3']);
assert.strictEqual(E.fileName(['Shopee Tường Vip', '05/10 - 11/10'], new Date(2026, 9, 15, 9, 5)), 'Doi-soat_Shopee-Tuong-Vip_05-10-11-10_15-10-2026_0905.xlsx');
console.log('OK: export test qua');
