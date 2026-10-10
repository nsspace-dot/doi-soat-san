const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const L = {};
vm.createContext(L);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../backend/Lib.gs'), 'utf8'), L);
const eq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);

const admin = { role: 'admin', gians: [] }, staff = { role: 'staff', gians: ['Shopee Tường Vip'] };

eq(L.normalizeMa('  sp 12 3a '), 'SP123A');
eq(L.normalizeMa(12345), '12345');
const d = L.dedupeBy(['A', 'B', 'A', '', 'B'], x => x);
eq([d.unique, d.dup, d.empty], [['A', 'B'], 2, 1]);

eq(L.canEditGian(staff, 'Shopee Tường Vip'), true);
eq(L.canEditGian(staff, 'TikTok Sách Hay'), false);
eq(L.checkTransition(staff, 'Mới', 'Chưa tìm thấy'), null);
eq(L.checkTransition(staff, 'Đã tìm thấy', 'Xác nhận mất'), null);
eq(L.checkTransition(staff, 'Đã khiếu nại', 'Mới').code, 'BAD_TRANSITION');
eq(L.checkTransition(admin, 'Đã khiếu nại', 'Mới'), null);
eq(L.validateFields({ ma_don_hang: 'x' }, ['NVS'], '2026-10-10').error.code, 'BAD_FIELD');
eq(L.validateFields({ tuan: '5/10-11/10' }, ['NVS'], '2026-10-10').fields, { tuan: '05/10 - 11/10', tuan_key: '2026-10-05' });

const k = (tuan, tt) => ({ tuan, tuan_key: tuan, gian: 'G', trang_thai: tt });
const w = L.weeklyApply([], L.weeklyDeltas(null, k('2026-10-05', 'Mới')));
L.weeklyApply(w, L.weeklyDeltas(k('2026-10-05', 'Mới'), k('2026-10-05', 'Đã khiếu nại')));
L.weeklyApply(w, L.weeklyDeltas(k('2026-10-05', 'Đã khiếu nại'), k('2026-10-12', 'Xác nhận mất')));
eq(w.map(x => [x.tuan, x.total, x.complained, x.lost]), [['2026-10-05', 0, 0, 0], ['2026-10-12', 1, 0, 1]]);
L.weeklyApply(w, L.weeklyDeltas(k('2026-10-12', 'Xác nhận mất'), k('2026-10-12', 'Chưa tìm thấy')));
eq([w[1].total, w[1].lost], [1, 0]);

eq([L.isExpired('2026-08-01 00:00:00', '2026-10-10 12:00:00', 60), L.isExpired('2026-09-01 00:00:00', '2026-10-10 12:00:00', 60)], [true, false]);
const W = (s, t) => L.normalizeWeek(s, t || '2026-10-10');
eq([W('05101110'), W('05/10 – 11/10').tuan], [{ tuan: '05/10 - 11/10', tuan_key: '2026-10-05' }, '05/10 - 11/10']);
eq([W('31/02 - 06/03'), W('01/10 - 20/10'), W('11/10 - 05/10'), W('5/10')], [null, null, null, null]);
eq([W('29/12 - 04/01', '2027-01-02').tuan_key, W('29/12 - 04/01', '2026-12-20').tuan_key, W('02/01 - 08/01', '2026-12-28').tuan_key], ['2026-12-29', '2026-12-29', '2027-01-02']);

const G = [['Shopee', 'Shopee Tường Vip', ['TV']], ['Shopee', 'Shopee Tường Vip New', ['TV NEW']], ['TikTok', 'TikTok Tường Vip', []]]
  .map(([san, ten, alias]) => ({ san, ten, alias }));
eq([L.matchGian('Shopee_tv new_tuan40.xlsx', G).ten, L.matchGian('tiktok tuong vip.xlsx', G).ten], ['Shopee Tường Vip New', 'TikTok Tường Vip']);
eq([L.clipLyDo('  ' + 'x'.repeat(400)).length, L.validateFields({ ly_do_tra: 'y'.repeat(350) }, [], '2026-10-10').fields.ly_do_tra.length], [300, 300]);
eq([L.defaultNhom({ owner: 'tam', san: 'Shopee' }), L.defaultNhom({ owner: 'nhung', san: 'Shopee' }), L.defaultNhom({ owner: 'man', san: 'TikTok' })], ['Newtea', 'Shopee', 'TikTok']);
eq(L.nhomList([{ nhom: 'Zeta' }, { nhom: 'Newtea' }, { nhom: 'TikTok' }, { nhom: 'Shopee' }, { nhom: 'Anh' }]), ['Shopee', 'TikTok', 'Newtea', 'Anh', 'Zeta']);
const GG = [{ ten: 'Shopee Tường Vip', san: 'Shopee', nhom: 'Shopee', owner: 'nhung', alias: [] }];
eq([L.validateGian({ ten: 'shopee tuong vip', san: 'Shopee', owner: 'nhung' }, GG, ['nhung']).error.code,
  L.validateGian({ ten: 'Gian Mới', san: 'Khác', owner: 'ai_do' }, GG, ['nhung']).error.message,
  L.validateGian({ ten: 'Gian Mới', san: 'Khác', nhom: 'newtea', owner: 'nhung', alias: 'A, B' }, GG.concat([{ ten: 'X', nhom: 'Newtea' }]), ['nhung']).gian],
  ['BAD_INPUT', 'Người phụ trách không tồn tại: ai_do', { ten: 'Gian Mới', san: 'Khác', nhom: 'Newtea', owner: 'nhung', alias: ['A', 'B'], active: true }]);
console.log('OK: tất cả test qua');
