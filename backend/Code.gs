var TZ = 'Asia/Ho_Chi_Minh', FMT = 'yyyy-MM-dd HH:mm:ss';
var SHEETS = {
  Users: ['username', 'name', 'role', 'gians', 'salt', 'pin_hash', 'active'],
  Kho: ['ma', 'uploaded_at', 'uploaded_by'],
  Cases: ['ma', 'tuan', 'san', 'gian', 'loai_tep', 'ten_sp', 'phan_loai', 'ma_don_hang', 'dvvc', 'kho', 'trang_thai',
    'thoi_gian_tra', 'ghi_chu', 'created_at', 'created_by', 'closed_at', 'updated_at', 'updated_by', 'tuan_key', 'ly_do_tra'],
  Closed: ['ma', 'closed_at', 'trang_thai'],
  Weekly: ['tuan', 'gian', 'total', 'found', 'complained', 'lost', 'tuan_key'],
  Log: ['ts', 'user', 'action', 'detail'],
  Config: ['key', 'value']
};
var C = {};
SHEETS.Cases.forEach(function (h, i) { C[h] = i; });
var DEFAULT_CONFIG = [['kho_days', '60'], ['closed_days', '14'], ['tombstone_days', '60'], ['log_days', '90'],
  ['token_hours', '6'], ['kho_list', 'NVS,TSN,VL']];
var SEED_GIANS = [
  ['Shopee', 'Shopee NewteaVN', [], 'tam'], ['Shopee', 'Shopee NewteaHCM', [], 'tam'],
  ['TikTok', 'TikTok NewteaVN', [], 'tam'], ['TikTok', 'TikTok NewteaHCM', [], 'tam'],
  ['TikTok', 'TikTok Tường Vip', [], 'man'], ['TikTok', 'TikTok Nhà Sách', [], 'man'],
  ['TikTok', 'TikTok Sách Hay', [], 'man'], ['TikTok', 'TikTok Tranh Lịch', [], 'man'],
  ['Shopee', 'Shopee Tường Vip', ['TV'], 'nhung'], ['Shopee', 'Shopee Tường Vip New', ['TV NEW'], 'nhung'],
  ['Shopee', 'Shopee Tranh Vip', [], 'nhung'], ['Shopee', 'Shopee Newshop', ['NHÀ SÁCH', 'NEWSHOP'], 'nhung'],
  ['Shopee', 'Shopee Newshop CN1', ['CN1'], 'nhung'], ['Shopee', 'Shopee Newshop CN2', ['CN2'], 'nhung']
];
var SEED_USERS = [['tam', 'Tâm', 'staff'], ['nhung', 'Nhung', 'staff'], ['man', 'Mẫn', 'admin']];
var MAX_ROWS = 20000, CACHE_CHUNK = 30000;

// ---------- Tiện ích ----------
function err(code, message) { var e = new Error(message); e.code = code; return e; }
function nowTs() { return Utilities.formatDate(new Date(), TZ, FMT); }
function todayYmd() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet(n) {
  var s = ss().getSheetByName(n);
  if (!s) throw err('SERVER', 'Chưa chạy setup(): thiếu tab ' + n);
  return s;
}
function readRows(n, width) {
  var s = sheet(n), last = s.getLastRow(), w = width || SHEETS[n].length;
  return last < 2 ? [] : s.getRange(2, 1, last - 1, w).getValues();
}
function ensureRows(s, need) {
  var max = s.getMaxRows();
  if (need > max) s.insertRowsAfter(max, need - max + 500);
}
function writeRows(n, rows) {
  var s = sheet(n), w = SHEETS[n].length, last = s.getLastRow();
  if (last > 1) s.getRange(2, 1, last - 1, w).clearContent();
  if (!rows.length) return;
  ensureRows(s, rows.length + 1);
  s.getRange(2, 1, rows.length, w).setValues(rows);
}
function appendRows(n, rows) {
  if (!rows.length) return;
  var s = sheet(n), start = s.getLastRow() + 1;
  ensureRows(s, start + rows.length - 1);
  s.getRange(start, 1, rows.length, SHEETS[n].length).setValues(rows);
}
function toObj(n, r) { var o = {}; SHEETS[n].forEach(function (h, i) { o[h] = r[i]; }); return o; }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function num(v, d) { var x = Number(v); return isFinite(x) && x > 0 ? x : d; }
function withLock(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { throw err('BUSY', 'Hệ thống đang bận, vui lòng thử lại'); }
  try { var r = fn(); invalidateList(); return r; } finally { lock.releaseLock(); }
}
function logAction(user, action, detail) {
  appendRows('Log', [[nowTs(), user, action, JSON.stringify(detail || {})]]);
}

function getConfig() {
  var m = {}, gians = [];
  readRows('Config').forEach(function (r) {
    var k = String(r[0]).trim(), v = String(r[1]);
    if (k.indexOf('gian:') === 0) {
      try {
        var o = JSON.parse(v), g = { ten: k.slice(5).trim(), san: o.san, alias: o.alias || [], owner: o.owner || '', active: o.active !== false };
        g.nhom = o.nhom || defaultNhom(g);
        gians.push(g);
      } catch (e) { }
    } else if (k) m[k] = v;
  });
  return {
    kho_days: num(m.kho_days, 60), closed_days: num(m.closed_days, 14), tombstone_days: num(m.tombstone_days, 60),
    log_days: num(m.log_days, 90), token_hours: Math.min(6, num(m.token_hours, 6)),
    kho_list: String(m.kho_list || '').split(',').map(function (s) { return s.trim(); }).filter(String),
    gians: gians
  };
}
function findGian(cfg, ten) { return cfg.gians.filter(function (g) { return g.ten === ten; })[0] || null; }

// ---------- Cache danh sách ----------
function invalidateList() { CacheService.getScriptCache().remove('list:n'); }
function cachedList() {
  var c = CacheService.getScriptCache(), n = Number(c.get('list:n'));
  if (n) {
    var keys = [];
    for (var i = 0; i < n; i++) keys.push('list:' + i);
    var got = c.getAll(keys), parts = keys.map(function (k) { return got[k]; });
    if (parts.every(function (p) { return p != null; })) return parts.join('');
  }
  var s = JSON.stringify(buildList()), o = {}, cnt = 0;
  for (var j = 0; j < s.length; j += CACHE_CHUNK) o['list:' + cnt++] = s.slice(j, j + CACHE_CHUNK);
  if (cnt <= 200) { try { c.putAll(o, 60); c.put('list:n', String(cnt), 60); } catch (e) { } }
  return s;
}
function buildList() {
  var cfg = getConfig(), kl = JSON.parse(PropertiesService.getScriptProperties().getProperty('kho_last') || '{}'), names = {};
  readRows('Users', 2).forEach(function (r) { names[String(r[0]).trim().toLowerCase()] = String(r[1]); });
  return {
    cases: readRows('Cases').map(function (r) { return toObj('Cases', r); }),
    khoMeta: { lastUpdate: kl.lastUpdate || '', by: kl.by || '', count: Math.max(0, sheet('Kho').getLastRow() - 1) },
    config: {
      kho_list: cfg.kho_list, nhom_list: nhomList(cfg.gians),
      gians: cfg.gians.map(function (g) {
        return { san: g.san, ten: g.ten, nhom: g.nhom, owner: g.owner, owner_name: names[g.owner] || g.owner, alias: g.alias, active: g.active };
      })
    },
    weekly: readWeekly()
  };
}

// ---------- HTTP ----------
function doGet(e) {
  try {
    var a = (e && e.parameter && e.parameter.action) || 'list';
    if (a !== 'list') throw err('BAD_ACTION', 'Thao tác không hợp lệ');
    return ContentService.createTextOutput('{"ok":true,' + cachedList().slice(1)).setMimeType(ContentService.MimeType.JSON);
  } catch (x) { return json(errBody(x)); }
}

var ACTIONS = {
  login: { auth: false, fn: actLogin },
  me: { fn: function (u) { return { user: publicUser(u) }; } },
  change_pin: { write: true, fn: actChangePin },
  ingest_kho: { write: true, fn: actIngestKho },
  ingest_san: { write: function (b) { return !b.dry_run; }, fn: actIngestSan },
  update_cases: { write: true, fn: actUpdateCases },
  admin_upsert_user: { write: true, fn: actAdminUpsertUser },
  admin_list_users: { fn: actAdminListUsers },
  admin_upsert_gian: { write: true, fn: actAdminUpsertGian }
};

function doPost(e) {
  try {
    var b;
    try { b = JSON.parse(e.postData.contents); } catch (x) { throw err('BAD_JSON', 'Dữ liệu gửi lên không phải JSON hợp lệ'); }
    var a = ACTIONS[b && b.action];
    if (!a) throw err('BAD_ACTION', 'Thao tác không hợp lệ');
    var user = a.auth === false ? null : auth(b.token);
    var w = typeof a.write === 'function' ? a.write(b) : a.write;
    var res = w ? withLock(function () { return a.fn(user, b); }) : a.fn(user, b);
    return json(Object.assign({ ok: true }, res));
  } catch (x) { return json(errBody(x)); }
}
function errBody(x) {
  return { ok: false, code: x.code || 'SERVER', message: x.code ? x.message : 'Lỗi hệ thống: ' + x.message };
}

// ---------- Người dùng & xác thực ----------
function hashPin(salt, pin) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pin, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function parseUser(r) {
  var g = [];
  try { g = JSON.parse(r[3] || '[]'); } catch (e) { }
  return { username: String(r[0]).trim().toLowerCase(), name: String(r[1]), role: String(r[2]) === 'admin' ? 'admin' : 'staff',
    gians: g, salt: String(r[4]), pin_hash: String(r[5]), active: String(r[6]).toUpperCase() === 'TRUE' };
}
function findUser(username) {
  var u = String(username || '').trim().toLowerCase(), rows = readRows('Users');
  for (var i = 0; i < rows.length; i++) { var p = parseUser(rows[i]); if (p.username === u) return { i: i, u: p }; }
  return null;
}
function publicUser(u) { return { username: u.username, name: u.name, role: u.role, gians: u.gians }; }

function auth(token) {
  var name = token && CacheService.getScriptCache().get('tok:' + token);
  if (!name) throw err('AUTH_REQUIRED', 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại');
  var rec = findUser(name);
  if (!rec || !rec.u.active) throw err('INACTIVE', 'Tài khoản không còn hoạt động');
  return rec.u;
}

function actLogin(_, b) {
  var u = String(b.username || '').trim().toLowerCase(), pin = String(b.pin || '');
  if (!u || !pin) throw err('BAD_INPUT', 'Thiếu tên đăng nhập hoặc PIN');
  var c = CacheService.getScriptCache(), fk = 'fail:' + u, f = JSON.parse(c.get(fk) || 'null');
  if (f && f.n >= 5) throw err('LOCKED', 'Sai PIN quá 5 lần, vui lòng thử lại sau 15 phút');
  var rec = findUser(u);
  if (!rec || !rec.u.salt || hashPin(rec.u.salt, pin) !== rec.u.pin_hash) {
    var now = Date.now();
    f = f || { n: 0, t: now }; f.n++;
    c.put(fk, JSON.stringify(f), Math.max(1, 900 - Math.floor((now - f.t) / 1000)));
    throw err('BAD_LOGIN', 'Sai tên đăng nhập hoặc PIN');
  }
  if (!rec.u.active) throw err('INACTIVE', 'Tài khoản không còn hoạt động');
  c.remove(fk);
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''), ttl = getConfig().token_hours * 3600;
  c.put('tok:' + token, u, ttl);
  return { token: token, expires_in: ttl, user: publicUser(rec.u) };
}

function checkPin(pin) {
  if (String(pin || '').length < 6) throw err('PIN_SHORT', 'PIN tối thiểu 6 ký tự');
}

// Tạo/sửa user; pin rỗng thì giữ PIN cũ. Gọi trong lock.
function upsertUser(o, pin) {
  var cfg = getConfig(), rec = findUser(o.username), cur = rec ? rec.u : null;
  var username = String(o.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,32}$/.test(username)) throw err('BAD_INPUT', 'Tên đăng nhập chỉ gồm a-z, 0-9, . _ - (2-32 ký tự)');
  if (!cur && !pin) throw err('BAD_INPUT', 'User mới cần PIN');
  var role = o.role != null ? o.role : (cur ? cur.role : 'staff');
  if (role !== 'admin' && role !== 'staff') throw err('BAD_INPUT', 'role phải là admin hoặc staff');
  var gians = o.gians != null ? o.gians : (cur ? cur.gians : []);
  if (!Array.isArray(gians) || gians.some(function (g) { return !findGian(cfg, g); })) throw err('BAD_INPUT', 'Danh sách gian không hợp lệ');
  var salt = cur ? cur.salt : '', hash = cur ? cur.pin_hash : '';
  if (pin) { checkPin(pin); salt = Utilities.getUuid(); hash = hashPin(salt, String(pin)); }
  var row = [username, o.name != null ? String(o.name) : (cur ? cur.name : username), role, JSON.stringify(gians), salt, hash,
    String(o.active != null ? !!o.active : (cur ? cur.active : true)).toUpperCase()];
  if (cur) sheet('Users').getRange(rec.i + 2, 1, 1, row.length).setValues([row]);
  else appendRows('Users', [row]);
  return parseUser(row);
}

function actChangePin(user, b) {
  if (hashPin(user.salt, String(b.old_pin || '')) !== user.pin_hash) throw err('BAD_LOGIN', 'PIN cũ không đúng');
  checkPin(b.new_pin);
  upsertUser({ username: user.username }, String(b.new_pin));
  logAction(user.username, 'change_pin', {});
  return {};
}

function gianValue(g) { return JSON.stringify({ san: g.san, nhom: g.nhom, alias: g.alias, owner: g.owner, active: g.active }); }

function actAdminUpsertGian(user, b) {
  if (user.role !== 'admin') throw err('FORBIDDEN', 'Chỉ admin được quản lý gian hàng');
  var cfg = getConfig(), names = readRows('Users', 1).map(function (r) { return String(r[0]).trim().toLowerCase(); });
  var v = validateGian(b, cfg.gians, names);
  if (v.error) throw err(v.error.code, v.error.message);
  var g = v.gian, key = 'gian:' + g.ten, rows = readRows('Config'), i = -1;
  rows.forEach(function (r, j) { if (String(r[0]).trim() === key) i = j; });
  if (i >= 0) sheet('Config').getRange(i + 2, 1, 1, 2).setValues([[key, gianValue(g)]]);
  else appendRows('Config', [[key, gianValue(g)]]);
  logAction(user.username, 'admin_upsert_gian', g);
  return { gian: g, created: v.isNew };
}

function actAdminListUsers(user) {
  if (user.role !== 'admin') throw err('FORBIDDEN', 'Chỉ admin được quản lý người dùng');
  return { users: readRows('Users').map(parseUser).filter(function (u) { return u.username; })
    .map(function (u) { return Object.assign(publicUser(u), { active: u.active }); }) };
}

function actAdminUpsertUser(user, b) {
  if (user.role !== 'admin') throw err('FORBIDDEN', 'Chỉ admin được quản lý người dùng');
  var u = upsertUser({ username: b.username, name: b.name, role: b.role, gians: b.gians, active: b.active }, b.pin ? String(b.pin) : '');
  logAction(user.username, 'admin_upsert_user', { username: u.username, role: u.role, gians: u.gians, active: u.active, pin_changed: !!b.pin });
  return { user: Object.assign(publicUser(u), { active: u.active }) };
}

// ---------- Weekly ----------
function readWeekly() {
  return readRows('Weekly').map(function (r) {
    return { tuan: String(r[0]), gian: String(r[1]), total: +r[2] || 0, found: +r[3] || 0, complained: +r[4] || 0, lost: +r[5] || 0, tuan_key: String(r[6]) };
  });
}
function applyWeekly(deltas) {
  if (!deltas.length) return;
  writeRows('Weekly', weeklyApply(readWeekly(), deltas).map(function (w) {
    return [w.tuan, w.gian, w.total, w.found, w.complained, w.lost, w.tuan_key];
  }));
}
function caseKey(r) {
  return { tuan: String(r[C.tuan]), tuan_key: String(r[C.tuan_key]), gian: String(r[C.gian]), trang_thai: String(r[C.trang_thai]) };
}

// ---------- Nghiệp vụ ----------
function codeSet(n) {
  var s = {};
  readRows(n, 1).forEach(function (r) { var m = normalizeMa(r[0]); if (m) s[m] = 1; });
  return s;
}

function actIngestKho(user, b) {
  if (!Array.isArray(b.codes)) throw err('BAD_INPUT', 'Thiếu danh sách mã (codes)');
  if (b.codes.length > MAX_ROWS) throw err('TOO_MANY', 'Tối đa ' + MAX_ROWS + ' mã mỗi lần');
  var d = dedupeBy(b.codes.map(normalizeMa), function (x) { return x; });
  var now = nowTs(), kho = codeSet('Kho');
  var add = d.unique.filter(function (m) { return !kho[m]; });
  appendRows('Kho', add.map(function (m) { return [m, now, user.username]; }));
  add.forEach(function (m) { kho[m] = 1; });

  var rows = readRows('Cases'), deltas = [], closed = 0;
  rows.forEach(function (r) {
    if (!isOpenState(String(r[C.trang_thai])) || !kho[normalizeMa(r[C.ma])]) return;
    var old = caseKey(r);
    r[C.trang_thai] = 'Đã tìm thấy'; r[C.closed_at] = now; r[C.updated_at] = now; r[C.updated_by] = 'auto';
    deltas = deltas.concat(weeklyDeltas(old, caseKey(r))); closed++;
  });
  if (closed) { writeRows('Cases', rows); applyWeekly(deltas); }
  PropertiesService.getScriptProperties().setProperty('kho_last', JSON.stringify({ lastUpdate: now, by: user.username }));
  var res = { read: d.unique.length + d.dup, dupInFile: d.dup, existed: d.unique.length - add.length, added: add.length, autoClosed: closed };
  logAction(user.username, 'ingest_kho', res);
  return res;
}

function actIngestSan(user, b) {
  var cfg = getConfig(), wk = normalizeWeek(b.tuan, todayYmd()), gian = findGian(cfg, b.gian), dry = !!b.dry_run;
  if (!wk) throw err('BAD_INPUT', WEEK_ERR);
  var tuan = wk.tuan;
  if (!gian) throw err('NOT_FOUND', 'Không tìm thấy gian: ' + b.gian);
  if (!canEditGian(user, gian.ten)) throw err('FORBIDDEN', 'Bạn không phụ trách gian ' + gian.ten);
  if (!gian.active) throw err('BAD_INPUT', 'Gian ' + gian.ten + ' đã tắt');
  if (!Array.isArray(b.rows)) throw err('BAD_INPUT', 'Thiếu danh sách dòng (rows)');
  if (b.rows.length > MAX_ROWS) throw err('TOO_MANY', 'Tối đa ' + MAX_ROWS + ' dòng mỗi lần');
  var d = dedupeBy(b.rows.map(function (r) { return Object.assign({}, r, { ma: normalizeMa(r && r.ma) }); }),
    function (r) { return r.ma; });
  d.unique.forEach(function (r) {
    if (LOAI_TEP.indexOf(r.loai_tep) < 0) throw err('BAD_INPUT', 'loai_tep không hợp lệ ở mã ' + r.ma);
  });
  var now = nowTs(), cases = codeSet('Cases'), kho = codeSet('Kho'), closed = {};
  readRows('Closed').forEach(function (r) {
    if (!isExpired(String(r[1]), now, cfg.tombstone_days)) closed[normalizeMa(r[0])] = 1;
  });
  var res = { read: d.unique.length + d.dup, dupInFile: d.dup, existedCase: 0, existedClosed: 0, matchedKho: 0, created: 0 }, add = [];
  d.unique.forEach(function (r) {
    if (cases[r.ma]) res.existedCase++;
    else if (closed[r.ma]) res.existedClosed++;
    else if (kho[r.ma]) res.matchedKho++;
    else {
      add.push([r.ma, tuan, gian.san, gian.ten, r.loai_tep, s(r.ten_sp), s(r.phan_loai), s(r.ma_don_hang), s(r.dvvc), '', 'Mới',
        '', '', now, user.username, '', now, user.username, wk.tuan_key, clipLyDo(r.ly_do_tra)]);
    }
  });
  res.created = add.length;
  if (!dry) {
    appendRows('Cases', add);
    if (add.length) applyWeekly([{ tuan: tuan, tuan_key: wk.tuan_key, gian: gian.ten, field: 'total', delta: add.length }]);
    logAction(user.username, 'ingest_san', Object.assign({ tuan: tuan, tuan_key: wk.tuan_key, gian: gian.ten }, res));
  }
  res.khoLastUpdate = JSON.parse(PropertiesService.getScriptProperties().getProperty('kho_last') || '{}').lastUpdate || '';
  return res;
  function s(v) { return v == null ? '' : String(v).trim(); }
}

function actUpdateCases(user, b) {
  if (!Array.isArray(b.items) || !b.items.length) throw err('BAD_INPUT', 'Thiếu danh sách items');
  if (b.items.length > MAX_ROWS) throw err('TOO_MANY', 'Tối đa ' + MAX_ROWS + ' dòng mỗi lần');
  var cfg = getConfig(), rows = readRows('Cases'), idx = {}, now = nowTs(), today = todayYmd(), errors = [], deltas = [], done = [];
  rows.forEach(function (r, i) { idx[normalizeMa(r[C.ma])] = i; });
  b.items.forEach(function (it) {
    var ma = normalizeMa(it && it.ma), i = idx[ma];
    function fail(code, message) { errors.push({ ma: ma, code: code, message: message }); }
    if (i == null) return fail('NOT_FOUND', 'Không tìm thấy mã');
    var r = rows[i];
    if (!canEditGian(user, String(r[C.gian]))) return fail('FORBIDDEN', 'Bạn không phụ trách gian ' + r[C.gian]);
    var v = validateFields(it.fields, cfg.kho_list, today);
    if (v.error) return fail(v.error.code, v.error.message);
    var from = String(r[C.trang_thai]), to = v.fields.trang_thai != null ? v.fields.trang_thai : from;
    var e = checkTransition(user, from, to);
    if (e) return fail(e.code, e.message);
    var old = caseKey(r);
    Object.keys(v.fields).forEach(function (k) { r[C[k]] = v.fields[k]; });
    if (to !== from) r[C.closed_at] = isClosedState(to) ? now : '';
    r[C.updated_at] = now; r[C.updated_by] = user.username;
    deltas = deltas.concat(weeklyDeltas(old, caseKey(r)));
    done.push(ma);
  });
  if (done.length) {
    writeRows('Cases', rows); applyWeekly(deltas);
    logAction(user.username, 'update_cases', { items: b.items.filter(function (it) { return done.indexOf(normalizeMa(it.ma)) >= 0; }) });
  }
  return { updated: done.length, errors: errors };
}

function nightlyMaintenance() {
  withLock(function () {
    var cfg = getConfig(), now = nowTs(), st = {};
    var kho = readRows('Kho'), khoKeep = kho.filter(function (r) { return !isExpired(String(r[1]), now, cfg.kho_days); });
    if (khoKeep.length !== kho.length) writeRows('Kho', khoKeep);
    st.kho = kho.length - khoKeep.length;

    var cases = readRows('Cases'), keep = [], moved = [];
    cases.forEach(function (r) {
      if (isClosedState(String(r[C.trang_thai])) && isExpired(String(r[C.closed_at]), now, cfg.closed_days))
        moved.push([normalizeMa(r[C.ma]), r[C.closed_at], r[C.trang_thai]]);
      else keep.push(r);
    });
    var cl = readRows('Closed'), clKeep = cl.filter(function (r) { return !isExpired(String(r[1]), now, cfg.tombstone_days); });
    if (moved.length || clKeep.length !== cl.length) writeRows('Closed', clKeep.concat(moved));
    if (moved.length) writeRows('Cases', keep);
    st.moved = moved.length; st.tombstone = cl.length - clKeep.length;

    var lg = readRows('Log'), lgKeep = lg.filter(function (r) { return !isExpired(String(r[0]), now, cfg.log_days); });
    if (lgKeep.length !== lg.length) writeRows('Log', lgKeep);
    st.log = lg.length - lgKeep.length;
    logAction('system', 'nightly', st);
  });
}

// ---------- Chạy tay trong trình soạn thảo / menu ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Đối soát')
    .addItem('1. Khởi tạo (setup)', 'setup')
    .addItem('2. Tạo 3 nhân viên (seedUsers)', 'seedUsers')
    .addItem('3. Cài lịch dọn hằng đêm', 'installTriggers')
    .addItem('Tạo admin mới', 'createAdmin')
    .addToUi();
}

function setup() {
  var book = ss();
  Object.keys(SHEETS).forEach(function (n) {
    var sh = book.getSheetByName(n) || book.insertSheet(n), h = SHEETS[n];
    sh.getRange(1, 1, sh.getMaxRows(), n === 'Weekly' ? 2 : h.length).setNumberFormat('@');
    if (n === 'Weekly') sh.getRange(1, h.length, sh.getMaxRows(), 1).setNumberFormat('@');
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  var have = {}, cfgRows = readRows('Config'), fixed = false;
  cfgRows.forEach(function (r) {
    var k = String(r[0]).trim();
    have[k] = 1;
    if (k.indexOf('gian:') !== 0) return;
    try {
      var o = JSON.parse(String(r[1]));
      if (!o.nhom) { o.nhom = defaultNhom({ owner: o.owner, san: o.san }); fixed = true; }
      if (o.active == null) { o.active = true; fixed = true; }
      r[1] = JSON.stringify(o);
    } catch (e) { }
  });
  if (fixed) writeRows('Config', cfgRows);
  var add = DEFAULT_CONFIG.concat(SEED_GIANS.map(function (g) {
    return ['gian:' + g[1], gianValue({ san: g[0], nhom: defaultNhom({ owner: g[3], san: g[0] }), alias: g[2], owner: g[3], active: true })];
  })).filter(function (r) { return !have[r[0]]; });
  appendRows('Config', add);
  book.getSheets().forEach(function (sh) {
    if (!SHEETS[sh.getName()] && sh.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(sh);
  });
  invalidateList();
  return 'Đã khởi tạo';
}

function askText(label) {
  var ui = SpreadsheetApp.getUi(), r = ui.prompt(label, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) throw new Error('Đã hủy');
  return r.getResponseText().trim();
}

function createAdmin(username, name, pin) {
  username = typeof username === 'string' ? username : askText('Tên đăng nhập admin (vd: man)');
  name = name || askText('Họ tên hiển thị');
  pin = pin || askText('PIN tạm (tối thiểu 6 ký tự)');
  checkPin(pin);
  withLock(function () {
    upsertUser({ username: username, name: name, role: 'admin', active: true }, pin);
    logAction('system', 'create_admin', { username: username });
  });
  return 'Đã tạo admin ' + username;
}

function seedUsers(pinTam, pinNhung, pinMan) {
  var pins = [pinTam, pinNhung, pinMan].map(function (p) { return typeof p === 'string' ? p : ''; });
  var cfg = getConfig(), out = [];
  SEED_USERS.forEach(function (x, i) {
    if (findUser(x[0])) return;
    pins[i] = pins[i] || askText('PIN tạm cho ' + x[1] + ' (tối thiểu 6 ký tự)');
    checkPin(pins[i]);
  });
  withLock(function () {
    SEED_USERS.forEach(function (x, i) {
      if (findUser(x[0])) return out.push(x[0] + ': đã có, bỏ qua');
      var gians = cfg.gians.filter(function (g) { return g.owner === x[0]; }).map(function (g) { return g.ten; });
      upsertUser({ username: x[0], name: x[1], role: x[2], gians: gians, active: true }, pins[i]);
      out.push(x[0] + ': đã tạo');
    });
    logAction('system', 'seed_users', out);
  });
  Logger.log(out.join('\n'));
  return out.join('\n');
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'nightlyMaintenance') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('nightlyMaintenance').timeBased().everyDays(1).atHour(2).create();
  return 'Đã cài lịch dọn lúc 2h sáng';
}
