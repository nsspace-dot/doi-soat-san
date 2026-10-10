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

function validateFields(fields, khoList, todayYmd) {
  var out = {};
  var keys = Object.keys(fields || {});
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], v = fields[k] == null ? '' : String(fields[k]).trim();
    if (EDITABLE_FIELDS.indexOf(k) < 0) return { error: { code: 'BAD_FIELD', message: 'Không được sửa cột ' + k } };
    if (k === 'kho' && v && khoList.indexOf(v) < 0) return { error: { code: 'BAD_INPUT', message: 'Kho không hợp lệ: ' + v } };
    if (k === 'trang_thai' && !isValidState(v)) return { error: { code: 'BAD_INPUT', message: 'Trạng thái không hợp lệ: ' + v } };
    if (k === 'tuan') {
      var w = normalizeWeek(v, todayYmd);
      if (!w) return { error: { code: 'BAD_INPUT', message: WEEK_ERR } };
      out.tuan = w.tuan; out.tuan_key = w.tuan_key; continue;
    }
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
    var con = caseContrib(c), key = c.tuan_key + '|' + c.gian;
    Object.keys(con).forEach(function (f) {
      var k = key + '|' + f;
      if (!acc[k]) acc[k] = { tuan: c.tuan, tuan_key: c.tuan_key, gian: c.gian, field: f, delta: 0 };
      acc[k].delta += sign * con[f];
    });
  }
  add(oldC, -1); add(newC, 1);
  return Object.keys(acc).map(function (k) { return acc[k]; }).filter(function (d) { return d.delta !== 0; });
}

function weeklyApply(list, deltas) {
  var map = {};
  list.forEach(function (w) { map[w.tuan_key + '|' + w.gian] = w; });
  deltas.forEach(function (d) {
    var k = d.tuan_key + '|' + d.gian;
    if (!map[k]) { map[k] = { tuan: d.tuan, tuan_key: d.tuan_key, gian: d.gian, total: 0, found: 0, complained: 0, lost: 0 }; list.push(map[k]); }
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

var WEEK_ERR = 'Tuần phải dạng DD/MM - DD/MM, ví dụ 05/10 - 11/10';

function pad2(n) { return (n < 10 ? '0' : '') + n; }

// "5/10-11/10", "05/10 – 11/10", "05101110" → {tuan:'05/10 - 11/10', tuan_key:'yyyy-MM-dd'} hoặc null.
// Năm theo ngày thao tác: tháng 12 khi đang tháng 1 → năm trước; tháng 1 khi đang tháng 12 → năm sau.
function normalizeWeek(s, todayYmd) {
  var t = String(s == null ? '' : s).trim(), m = /^(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(t) ||
    /^(\d{1,2})\s*\/\s*(\d{1,2})\s*[-\u2013\u2014]\s*(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(t);
  var today = /^(\d{4})-(\d{2})/.exec(String(todayYmd || ''));
  if (!m || !today) return null;
  var d1 = +m[1], m1 = +m[2], d2 = +m[3], m2 = +m[4], ny = +today[1], nm = +today[2];
  var y1 = m1 === 12 && nm === 1 ? ny - 1 : m1 === 1 && nm === 12 ? ny + 1 : ny, y2 = m2 < m1 ? y1 + 1 : y1;
  var a = Date.UTC(y1, m1 - 1, d1), b = Date.UTC(y2, m2 - 1, d2), ok = function (t, y, mo, d) {
    var x = new Date(t); return x.getUTCFullYear() === y && x.getUTCMonth() === mo - 1 && x.getUTCDate() === d;
  };
  if (!ok(a, y1, m1, d1) || !ok(b, y2, m2, d2)) return null;
  var diff = (b - a) / 86400000;
  if (diff < 0 || diff > 13) return null;
  return { tuan: pad2(d1) + '/' + pad2(m1) + ' - ' + pad2(d2) + '/' + pad2(m2), tuan_key: y1 + '-' + pad2(m1) + '-' + pad2(d1) };
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
