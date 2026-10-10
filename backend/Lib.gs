// Hàm thuần: không gọi API Apps Script, test được bằng Node.
var OPEN_STATES = ['Mới', 'Chưa về kho', 'Chưa tìm thấy'];
var CLOSED_STATES = ['Đã tìm thấy', 'Đã khiếu nại', 'Xác nhận mất'];
var LOAI_TEP = ['Trả hàng', 'Giao không thành công'];
var COUNTER_BY_STATE = { 'Đã tìm thấy': 'found', 'Đã khiếu nại': 'complained', 'Xác nhận mất': 'lost' };
var WEEKLY_FIELDS = ['total', 'found', 'complained', 'lost'];
var EDITABLE_FIELDS = ['kho', 'trang_thai', 'ghi_chu', 'thoi_gian_tra', 'tuan'];

function normalizeMa(v) {
  return v == null ? '' : String(v).replace(/[\s​﻿]+/g, '').toUpperCase();
}

function dedupeBy(items, keyFn) {
  var seen = {}, unique = [], dup = 0, empty = 0;
  items.forEach(function (it) {
    var k = keyFn(it);
    if (!k) { empty++; return; }
    if (seen[k]) { dup++; return; }
    seen[k] = 1; unique.push(it);
  });
  return { unique: unique, dup: dup, empty: empty };
}

function isOpenState(s) { return OPEN_STATES.indexOf(s) >= 0; }
function isClosedState(s) { return CLOSED_STATES.indexOf(s) >= 0; }
function isValidState(s) { return isOpenState(s) || isClosedState(s); }

function canEditGian(user, gian) {
  return !!user && (user.role === 'admin' || (user.gians || []).indexOf(gian) >= 0);
}

// Trả null nếu hợp lệ, ngược lại {code, message}.
function checkTransition(user, from, to) {
  if (from === to) return null;
  if (!isValidState(to)) return { code: 'BAD_INPUT', message: 'Trạng thái không hợp lệ: ' + to };
  if (isClosedState(from) && !isClosedState(to) && user.role !== 'admin')
    return { code: 'BAD_TRANSITION', message: 'Chỉ admin được mở lại đơn đã đóng' };
  return null;
}

function validateFields(fields, khoList) {
  var out = {};
  var keys = Object.keys(fields || {});
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], v = fields[k] == null ? '' : String(fields[k]).trim();
    if (EDITABLE_FIELDS.indexOf(k) < 0) return { error: { code: 'BAD_FIELD', message: 'Không được sửa cột ' + k } };
    if (k === 'kho' && v && khoList.indexOf(v) < 0) return { error: { code: 'BAD_INPUT', message: 'Kho không hợp lệ: ' + v } };
    if (k === 'trang_thai' && !isValidState(v)) return { error: { code: 'BAD_INPUT', message: 'Trạng thái không hợp lệ: ' + v } };
    if (k === 'tuan' && !isMonday(v)) return { error: { code: 'BAD_INPUT', message: 'Tuần phải là ngày Thứ 2 (yyyy-MM-dd)' } };
    out[k] = v;
  }
  return { fields: out };
}

// Đóng góp của 1 case vào bộ đếm Weekly.
function caseContrib(c) {
  var o = { total: 1 }, f = COUNTER_BY_STATE[c.trang_thai];
  if (f) o[f] = 1;
  return o;
}

function weeklyDeltas(oldC, newC) {
  var acc = {};
  function add(c, sign) {
    if (!c) return;
    var con = caseContrib(c), key = c.tuan + '|' + c.gian;
    Object.keys(con).forEach(function (f) {
      var k = key + '|' + f;
      if (!acc[k]) acc[k] = { tuan: c.tuan, gian: c.gian, field: f, delta: 0 };
      acc[k].delta += sign * con[f];
    });
  }
  add(oldC, -1); add(newC, 1);
  return Object.keys(acc).map(function (k) { return acc[k]; }).filter(function (d) { return d.delta !== 0; });
}

function weeklyApply(list, deltas) {
  var map = {};
  list.forEach(function (w) { map[w.tuan + '|' + w.gian] = w; });
  deltas.forEach(function (d) {
    var k = d.tuan + '|' + d.gian;
    if (!map[k]) { map[k] = { tuan: d.tuan, gian: d.gian, total: 0, found: 0, complained: 0, lost: 0 }; list.push(map[k]); }
    map[k][d.field] = (Number(map[k][d.field]) || 0) + d.delta;
  });
  return list;
}

function parseTs(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s || ''));
  return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : NaN;
}

function isExpired(ts, nowTs, days) {
  var t = parseTs(ts);
  return !isNaN(t) && t < parseTs(nowTs) - days * 86400000;
}

function isMonday(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return false;
  var dt = new Date(parseTs(d));
  return !isNaN(dt) && dt.toISOString().slice(0, 10) === d && dt.getUTCDay() === 1;
}

function foldText(s) {
  return ' ' + String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'D')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() + ' ';
}

function gianAliases(g) {
  return [g.ten, g.ten.slice(g.san.length)].concat(g.alias || []);
}

// Nhận diện gian từ tên file: lọc theo sàn nếu tên file có tên sàn, alias dài thắng.
function matchGian(name, gians) {
  var t = foldText(name), best = null, bestLen = 0;
  var sans = gians.map(function (g) { return g.san; })
    .filter(function (s, i, a) { return a.indexOf(s) === i && t.indexOf(foldText(s)) >= 0; });
  gians.forEach(function (g) {
    if (sans.length === 1 && g.san !== sans[0]) return;
    gianAliases(g).forEach(function (a) {
      var f = foldText(a);
      if (f.trim() && t.indexOf(f) >= 0 && f.length > bestLen) { best = g; bestLen = f.length; }
    });
  });
  return best;
}
