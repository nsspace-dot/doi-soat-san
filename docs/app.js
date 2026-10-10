(function () {
  'use strict';
  var P = window.Parse;
  var ST_OPEN = ['Mới', 'Chưa về kho', 'Chưa tìm thấy'], ST_CLOSED = ['Đã tìm thấy', 'Đã khiếu nại', 'Xác nhận mất'];
  var ST_ALL = ST_OPEN.concat(ST_CLOSED);
  var ST_CLS = { 'Mới': 's-moi', 'Chưa về kho': 's-chuave', 'Chưa tìm thấy': 's-chuatim', 'Đã tìm thấy': 's-datim', 'Đã khiếu nại': 's-khieunai', 'Xác nhận mất': 's-mat' };
  var KHO_CLS = { TSN: 'k-tsn', NVS: 'k-nvs', VL: 'k-vl' };
  var PAGE = 50, CHUNK = 20000, CONFIRM_CLOSE = 'Chi tiết đơn sẽ bị xóa sau 14 ngày. Tiếp tục?';
  var S = { data: null, token: '', user: null, page: 1, sel: {}, rowErr: {}, loadedAt: 0, kho: null, san: [] };

  var $ = function (id) { return document.getElementById(id); };
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function opts(list, cur, blank) {
    return (blank != null ? '<option value="">' + esc(blank) + '</option>' : '') + list.map(function (o) {
      var v = typeof o === 'object' ? o.v : o, t = typeof o === 'object' ? o.t : o;
      return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
  }
  function msg(text, type) {
    var m = $('msg');
    if (!text) { m.hidden = true; return; }
    m.hidden = false; m.className = type || 'info'; m.textContent = text;
    if (type === 'ok') setTimeout(function () { if (m.textContent === text) m.hidden = true; }, 6000);
  }
  function store(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { } }
  function load(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }

  // ---------- API ----------
  function apiGet() {
    return fetch(window.API_URL + '?action=list', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw j;
      return j;
    });
  }
  function api(action, body) {
    var payload = Object.assign({ action: action, token: S.token }, body || {});
    return fetch(window.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); }, function () { throw { code: 'NET', message: 'Không kết nối được máy chủ, kiểm tra mạng' }; })
      .then(function (j) {
        if (!j.ok) {
          if (action !== 'login' && (j.code === 'AUTH_REQUIRED' || j.code === 'INACTIVE')) setUser(null, '', j.message);
          throw j;
        }
        return j;
      });
  }
  function errText(e) { return (e && e.message) || 'Có lỗi xảy ra'; }

  // ---------- Đăng nhập ----------
  function setUser(user, token, why) {
    S.user = user; S.token = token || '';
    store('token', user ? S.token : null);
    document.querySelectorAll('.auth').forEach(function (el) { el.hidden = !user; });
    $('btnLogin').hidden = !!user;
    $('userName').textContent = user ? user.name + ' (' + (user.role === 'admin' ? 'admin' : 'đối soát') + ')' : '';
    if (!user) { S.sel = {}; showView('list'); }
    if (why) msg(why + ' — đã chuyển về chế độ xem.', 'err');
    render();
  }
  function canEdit(c) { return !!S.user && (S.user.role === 'admin' || (S.user.gians || []).indexOf(c.gian) >= 0); }
  function myGians() {
    var g = (S.data && S.data.config.gians) || [];
    return S.user && S.user.role === 'admin' ? g : g.filter(function (x) { return (S.user ? S.user.gians : []).indexOf(x.ten) >= 0; });
  }

  // ---------- Danh sách ----------
  function refresh(quiet) {
    if (!quiet) msg('Đang tải dữ liệu...', 'info');
    return apiGet().then(function (j) {
      S.data = j; S.loadedAt = Date.now();
      if (!quiet) msg('');
      fillFilters(); render();
    }).catch(function (e) { msg('Không tải được danh sách: ' + errText(e), 'err'); });
  }

  function fillFilters() {
    var d = S.data, cs = d.cases, keep = function (id) { return $(id).value; };
    var uniq = function (f) { return cs.map(f).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort(); };
    var san = keep('fSan');
    $('fSan').innerHTML = opts(uniq(function (c) { return c.san; }), san, 'Tất cả');
    var gians = d.config.gians.filter(function (g) { return !san || g.san === san; }).map(function (g) { return g.ten; });
    $('fGian').innerHTML = opts(gians, keep('fGian'), 'Tất cả');
    $('fKho').innerHTML = opts(d.config.kho_list.concat([{ v: '-', t: '(Trống)' }]), keep('fKho'), 'Tất cả');
    $('fTuan').innerHTML = opts(uniq(function (c) { return c.tuan; }).reverse().map(function (t) { return { v: t, t: P.fmtWeek(t) }; }), keep('fTuan'), 'Tất cả');
    $('fTt').innerHTML = opts(ST_ALL, keep('fTt'), 'Tất cả');
    $('bulkKho').innerHTML = opts(d.config.kho_list.concat([{ v: '-', t: '(Trống)' }]), '', '— KHO —');
    $('bulkTt').innerHTML = opts(ST_ALL, '', '— Trạng thái —');
    var km = d.khoMeta || {};
    $('khoMeta').textContent = km.lastUpdate ? 'Kho cập nhật lần cuối: ' + km.lastUpdate + ' bởi ' + km.by + ' (' + km.count + ' mã)' : 'Kho chưa có dữ liệu';
  }

  function owners() {
    var m = {};
    ((S.data && S.data.config.gians) || []).forEach(function (g) { m[g.ten] = g.owner; });
    return m;
  }
  function isClosed(c) { return ST_CLOSED.indexOf(c.trang_thai) >= 0; }
  function days(c) { return P.daysOpen(c.created_at, isClosed(c) ? c.closed_at : '', new Date()); }

  function filtered() {
    var f = { san: $('fSan').value, gian: $('fGian').value, kho: $('fKho').value, tuan: $('fTuan').value, tt: $('fTt').value, closed: $('fClosed').checked };
    var codes = P.splitCodes($('fMa').value), set = {};
    codes.forEach(function (c) { set[c] = 1; });
    return S.data.cases.filter(function (c) {
      if (!f.closed && isClosed(c) && f.tt !== c.trang_thai) return false;
      if (f.san && c.san !== f.san) return false;
      if (f.gian && c.gian !== f.gian) return false;
      if (f.kho && (f.kho === '-' ? c.kho : c.kho !== f.kho)) return false;
      if (f.tuan && c.tuan !== f.tuan) return false;
      if (f.tt && c.trang_thai !== f.tt) return false;
      if (codes.length === 1 && String(c.ma).indexOf(codes[0]) < 0) return false;
      if (codes.length > 1 && !set[c.ma]) return false;
      return true;
    }).sort(function (a, b) { return (b.tuan || '').localeCompare(a.tuan || '') || String(a.created_at).localeCompare(String(b.created_at)); });
  }

  var COLS = ['Tuần', 'Sàn', 'Gian', 'Mã vận đơn', 'Loại tệp', 'Tên sản phẩm', 'Phân loại', 'Mã đơn hàng', 'ĐVVC', 'KHO',
    'Thời gian trả trên hệ thống', 'Trạng thái', 'Ghi chú', 'Phụ trách', 'Số ngày tồn'];

  function render() {
    if (!S.data) return;
    var all = S.data.cases, open = all.filter(function (c) { return !isClosed(c); });
    var cnt = function (st) { return open.filter(function (c) { return c.trang_thai === st; }).length; };
    $('cChuaTim').textContent = cnt('Chưa tìm thấy'); $('cMoi').textContent = cnt('Mới'); $('cChuaVe').textContent = cnt('Chưa về kho');
    $('cTon').textContent = open.filter(function (c) { return days(c) >= 7; }).length;

    var rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (S.page > pages) S.page = pages;
    var view = rows.slice((S.page - 1) * PAGE, S.page * PAGE), own = owners(), auth = !!S.user;
    $('fCount').textContent = rows.length + ' đơn';
    $('pInfo').textContent = 'Trang ' + S.page + '/' + pages;
    $('pPrev').disabled = S.page <= 1; $('pNext').disabled = S.page >= pages;
    var editable = view.filter(canEdit), allSel = editable.length && editable.every(function (c) { return S.sel[c.ma]; });
    $('tbl').tHead.innerHTML = '<tr>' + (auth ? '<th><input type="checkbox" id="selAll"' + (allSel ? ' checked' : '') + '></th>' : '') +
      COLS.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>';
    var weeks = P.recentWeeks(new Date(), 12);
    $('tbl').tBodies[0].innerHTML = view.map(function (c) {
      var ed = canEdit(c), d = days(c), ma = esc(c.ma), cls = (isClosed(c) ? 'closed' : '') + (S.rowErr[c.ma] ? ' rowerr' : '');
      var kho, tt, note, tg, tuan;
      if (ed) {
        kho = '<select data-ma="' + ma + '" data-f="kho" class="' + (KHO_CLS[c.kho] || '') + '">' + opts(S.data.config.kho_list, c.kho, '') + '</select>';
        var stList = isClosed(c) && S.user.role !== 'admin' ? ST_CLOSED : ST_ALL;
        tt = '<select data-ma="' + ma + '" data-f="trang_thai" class="' + (ST_CLS[c.trang_thai] || '') + '">' + opts(stList, c.trang_thai) + '</select>';
        note = '<input class="note" data-ma="' + ma + '" data-f="ghi_chu" value="' + esc(c.ghi_chu) + '">';
        tg = '<input class="tg" data-ma="' + ma + '" data-f="thoi_gian_tra" value="' + esc(c.thoi_gian_tra) + '">';
        var wl = weeks.indexOf(c.tuan) < 0 ? [c.tuan].concat(weeks) : weeks;
        tuan = '<select data-ma="' + ma + '" data-f="tuan">' + opts(wl.map(function (w) { return { v: w, t: P.fmtWeek(w) }; }), c.tuan) + '</select>';
      } else {
        kho = c.kho ? '<span class="badge ' + (KHO_CLS[c.kho] || '') + '">' + esc(c.kho) + '</span>' : '';
        tt = '<span class="badge ' + (ST_CLS[c.trang_thai] || '') + '">' + esc(c.trang_thai) + '</span>';
        note = esc(c.ghi_chu); tg = esc(c.thoi_gian_tra); tuan = esc(P.fmtWeek(c.tuan));
      }
      return '<tr class="' + cls + '"' + (S.rowErr[c.ma] ? ' title="' + esc(S.rowErr[c.ma]) + '"' : '') + '>' +
        (auth ? '<td>' + (ed ? '<input type="checkbox" data-sel="' + ma + '"' + (S.sel[c.ma] ? ' checked' : '') + '>' : '') + '</td>' : '') +
        '<td>' + tuan + '</td><td>' + esc(c.san) + '</td><td>' + esc(c.gian) + '</td><td class="ma">' + ma + '</td><td>' + esc(c.loai_tep) +
        '</td><td class="sp">' + esc(c.ten_sp) + '</td><td>' + esc(c.phan_loai) + '</td><td>' + esc(c.ma_don_hang) + '</td><td>' + esc(c.dvvc) +
        '</td><td>' + kho + '</td><td>' + tg + '</td><td>' + tt + '</td><td>' + note + '</td><td>' + esc(own[c.gian] || '') +
        '</td><td class="' + (d !== '' && d >= 7 ? 'ton7' : '') + '">' + esc(d) + '</td></tr>';
    }).join('') || '<tr><td colspan="16" class="muted">Không có đơn nào</td></tr>';
    renderBulk();
  }

  function renderBulk() {
    var n = Object.keys(S.sel).length;
    $('bulk').hidden = !S.user || !n;
    $('bulkCount').textContent = 'Đã chọn ' + n + ' đơn:';
  }

  function saveItems(items) {
    var closing = items.some(function (it) {
      var c = findCase(it.ma);
      return it.fields.trang_thai && ST_CLOSED.indexOf(it.fields.trang_thai) >= 0 && c && c.trang_thai !== it.fields.trang_thai;
    });
    if (closing && !confirm(CONFIRM_CLOSE)) { render(); return Promise.resolve(); }
    msg('Đang lưu...', 'info');
    return api('update_cases', { items: items }).then(function (j) {
      S.rowErr = {};
      (j.errors || []).forEach(function (e) { S.rowErr[e.ma] = e.message; });
      var errs = (j.errors || []).map(function (e) { return e.ma + ': ' + e.message; });
      msg('Đã lưu ' + j.updated + ' đơn' + (errs.length ? '. Lỗi ' + errs.length + ' đơn:\n' + errs.join('\n') : ''), errs.length ? 'err' : 'ok');
      return refresh(true);
    }).catch(function (e) { msg('Lưu thất bại: ' + errText(e), 'err'); render(); });
  }
  function findCase(ma) { return S.data.cases.filter(function (c) { return c.ma === ma; })[0]; }

  // ---------- Tải file ----------
  function readWb(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader(), isCsv = /\.csv$/i.test(file.name);
      r.onload = function (e) {
        try { res(isCsv ? XLSX.read(e.target.result, { type: 'string', raw: true }) : XLSX.read(e.target.result, { type: 'array' })); }
        catch (err) { rej(err); }
      };
      r.onerror = rej;
      isCsv ? r.readAsText(file, 'UTF-8') : r.readAsArrayBuffer(file);
    });
  }
  function readAoa(file) {
    return readWb(file).then(function (wb) { return P.sheetToAoa(wb.Sheets[wb.SheetNames[0]], XLSX); });
  }

  function onKhoFiles(files) {
    $('khoResult').textContent = ''; $('khoSave').disabled = true; S.kho = null;
    $('khoInfo').textContent = 'Đang đọc...';
    Promise.all([].map.call(files, function (f) {
      return readAoa(f).then(function (a) { return { f: f, r: P.parseKho(a) }; }, function () { return { f: f, r: { error: 'Không đọc được file' } }; });
    })).then(function (list) {
      var codes = [], rows = 0, html = list.map(function (x) {
        if (x.r.error) return '<div class="err">' + esc(x.f.name) + ': ' + esc(x.r.error) + '</div>';
        codes = codes.concat(x.r.codes); rows += x.r.rows;
        return '<div>' + esc(x.f.name) + ': cột "' + esc(x.r.column) + '", ' + x.r.rows + ' dòng, ' + x.r.codes.length + ' mã hợp lệ' +
          (x.r.skipped ? ', bỏ ' + x.r.skipped + ' dòng không giống mã vận đơn' : '') + '</div>' + (x.r.warn ? '<div class="warn">' + esc(x.r.warn) + '</div>' : '');
      }).join('');
      var d = P.dedupe(codes);
      S.kho = d.unique;
      $('khoInfo').innerHTML = html + (codes.length ? '<p><b>Tổng: đọc ' + rows + ' dòng, ' + d.unique.length + ' mã, trùng trong file ' + d.dup + '</b></p>' : '');
      $('khoSave').disabled = !d.unique.length;
    });
  }

  function saveKho() {
    var codes = S.kho || [], sum = { added: 0, existed: 0, autoClosed: 0 }, i = 0;
    $('khoSave').disabled = true;
    function next() {
      if (i >= codes.length) {
        $('khoResult').innerHTML = '<p class="okc">Đã ghi: thêm mới ' + sum.added + ', đã có ' + sum.existed + ', tự đóng "Đã tìm thấy" ' + sum.autoClosed + ' đơn.</p>';
        msg('Đã ghi file kho', 'ok'); S.kho = null; refresh(true);
        return;
      }
      $('khoResult').textContent = 'Đang ghi lô ' + (i / CHUNK + 1) + '/' + Math.ceil(codes.length / CHUNK) + '...';
      api('ingest_kho', { codes: codes.slice(i, i + CHUNK) }).then(function (j) {
        sum.added += j.added; sum.existed += j.existed; sum.autoClosed += j.autoClosed; i += CHUNK; next();
      }).catch(function (e) {
        $('khoResult').innerHTML = '<p class="err">Lỗi: ' + esc(errText(e)) + (i ? ' (đã ghi ' + i + ' mã đầu)' : '') + '</p>';
        $('khoSave').disabled = false;
      });
    }
    next();
  }

  function onSanFiles(files) {
    S.san = []; $('sanList').innerHTML = '';
    [].forEach.call(files, function (f, idx) {
      var item = { f: f, id: 'san' + idx, done: false };
      S.san.push(item);
      var div = document.createElement('div');
      div.className = 'file'; div.id = item.id; div.textContent = f.name + ': đang đọc...';
      $('sanList').appendChild(div);
      readAoa(f).then(P.parseSan, function () { return { error: 'Không đọc được file' }; }).then(function (r) {
        item.r = r;
        if (!r.error) {
          var g = P.matchGian(f.name, myGians());
          item.gian = g ? g.ten : '';
        }
        renderSanItem(item);
      });
    });
  }

  function renderSanItem(it) {
    var div = $(it.id), r = it.r;
    if (r.error) { div.innerHTML = '<b>' + esc(it.f.name) + '</b><div class="err">' + esc(r.error) + ' — file không được ghi.</div>'; return; }
    var gians = myGians(), g = gians.filter(function (x) { return x.ten === it.gian; })[0];
    var mismatch = g && g.san !== r.san, skip = r.skipped.noMa + r.skipped.badMa;
    var weeks = P.recentWeeks(new Date(), 8).map(function (w) { return { v: w, t: 'Tuần ' + P.fmtWeek(w) }; });
    var ready = g && it.tuan && !mismatch && r.rows.length && !it.done && !it.busy;
    div.innerHTML = '<b>' + esc(it.f.name) + '</b>' +
      '<div>Nhận diện: <b>' + esc(r.san) + ' — ' + esc(r.loai_tep) + '</b>. ' + r.total + ' dòng, ' + r.rows.length + ' dòng có mã.' +
      (skip ? ' <span class="warn">Bỏ ' + skip + ' dòng: ' + [r.skipped.noMa ? r.skipped.noMa + ' không có mã vận đơn' : '', r.skipped.badMa ? r.skipped.badMa + ' mã không hợp lệ (có khoảng trắng/quá ngắn)' : ''].filter(Boolean).join(', ') + '</span>' : '') + '</div>' +
      '<div class="row"><label>Gian <select data-k="gian">' + opts(gians.map(function (x) { return { v: x.ten, t: x.ten }; }), it.gian, '— Chọn gian —') + '</select></label>' +
      '<label>Tuần <select data-k="tuan">' + opts(weeks, it.tuan || '', '— Chọn tuần —') + '</select></label>' +
      '<button data-a="preview"' + (ready ? '' : ' disabled') + '>Xem trước</button>' +
      '<button data-a="save" class="primary"' + (ready ? '' : ' disabled') + '>Ghi</button></div>' +
      (mismatch ? '<div class="err">File là ' + esc(r.san) + ' nhưng gian đã chọn thuộc ' + esc(g.san) + ' — không thể ghi.</div>' : '') +
      (r.rows.length > CHUNK ? '<div class="err">File quá ' + CHUNK + ' dòng, hãy tách nhỏ.</div>' : '') +
      '<div class="res">' + (it.res || '') + '</div>';
    div.querySelectorAll('select').forEach(function (s) { s.onchange = function () { it[s.dataset.k] = s.value; it.res = ''; renderSanItem(it); }; });
    div.querySelectorAll('button').forEach(function (b) { b.onclick = function () { sendSan(it, b.dataset.a === 'preview'); }; });
  }

  function sendSan(it, dry) {
    if (it.r.rows.length > CHUNK) return;
    it.busy = true; it.res = 'Đang xử lý...'; renderSanItem(it);
    api('ingest_san', { tuan: it.tuan, gian: it.gian, rows: it.r.rows, dry_run: dry }).then(function (j) {
      it.busy = false;
      it.res = '<div class="' + (dry ? '' : 'okc') + '">' + (dry ? 'Xem trước' : 'Đã ghi') + ': đọc ' + j.read + ', trùng trong file ' + j.dupInFile +
        ', đã có case ' + j.existedCase + ', đã đóng trước đó ' + j.existedClosed + ', khớp kho ' + j.matchedKho + ', <b>' + (dry ? 'sẽ tạo' : 'đã tạo') + ' ' + j.created + ' đơn lệch</b>' +
        (j.khoLastUpdate ? ' (kho cập nhật ' + esc(j.khoLastUpdate) + ')' : '') + '</div>';
      if (!dry) {
        it.done = true;
        if (S.san.every(function (x) { return x.done || (x.r && x.r.error); })) {
          msg('Đã ghi file sàn: tạo ' + j.created + ' đơn lệch', 'ok'); showView('list'); refresh(true); return;
        }
      }
      renderSanItem(it);
    }).catch(function (e) { it.busy = false; it.res = '<div class="err">Lỗi: ' + esc(errText(e)) + '</div>'; renderSanItem(it); });
  }

  function showView(v) {
    $('listView').hidden = v !== 'list'; $('uploadView').hidden = v !== 'upload';
    if (v === 'list') { $('khoFiles').value = ''; $('sanFiles').value = ''; $('khoInfo').innerHTML = ''; $('khoResult').innerHTML = ''; $('sanList').innerHTML = ''; $('khoSave').disabled = true; }
  }

  // ---------- Sự kiện ----------
  function bind() {
    $('btnRefresh').onclick = function () { refresh(); };
    $('btnLogin').onclick = function () { $('loginErr').textContent = ''; $('formLogin').reset(); $('dlgLogin').showModal(); };
    $('btnLogout').onclick = function () { setUser(null, ''); msg('Đã đăng xuất', 'ok'); };
    $('btnPin').onclick = function () { $('pinErr').textContent = ''; $('formPin').reset(); $('dlgPin').showModal(); };
    $('btnUpload').onclick = function () { showView('upload'); };
    $('btnBack').onclick = function () { showView('list'); };
    document.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = function () { b.closest('dialog').close(); }; });

    $('formLogin').onsubmit = function (e) {
      e.preventDefault();
      var f = e.target;
      api('login', { username: f.username.value.trim(), pin: f.pin.value }).then(function (j) {
        $('dlgLogin').close(); setUser(j.user, j.token); msg('Xin chào ' + j.user.name, 'ok');
      }).catch(function (x) { $('loginErr').textContent = errText(x); });
    };
    $('formPin').onsubmit = function (e) {
      e.preventDefault();
      var f = e.target;
      if (f.new_pin.value !== f.new_pin2.value) { $('pinErr').textContent = 'PIN mới nhập lại không khớp'; return; }
      api('change_pin', { old_pin: f.old_pin.value, new_pin: f.new_pin.value }).then(function () {
        $('dlgPin').close(); msg('Đã đổi PIN', 'ok');
      }).catch(function (x) { $('pinErr').textContent = errText(x); });
    };

    ['fGian', 'fKho', 'fTuan', 'fTt', 'fClosed'].forEach(function (id) { $(id).onchange = function () { S.page = 1; render(); }; });
    $('fSan').onchange = function () { S.page = 1; $('fGian').value = ''; fillFilters(); render(); };
    $('fMa').oninput = function () { S.page = 1; render(); };
    $('pPrev').onclick = function () { S.page--; render(); };
    $('pNext').onclick = function () { S.page++; render(); };

    var tb = $('tbl');
    tb.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'selAll') {
        filtered().slice((S.page - 1) * PAGE, S.page * PAGE).filter(canEdit).forEach(function (c) { t.checked ? S.sel[c.ma] = 1 : delete S.sel[c.ma]; });
        return render();
      }
      if (t.dataset.sel) { t.checked ? S.sel[t.dataset.sel] = 1 : delete S.sel[t.dataset.sel]; return renderBulk(); }
      if (t.dataset.f) { var fl = {}; fl[t.dataset.f] = t.value; saveItems([{ ma: t.dataset.ma, fields: fl }]); }
    });
    function bulk(field, sel) {
      var v = $(sel).value;
      if (!v) return msg('Hãy chọn giá trị cần đặt', 'err');
      if (v === '-') v = '';
      saveItems(Object.keys(S.sel).map(function (ma) { var fl = {}; fl[field] = v; return { ma: ma, fields: fl }; })).then(function () { S.sel = {}; render(); });
    }
    $('bulkKhoBtn').onclick = function () { bulk('kho', 'bulkKho'); };
    $('bulkTtBtn').onclick = function () { bulk('trang_thai', 'bulkTt'); };
    $('bulkClear').onclick = function () { S.sel = {}; render(); };

    $('khoFiles').onchange = function (e) { if (e.target.files.length) onKhoFiles(e.target.files); };
    $('khoSave').onclick = saveKho;
    $('sanFiles').onchange = function (e) { if (e.target.files.length) onSanFiles(e.target.files); };

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Date.now() - S.loadedAt > 30000 && !$('listView').hidden) refresh(true);
    });
  }

  bind();
  var tk = load('token');
  if (tk) {
    S.token = tk;
    api('me').then(function (j) { setUser(j.user, tk); }).catch(function () { });
  }
  refresh();
})();
