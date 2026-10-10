const assert = require('assert');
const P = require('../docs/parse.js');

const tt = [
  ['Order ID', 'Return Logistics Tracking ID', 'Product Name', 'SKU Name', 'Shipping Provider'],
  ['580001', '852123456789012345', 'Lịch 2027', 'Đỏ', 'J&T'],
  ['580002', '', 'Tranh', 'Xanh', 'J&T'],
  ['580003', 'vn 123', 'Sách', '', 'GHN']
];
const r1 = P.parseSan(tt);
assert.deepStrictEqual([r1.san, r1.loai_tep, r1.total, r1.rows.length, r1.skipped.noMa, r1.skipped.badMa], ['TikTok', 'Trả hàng', 3, 1, 1, 1]);
assert.deepStrictEqual(r1.rows[0], { ma: '852123456789012345', loai_tep: 'Trả hàng', ten_sp: 'Lịch 2027', phan_loai: 'Đỏ', ma_don_hang: '580001', dvvc: 'J&T' });

const sp = [
  ['Báo cáo trả hàng'], [],
  ['Mã đơn hàng', 'Mã vận đơn giao hàng', 'Mã vận đơn trả hàng', 'Tên sản phẩm', 'Đơn vị vận chuyển trả hàng'],
  ['A1', 'SPXVN01', 'spxvn999', 'Bút', 'SPX'],
  ['A2', 'SPXVN02', 'SPXVN998', 'Vở', 'SPX'],
  ['A3', 'SPXVN03', '', 'Thước', 'SPX']
];
const r2 = P.parseSan(sp);
assert.deepStrictEqual([r2.san, r2.loai_tep, r2.rows.map(r => r.ma), r2.skipped.noMa], ['Shopee', 'Trả hàng', ['SPXVN999', 'SPXVN998'], 1]);

const kho = [['Timestamp', 'Date', 'Code'], ['1728000000000', '01/10', 'SPXVN1'], ['1728000000001', '01/10', 'SPXVN1'], ['1728000000002', '01/10', '852123456789012345']];
const k = P.parseKho(kho), d = P.dedupe(k.codes);
assert.deepStrictEqual([k.column, k.rows, d.unique, d.dup], ['Code', 3, ['SPXVN1', '852123456789012345'], 1]);

assert.strictEqual(P.cellToStr({ t: 'n', v: 852123456789012, w: '852123456789012' }), '852123456789012');
assert.strictEqual(P.cellToStr({ t: 's', v: '8.52123456789012E+14' }), '852123456789012');
assert.ok(P.parseSan([['Tên'], ['x']]).error);
assert.deepStrictEqual([P.formatWeekTyping('05101110'), P.formatWeekTyping('051'), P.formatWeekTyping('5/10-1')], ['05/10 - 11/10', '05/1', '5/10-1']);
assert.deepStrictEqual([P.normalizeWeek('5/10 – 11/10', '2026-10-10').tuan, P.normalizeWeek('31/02 - 06/03', '2026-10-10')], ['05/10 - 11/10', null]);
console.log('OK: parse test qua');
