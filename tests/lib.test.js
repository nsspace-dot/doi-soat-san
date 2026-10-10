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
eq(L.validateFields({ ma_don_hang: 'x' }, ['NVS']).error.code, 'BAD_FIELD');

const k = (tuan, tt) => ({ tuan, gian: 'G', trang_thai: tt });
const w = L.weeklyApply([], L.weeklyDeltas(null, k('2026-10-05', 'Mới')));
L.weeklyApply(w, L.weeklyDeltas(k('2026-10-05', 'Mới'), k('2026-10-05', 'Đã khiếu nại')));
L.weeklyApply(w, L.weeklyDeltas(k('2026-10-05', 'Đã khiếu nại'), k('2026-10-12', 'Xác nhận mất')));
eq(w.map(x => [x.tuan, x.total, x.complained, x.lost]), [['2026-10-05', 0, 0, 0], ['2026-10-12', 1, 0, 1]]);
L.weeklyApply(w, L.weeklyDeltas(k('2026-10-12', 'Xác nhận mất'), k('2026-10-12', 'Chưa tìm thấy')));
eq([w[1].total, w[1].lost], [1, 0]);

eq([L.isExpired('2026-08-01 00:00:00', '2026-10-10 12:00:00', 60), L.isExpired('2026-09-01 00:00:00', '2026-10-10 12:00:00', 60)], [true, false]);
eq([L.isMonday('2026-10-05'), L.isMonday('2026-10-06'), L.isMonday('2026-02-30')], [true, false, false]);

const G = [['Shopee', 'Shopee Tường Vip', ['TV']], ['Shopee', 'Shopee Tường Vip New', ['TV NEW']], ['TikTok', 'TikTok Tường Vip', []]]
  .map(([san, ten, alias]) => ({ san, ten, alias }));
eq([L.matchGian('Shopee_tv new_tuan40.xlsx', G).ten, L.matchGian('tiktok tuong vip.xlsx', G).ten], ['Shopee Tường Vip New', 'TikTok Tường Vip']);
console.log('OK: tất cả test qua');
