const assert = require('assert');
const X = require('../docs/vendor/xlsx.full.min.js'), E = require('../docs/export.js');

assert.deepStrictEqual([E.fmtDateTime('2026-10-01 14:05:09'), E.fmtDateTime('1/10 14:00', '2026'), E.fmtDateTime('01/10/2026'), E.fmtDateTime('chưa rõ')],
  ['01/10/2026 14:05:09', '01/10/2026 14:00:00', '01/10/2026 00:00:00', 'chưa rõ']);
const cases = [{ tuan: '05/10 - 11/10', tuan_key: '2026-10-05', gian: 'G1', san: 'Shopee', ma: '852123456789012345', ma_don_hang: '0012', loai_tep: 'Trả hàng',
  ly_do_tra: 'x', ten_sp: 'Sản phẩm', phan_loai: 'Đỏ', kho: 'TSN', thoi_gian_tra: '06/10 09:30', trang_thai: 'Mới', ghi_chu: '' }];
const rows = E.caseRows(cases, { nhomOf: () => 'Shopee', ownerOf: () => 'Nhung', days: () => 3 });
const wb = X.read(E.workbook(rows, [['Gian', 'G1'], ['Tổng số dòng', 1]], X.CFB), { type: 'array' });
const s1 = wb.Sheets['Đối soát'];
assert.deepStrictEqual([wb.SheetNames, s1.D2.t, s1.D2.v, s1.E2.v, s1.K2.v, s1.O2.v, s1['!autofilter'] && s1['!autofilter'].ref],
  [['Đối soát', 'Bộ lọc'], 's', '852123456789012345', '0012', '06/10/2026 09:30:00', 3, 'A1:O2']);
assert.strictEqual(E.fileName(['Shopee Tường Vip', '05/10 - 11/10'], new Date(2026, 9, 15, 9, 5)), 'Doi-soat_Shopee-Tuong-Vip_05-10-11-10_15-10-2026_0905.xlsx');
console.log('OK: export test qua');
