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
assert.deepStrictEqual(r1.rows[0], { ma: '852123456789012345', loai_tep: 'Trả hàng', ten_sp: 'Lịch 2027', phan_loai: 'Đỏ', ma_don_hang: '580001', dvvc: 'J&T', ly_do_tra: '' });

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

// Nhập từ Sheet cũ
const GI = [['Shopee', 'Shopee Newshop CN1', 'Shopee'], ['Shopee', 'Shopee Newshop', 'Shopee'], ['TikTok', 'TikTok NewteaVN', 'Newtea'], ['Shopee', 'Shopee NewteaHCM', 'Newtea']]
  .map(([san, ten, nhom]) => ({ san, ten, nhom, alias: [] }));
assert.strictEqual(P.normalizeOldWeek('Ngày 31.8 - 6.9', '2026-10-10').tuan, '31/08 - 06/09');
const tsv = 'Tuần/Ngày đối soát\tMã vận đơn\tGian hàng\tLý do trả\tPhân loại\tKHO\tTrạng thái\n' +
  'Ngày 31.8 - 6.9\tVN111\tTIKTOK NewteaVN\tKhách hàng đã từ chối nhận kiện hàng.\t"Đỏ\n"\t53/8\tĐã nhận kho\n' +
  '\tVN222\tNS CN1\t"Hỏng\tvỡ"\tXanh\t\t\nTỔNG ĐƠN TRẢ\t\t\t\t\t\t\n';
const o = P.parseOldSheet(P.parseTsv(tsv), { defaultSan: 'Shopee', gians: GI, kho_list: ['NVS', 'TSN', 'VL'], today: '2026-10-10' });
const [a, b] = o.rows;
assert.deepStrictEqual([a.gian, a.loai_tep, a.trang_thai, a.phan_loai, a.kho, a.tuan], ['TikTok NewteaVN', 'Giao không thành công', 'Đã tìm thấy', 'Đỏ', 'VL', '31/08 - 06/09']);
assert.deepStrictEqual([b.gian, b.ly_do_tra, b.tuan, b.loai_tep, o.noMa, o.inferred], ['Shopee Newshop CN1', 'Hỏng\tvỡ', '31/08 - 06/09', 'Trả hàng', 1, 2]);
assert.strictEqual(P.resolveGian('TIKTOK NewteaVN', 'Shopee', GI).san, 'TikTok');

// Sheet cũ có khối tổng kết, ô ngắt dòng mất ngoặc kép
const tsv2 = 'BẢNG ĐỐI SOÁT HÀNG TRẢ\t\t\t\t\t\t\t\nTỔNG ĐƠN TRẢ\t3\t\t\t\t\t\t\nĐÃ NHẬN KHO\t1\t\t\t\t\t\t\nCHỜ KIỂM TRA\t2\t\t\t\t\t\t\n\n' +
  'Ngày đối soát\tMã vận đơn\tGian hàng\tLý do trả\tTên sản phẩm\tPhân loại\tThời gian trả trên hệ thống\tTrạng thái\n' +
  'Ngày 7.9 - 13.9\tGIA0001\tTIKTOK NewteaVN\tHàng lỗi\tTrà A\t"Size M\nvị đào"\t08/09\tĐã nhận kho\n' +
  '\tGIA0002\tNS CN1\tSai mẫu,\ngiao nhầm màu\tLịch B\tXanh\t09/09\tChờ kiểm tra\n' +
  '\tGIA0003\tNewshop\tKhông liên hệ được người nhận\tSách C\tĐỏ\t10/09\t\n';
const o2 = P.parseOldSheet(P.parseTsv(tsv2), { defaultSan: 'Shopee', gians: GI, kho_list: ['NVS', 'TSN', 'VL'], today: '2026-10-10' });
assert.deepStrictEqual([o2.errors, o2.rows.length, o2.rows.map(x => x.ma).join(), o2.joined.length], [0, 3, 'GIA0001,GIA0002,GIA0003', 1]);
assert.deepStrictEqual([o2.rows[0].phan_loai, o2.rows[1].ly_do_tra, o2.rows[1].ten_sp, o2.rows[1].gian], ['Size M\nvị đào', 'Sai mẫu, giao nhầm màu', 'Lịch B', 'Shopee Newshop CN1']);
assert.deepStrictEqual(o2.rows.map(x => x.loai_tep), ['Trả hàng', 'Trả hàng', 'Giao không thành công']);
console.log('OK: parse test qua');
