(function () {
  'use strict';
  var P = window.Parse;
  // Danh sách trạng thái lấy từ config.statuses (backend); mặc định khi chưa tải.
  var ST_DEF = [['Mới', 0], ['Chưa về kho', 0], ['Chưa tìm thấy', 0], ['Chờ kiểm tra', 0], ['Đã tìm thấy', 1], ['Đã khiếu nại', 1], ['Xác nhận mất', 1], ['Hỏng hóc / Lỗi', 1]]
    .map(function (x) { return { ten: x[0], dong: !!x[1] }; });
  function statuses() { return (S.data && S.data.config.statuses) || ST_DEF; }
  function stAll() { return statuses().map(function (x) { return x.ten; }); }
  function stClosed() { return statuses().filter(function (x) { return x.dong; }).map(function (x) { return x.ten; }); }
  function stCls(t) { return ST_CLS[t] || 's-def'; }
  var ST_CLS = { 'Mới': 's-moi', 'Chưa về kho': 's-chuave', 'Chưa tìm thấy': 's-chuatim', 'Đã tìm thấy': 's-datim', 'Đã khiếu nại': 's-khieunai', 'Xác nhận mất': 's-mat', 'Chờ kiểm tra': 's-chokt', 'Hỏng hóc / Lỗi': 's-hong' };
  var KHO_CLS = { TSN: 'k-tsn', NVS: 'k-nvs', VL: 'k-vl' };
  var PAGE = 50, CHUNK = 20000, CONFIRM_CLOSE = 'Chi tiết đơn sẽ bị xóa sau 14 ngày. Tiếp tục?';
  var S = { data: null, token: '', user: null, page: 1, sel: {}, rowErr: {}, loadedAt: 0, kho: null, san: [], impManual: {}, impOverride: {}, view: 'compact' };

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
    document.querySelectorAll('.admin').forEach(function (el) { el.hidden = !user || user.role !== 'admin'; });
    $('btnLogin').hidden = !!user;
    $('userName').textContent = user ? user.name + ' (' + (user.role === 'admin' ? 'admin' : 'đối soát') + ')' : '';
    if (!user) { S.sel = {}; showView('list'); }
    if (why) msg(why + ' — đã chuyển về chế độ xem.', 'err');
    render();
  }
  function canEdit(c) { return !!S.user && (S.user.role === 'admin' || (S.user.gians || []).indexOf(c.gian) >= 0); }
  // Gian user được thao tác, chỉ gian đang bật (dùng cho ô chọn khi tải file / nhập).
  function myGians() {
    var g = ((S.data && S.data.config.gians) || []).filter(function (x) { return x.active !== false; });
    return S.user && S.user.role === 'admin' ? g : g.filter(function (x) { return (S.user ? S.user.gians : []).indexOf(x.ten) >= 0; });
  }
  function nhomList() { return (S.data && S.data.config.nhom_list) || []; }
  function gianMap() {
    var m = {};
    ((S.data && S.data.config.gians) || []).forEach(function (g) { m[g.ten] = g; });
    return m;
  }
  function nhomOf(ten) { var g = gianMap()[ten]; return g ? g.nhom || g.san : ''; }
  // Ô chọn gian chia optgroup theo nhóm.
  function gianSelect(gians, cur, blank, attrs) {
    var groups = nhomList().concat(gians.map(function (g) { return g.nhom; }).filter(function (n, i, a) { return n && nhomList().indexOf(n) < 0 && a.indexOf(n) === i; }));
    return '<select ' + (attrs || '') + '>' + (blank != null ? '<option value="">' + esc(blank) + '</option>' : '') + groups.map(function (n) {
      var gs = gians.filter(function (g) { return g.nhom === n; });
      return gs.length ? '<optgroup label="' + esc(n) + '">' + opts(gs.map(function (g) { return g.ten; }), cur) + '</optgroup>' : '';
    }).join('') + '</select>';
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
    $('fSan').innerHTML = opts(nhomList(), san, 'Tất cả');
    var gians = d.config.gians.filter(function (g) { return !san || g.nhom === san; }).map(function (g) { return g.ten; });
    $('fGian').innerHTML = opts(gians, keep('fGian'), 'Tất cả');
    $('fKho').innerHTML = opts(d.config.kho_list.concat([{ v: '-', t: '(Trống)' }]), keep('fKho'), 'Tất cả');
    var wk = {};
    cs.forEach(function (c) { if (c.tuan_key) wk[c.tuan_key] = c.tuan; });
    $('fTuan').innerHTML = opts(Object.keys(wk).sort().reverse().map(function (k) { return { v: k, t: wk[k] }; }), keep('fTuan'), 'Tất cả');
    $('fTt').innerHTML = opts(stAll(), keep('fTt'), 'Tất cả');
    var own = owners();
    $('fOwner').innerHTML = opts(d.config.gians.map(function (g) { return own[g.ten]; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort(), keep('fOwner'), 'Tất cả');
    $('bulkKho').innerHTML = opts(d.config.kho_list.concat([{ v: '-', t: '(Trống)' }]), '', '— KHO —');
    $('bulkTt').innerHTML = opts(stAll(), '', '— Trạng thái —');
    var km = d.khoMeta || {};
    $('khoMeta').textContent = km.lastUpdate ? 'Kho cập nhật lần cuối: ' + km.lastUpdate + ' bởi ' + km.by + ' (' + km.count + ' mã)' : 'Kho chưa có dữ liệu';
  }

  function owners() {
    var m = {};
    ((S.data && S.data.config.gians) || []).forEach(function (g) { m[g.ten] = g.owner_name || g.owner; });
    return m;
  }
  function isClosed(c) { return stClosed().indexOf(c.trang_thai) >= 0; }
  function days(c) { return P.daysOpen(c.created_at, isClosed(c) ? c.closed_at : '', new Date()); }

  function filterState() {
    return { san: $('fSan').value, gian: $('fGian').value, kho: $('fKho').value, tuan: $('fTuan').value, tt: $('fTt').value,
      owner: $('fOwner').value, closed: $('fClosed').checked, codes: P.splitCodes($('fMa').value) };
  }
  // Bộ lọc chung (không gồm Trạng thái / Hiện đơn đóng) — dùng cho cả bảng và 4 ô thống kê.
  function baseMatcher(f) {
    var own = owners(), nm = {}, set = {};
    S.data.config.gians.forEach(function (g) { nm[g.ten] = g.nhom; });
    f.codes.forEach(function (c) { set[c] = 1; });
    return function (c) {
      if (f.san && nm[c.gian] !== f.san) return false;
      if (f.gian && c.gian !== f.gian) return false;
      if (f.kho && (f.kho === '-' ? c.kho : c.kho !== f.kho)) return false;
      if (f.tuan && c.tuan_key !== f.tuan) return false;
      if (f.owner && own[c.gian] !== f.owner) return false;
      if (f.codes.length === 1 && String(c.ma).indexOf(f.codes[0]) < 0) return false;
      if (f.codes.length > 1 && !set[c.ma]) return false;
      return true;
    };
  }
  function filtered() {
    var f = filterState(), base = baseMatcher(f);
    return S.data.cases.filter(function (c) {
      if (!f.closed && isClosed(c) && f.tt !== c.trang_thai) return false;
      if (f.tt && c.trang_thai !== f.tt) return false;
      return base(c);
    }).sort(sortCases);
  }
  function sortCases(a, b) {
    return String(b.tuan_key || '').localeCompare(String(a.tuan_key || '')) || String(a.created_at).localeCompare(String(b.created_at));
  }
  function clearFilters() {
    ['fSan', 'fGian', 'fKho', 'fTuan', 'fTt', 'fOwner', 'fMa'].forEach(function (id) { $(id).value = ''; });
    S.page = 1; fillFilters(); render();
  }

  var COLS = ['Tuần', 'Sàn', 'Gian', 'Mã vận đơn', 'Loại tệp', 'Lý do trả', 'Tên sản phẩm', 'Phân loại', 'Mã đơn hàng', 'ĐVVC', 'KHO',
    'Thời gian trả trên hệ thống', 'Trạng thái', 'Ghi chú', 'Phụ trách', 'Số ngày tồn'];
  var COLS_C = [['Tuần / Gian', 12], ['Mã vận đơn', 12], ['Loại / Lý do trả', 13], ['Sản phẩm', 19], ['KHO', 6],
    ['Thời gian trả trên hệ thống', 8], ['Trạng thái', 11], ['Ghi chú', 10], ['Phụ trách / Tồn', 6]];
  function autoH(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; }
  function loadView() { try { return localStorage.getItem('viewMode') === 'full' ? 'full' : 'compact'; } catch (e) { return 'compact'; } }
  function setView(v) {
    S.view = v;
    try { localStorage.setItem('viewMode', v); } catch (e) { }
    render();
  }

  function render() {
    if (!S.data) return;
    var f = filterState(), base = baseMatcher(f);
    var open = S.data.cases.filter(function (c) { return !isClosed(c) && base(c); });
    var cnt = function (st) { return open.filter(function (c) { return c.trang_thai === st; }).length; };
    $('cChuaTim').textContent = cnt('Chưa tìm thấy'); $('cMoi').textContent = cnt('Mới'); $('cChuaVe').textContent = cnt('Chưa về kho'); $('cChoKt').textContent = cnt('Chờ kiểm tra');
    $('cTon').textContent = open.filter(function (c) { return days(c) >= 7; }).length;
    $('statNote').hidden = !(f.san || f.gian || f.kho || f.tuan || f.owner || f.codes.length);

    var compact = S.view !== 'full';
    $('btnView').textContent = compact ? 'Dạng bảng đầy đủ' : 'Dạng gọn';
    $('tbl').className = compact ? 'compact' : 'full';
    var rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (S.page > pages) S.page = pages;
    var view = rows.slice((S.page - 1) * PAGE, S.page * PAGE), own = owners(), auth = !!S.user;
    $('fCount').textContent = rows.length + ' đơn';
    $('btnExport').textContent = '⬇️ Tải theo bộ lọc (' + rows.length + ')';
    $('btnExport').disabled = !rows.length;
    $('pInfo').textContent = 'Trang ' + S.page + '/' + pages;
    $('pPrev').disabled = S.page <= 1; $('pNext').disabled = S.page >= pages;
    var editable = view.filter(canEdit), allSel = editable.length && editable.every(function (c) { return S.sel[c.ma]; });
    var chk = auth ? '<th><input type="checkbox" id="selAll"' + (allSel ? ' checked' : '') + '></th>' : '';
    $('tbl').querySelector('colgroup').innerHTML = compact ? (auth ? '<col style="width:3%">' : '') + COLS_C.map(function (c) { return '<col style="width:' + c[1] + '%">'; }).join('') : '';
    $('tbl').tHead.innerHTML = '<tr>' + chk + (compact ? COLS_C.map(function (c) { return c[0]; }) : COLS).map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>';
    var ncol = (compact ? COLS_C.length : COLS.length) + (auth ? 1 : 0);
    $('tbl').tBodies[0].innerHTML = view.map(function (c) {
      var ed = canEdit(c), d = days(c), ma = esc(c.ma), cls = (isClosed(c) ? 'closed' : '') + (S.rowErr[c.ma] ? ' rowerr' : '');
      var kho, tt, note, tg, tuan, lydo;
      if (ed) {
        kho = '<select data-ma="' + ma + '" data-f="kho" class="' + (KHO_CLS[c.kho] || '') + '">' + opts(S.data.config.kho_list, c.kho, '') + '</select>';
        var stList = isClosed(c) && S.user.role !== 'admin' ? stClosed() : stAll();
        tt = '<select data-ma="' + ma + '" data-f="trang_thai" class="' + stCls(c.trang_thai) + '">' + opts(stList, c.trang_thai) + '</select>';
        note = compact ? '<textarea class="note auto" rows="1" data-ma="' + ma + '" data-f="ghi_chu">' + esc(c.ghi_chu) + '</textarea>'
          : '<input class="note" data-ma="' + ma + '" data-f="ghi_chu" value="' + esc(c.ghi_chu) + '">';
        lydo = compact ? '<textarea class="note auto" rows="1" maxlength="300" data-ma="' + ma + '" data-f="ly_do_tra">' + esc(c.ly_do_tra) + '</textarea>'
          : '<input class="note" maxlength="300" data-ma="' + ma + '" data-f="ly_do_tra" value="' + esc(c.ly_do_tra) + '">';
        tg = '<input class="tg" data-ma="' + ma + '" data-f="thoi_gian_tra" value="' + esc(c.thoi_gian_tra) + '">';
        tuan = wkHtml('data-ma="' + ma + '" data-f="tuan"', c.tuan);
      } else {
        kho = c.kho ? '<span class="badge ' + (KHO_CLS[c.kho] || '') + '">' + esc(c.kho) + '</span>' : '';
        tt = '<span class="badge ' + stCls(c.trang_thai) + '">' + esc(c.trang_thai) + '</span>';
        note = esc(c.ghi_chu); tg = esc(c.thoi_gian_tra); tuan = esc(c.tuan); lydo = esc(c.ly_do_tra);
      }
      var nhom = esc(nhomOf(c.gian) || c.san), tonCls = d !== '' && d >= 7 ? 'ton7' : '';
      var cells = compact ? [
        '<div>' + tuan + '</div><div class="gian">' + esc(c.gian) + ' <span class="nhom">' + nhom + '</span></div>',
        '<div class="mabig">' + ma + '</div>' + ([c.ma_don_hang, c.dvvc].filter(Boolean).length ? '<div class="sub">' + [c.ma_don_hang ? '<span class="mono">' + esc(c.ma_don_hang) + '</span>' : '', esc(c.dvvc)].filter(Boolean).join(' · ') + '</div>' : ''),
        '<div><span class="loai">' + esc(c.loai_tep) + '</span></div><div>' + lydo + '</div>',
        '<div class="spname">' + esc(c.ten_sp) + '</div>' + (c.phan_loai ? '<div class="sub">' + esc(c.phan_loai) + '</div>' : ''),
        kho, tg, tt, note,
        '<div>' + esc(own[c.gian] || '') + '</div><div class="' + tonCls + '">' + (d !== '' ? esc(d) + ' ngày' : '') + '</div>'
      ] : [tuan, nhom, esc(c.gian), '<span class="mono">' + ma + '</span>', esc(c.loai_tep), lydo, '<div class="spname">' + esc(c.ten_sp) + '</div>', esc(c.phan_loai),
        '<span class="mono">' + esc(c.ma_don_hang) + '</span>', esc(c.dvvc), kho, tg, tt, note, esc(own[c.gian] || ''), '<span class="' + tonCls + '">' + esc(d) + '</span>'];
      return '<tr class="' + cls + '"' + (S.rowErr[c.ma] ? ' title="' + esc(S.rowErr[c.ma]) + '"' : '') + '>' +
        (auth ? '<td>' + (ed ? '<input type="checkbox" data-sel="' + ma + '"' + (S.sel[c.ma] ? ' checked' : '') + '>' : '') + '</td>' : '') +
        cells.map(function (x) { return '<td>' + x + '</td>'; }).join('') + '</tr>';
    }).join('') || '<tr><td colspan="' + ncol + '" class="muted">Không có đơn nào</td></tr>';
    $('tbl').querySelectorAll('textarea.auto').forEach(autoH);
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
      return it.fields.trang_thai && stClosed().indexOf(it.fields.trang_thai) >= 0 && c && c.trang_thai !== it.fields.trang_thai;
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

  // ---------- Ô nhập tuần "DD/MM - DD/MM" ----------
  function wkHtml(attrs, val) {
    return '<span class="wkbox"><input class="wk" type="text" inputmode="numeric" maxlength="13" placeholder="DD/MM - DD/MM" autocomplete="off" ' +
      attrs + ' value="' + esc(val || '') + '"><span class="wkerr"></span></span>';
  }
  function wkCheck(inp, final) {
    var v = inp.value.trim(), w = v ? P.normalizeWeek(v, P.ymd(new Date())) : null;
    if (final && w) inp.value = w.tuan;
    var bad = !!v && !w && (final || v.length >= 13), er = inp.parentNode.querySelector('.wkerr');
    inp.classList.toggle('bad', bad);
    if (er) er.textContent = bad ? P.WEEK_ERR : '';
    return w;
  }
  function wkTyping(inp) {
    var f = P.formatWeekTyping(inp.value);
    if (f !== inp.value) inp.value = f;
    return wkCheck(inp, false);
  }
  function wkBind(inp, cb) {
    inp.addEventListener('input', function () { cb(wkTyping(inp)); });
    inp.addEventListener('blur', function () { cb(wkCheck(inp, true)); });
  }

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
          var g = P.matchGian(f.name, myGians().filter(function (x) { return x.san === r.san; }));
          item.gian = g ? g.ten : '';
        }
        renderSanItem(item);
      });
    });
  }

  function renderSanItem(it) {
    var div = $(it.id), r = it.r;
    if (r.error) { div.innerHTML = '<b>' + esc(it.f.name) + '</b><div class="err">' + esc(r.error) + ' — file không được ghi.</div>'; return; }
    var gians = myGians().filter(function (x) { return x.san === r.san; }), g = gians.filter(function (x) { return x.ten === it.gian; })[0];
    var mismatch = g && g.san !== r.san, skip = r.skipped.noMa + r.skipped.badMa;
    var ready = g && it.wk && !mismatch && r.rows.length && !it.done && !it.busy;
    div.innerHTML = '<b>' + esc(it.f.name) + '</b>' +
      '<div>Nhận diện: <b>' + esc(r.san) + ' — ' + esc(r.loai_tep) + '</b>. ' + r.total + ' dòng, ' + r.rows.length + ' dòng có mã.' +
      (skip ? ' <span class="warn">Bỏ ' + skip + ' dòng: ' + [r.skipped.noMa ? r.skipped.noMa + ' không có mã vận đơn' : '', r.skipped.badMa ? r.skipped.badMa + ' mã không hợp lệ (có khoảng trắng/quá ngắn)' : ''].filter(Boolean).join(', ') + '</span>' : '') + '</div>' +
      '<div class="row"><label>Gian ' + gianSelect(gians, it.gian, '— Chọn gian ' + r.san + ' —', 'data-k="gian"') + '</label>' +
      (gians.length ? '' : '<span class="err">Bạn không có gian ' + esc(r.san) + ' nào đang bật.</span>') +
      '<label>Tuần ' + wkHtml('data-k="tuan"', it.tuan) + '</label>' +
      '<button data-a="preview"' + (ready ? '' : ' disabled') + '>Xem trước</button>' +
      '<button data-a="save" class="primary"' + (ready ? '' : ' disabled') + '>Ghi</button></div>' +
      (mismatch ? '<div class="err">File là ' + esc(r.san) + ' nhưng gian đã chọn thuộc ' + esc(g.san) + ' — không thể ghi.</div>' : '') +
      (r.rows.length > CHUNK ? '<div class="err">File quá ' + CHUNK + ' dòng, hãy tách nhỏ.</div>' : '') +
      '<div class="res">' + (it.res || '') + '</div>';
    div.querySelectorAll('select').forEach(function (s) { s.onchange = function () { it[s.dataset.k] = s.value; it.res = ''; renderSanItem(it); }; });
    var wi = div.querySelector('input.wk');
    if (it.tuan) wkCheck(wi, true);
    wkBind(wi, function (w) {
      it.tuan = wi.value; it.wk = w;
      var ok = g && w && !mismatch && r.rows.length && !it.done && !it.busy;
      div.querySelectorAll('button').forEach(function (b) { b.disabled = !ok; });
    });
    div.querySelectorAll('button').forEach(function (b) { b.onclick = function () { sendSan(it, b.dataset.a === 'preview'); }; });
  }

  function sendSan(it, dry) {
    if (it.r.rows.length > CHUNK) return;
    it.busy = true; it.res = 'Đang xử lý...'; renderSanItem(it);
    api('ingest_san', { tuan: it.wk.tuan, gian: it.gian, rows: it.r.rows, dry_run: dry }).then(function (j) {
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
    $('listView').hidden = v !== 'list'; $('uploadView').hidden = v !== 'upload'; $('staffView').hidden = v !== 'staff';
    $('gianView').hidden = v !== 'gian'; $('importView').hidden = v !== 'import';
    if (v === 'staff') loadStaff();
    if (v === 'gian') loadGian();
    if (v === 'import') { S.imp = null; $('impInfo').innerHTML = ''; $('impPreview').innerHTML = ''; $('impResult').innerHTML = ''; $('impRun').disabled = true; }
    if (v === 'list') { $('khoFiles').value = ''; $('sanFiles').value = ''; $('khoInfo').innerHTML = ''; $('khoResult').innerHTML = ''; $('sanList').innerHTML = ''; $('khoSave').disabled = true; }
  }

  // ---------- Nhân viên (admin) ----------
  function loadStaff() {
    var tb = $('tblStaff').tBodies[0];
    tb.innerHTML = '<tr><td colspan="7">Đang tải...</td></tr>';
    api('admin_list_users').then(function (j) {
      tb.innerHTML = j.users.map(function (u) {
        var me = u.username === S.user.username, un = esc(u.username);
        return '<tr class="' + (u.active ? '' : 'closed') + '"><td>' + esc(u.name) + '</td><td class="ma">' + un + '</td><td>' + (u.role === 'admin' ? 'Admin' : 'Đối soát') +
          '</td><td>' + esc((u.gians || []).join(', ')) + '</td><td><span class="badge ' + (u.active ? 's-datim' : 's-mat') + '">' + (u.active ? 'Đang bật' : 'Đã tắt') + '</span></td>' +
          '<td><input type="password" class="tg" data-pin="' + un + '" placeholder="PIN mới ≥ 6 ký tự" autocomplete="new-password"> <button data-reset="' + un + '">Đặt lại PIN</button></td>' +
          '<td>' + (me ? '<span class="muted">(bạn)</span>' : '<button data-toggle="' + un + '" data-active="' + (u.active ? 1 : 0) + '">' + (u.active ? 'Tắt tài khoản' : 'Bật tài khoản') + '</button>') + '</td></tr>';
      }).join('') || '<tr><td colspan="7">Chưa có nhân viên</td></tr>';
    }).catch(function (e) { tb.innerHTML = '<tr><td colspan="7" class="err">' + esc(errText(e)) + '</td></tr>'; });
  }
  function onStaffClick(e) {
    var b = e.target, un = b.dataset && (b.dataset.reset || b.dataset.toggle);
    if (!un) return;
    var body = { username: un };
    if (b.dataset.reset) {
      var inp = $('tblStaff').querySelector('input[data-pin="' + CSS.escape(un) + '"]'), pin = inp.value;
      if (pin.length < 6) return msg('PIN tối thiểu 6 ký tự', 'err');
      body.pin = pin;
    } else {
      body.active = b.dataset.active !== '1';
      if (!confirm((body.active ? 'Bật' : 'Tắt') + ' tài khoản ' + un + '?')) return;
    }
    b.disabled = true;
    api('admin_upsert_user', body).then(function () {
      msg(body.pin ? 'Đã đặt lại PIN cho ' + un : 'Đã ' + (body.active ? 'bật' : 'tắt') + ' tài khoản ' + un, 'ok'); loadStaff();
    }).catch(function (x) { b.disabled = false; msg(errText(x), 'err'); });
  }

  // ---------- Gian hàng (admin) ----------
  function nhomOpts(cur) {
    return opts(nhomList(), cur) + '<option value="__new">Nhóm mới...</option>';
  }
  function loadGian() {
    var tb = $('tblGian').tBodies[0];
    tb.innerHTML = '<tr><td colspan="6">Đang tải...</td></tr>';
    api('admin_list_users').then(function (j) {
      S.users = j.users;
      var uo = function (cur) { return opts(j.users.map(function (u) { return { v: u.username, t: u.name + ' (' + u.username + ')' }; }), cur); };
      $('gNhom').innerHTML = nhomOpts('Shopee'); $('gOwner').innerHTML = uo('');
      var gs = S.data.config.gians.slice().sort(function (a, b) { return nhomList().indexOf(a.nhom) - nhomList().indexOf(b.nhom) || a.ten.localeCompare(b.ten, 'vi'); });
      tb.innerHTML = gs.map(function (g) {
        var t = esc(g.ten), on = g.active !== false;
        return '<tr class="' + (on ? '' : 'closed') + '"><td>' + t + '</td><td>' + esc(g.san) + '</td>' +
          '<td><select data-g="' + t + '" data-k="nhom">' + nhomOpts(g.nhom) + '</select></td>' +
          '<td><select data-g="' + t + '" data-k="owner">' + uo(g.owner) + '</select></td>' +
          '<td><input class="note" data-g="' + t + '" data-k="alias" value="' + esc((g.alias || []).join(', ')) + '"></td>' +
          '<td><button data-g="' + t + '" data-k="active">' + (on ? 'Đang bật — Tắt' : 'Đã tắt — Bật') + '</button></td></tr>';
      }).join('');
    }).catch(function (e) { tb.innerHTML = '<tr><td colspan="6" class="err">' + esc(errText(e)) + '</td></tr>'; });
  }
  function upsertGian(body) {
    msg('Đang lưu gian...', 'info');
    return api('admin_upsert_gian', body).then(function (j) {
      msg((j.created ? 'Đã thêm gian ' : 'Đã lưu gian ') + j.gian.ten, 'ok');
      return refresh(true).then(function () { if (!$('gianView').hidden) loadGian(); });
    }).catch(function (e) { msg(errText(e), 'err'); loadGian(); });
  }
  function onGianEdit(e) {
    var t = e.target, ten = t.dataset && t.dataset.g, k = t.dataset && t.dataset.k;
    if (!ten || !k || (k === 'active') !== (e.type === 'click')) return;
    var g = gianMap()[ten], body = { ten: ten };
    if (k === 'nhom') {
      var n = t.value;
      if (n === '__new') { n = (prompt('Tên nhóm mới cho ' + ten + ':') || '').trim(); if (!n) return loadGian(); }
      body.nhom = n;
    } else if (k === 'owner') body.owner = t.value;
    else if (k === 'alias') body.alias = t.value.split(',');
    else { body.active = g.active === false; if (!confirm((body.active ? 'Bật' : 'Tắt') + ' gian ' + ten + '?')) return; }
    upsertGian(body);
  }
  function addGian(e) {
    e.preventDefault();
    var f = e.target, nhom = f.nhom.value === '__new' ? f.nhom_new.value.trim() : f.nhom.value;
    if (!nhom) return msg('Hãy nhập tên nhóm mới', 'err');
    upsertGian({ ten: f.ten.value.trim(), san: f.san.value, nhom: nhom, owner: f.owner.value, alias: f.alias.value.split(','), active: true })
      .then(function () { f.reset(); $('gNhomNewBox').hidden = true; });
  }

  // ---------- Nhập từ Sheet cũ ----------
  function parseImport() {
    var text = $('impText').value;
    $('impResult').innerHTML = '';
    if (!text.trim()) { $('impInfo').innerHTML = '<p class="err">Chưa dán dữ liệu.</p>'; return; }
    var gians = myGians(), r = P.parseOldSheet(P.parseTsv(text), { defaultSan: $('impSan').value, gians: gians, kho_list: S.data.config.kho_list, today: P.ymd(new Date()), manual: S.impManual });
    if (r.error) { $('impInfo').innerHTML = '<p class="err">' + esc(r.error) + '</p>'; $('impPreview').innerHTML = ''; $('impRun').disabled = true; return; }
    r.rows.forEach(function (row, i) { if (S.impOverride[row.ma]) { row.loai_tep = S.impOverride[row.ma]; row.inferred = false; } });
    S.imp = r;
    var ok = r.rows.filter(function (x) { return !x.error; }).length, warns = [];
    if (r.inferred) warns.push('Không có cột Loại tệp: đã suy ra loại từ Lý do trả cho ' + r.inferred + ' dòng (đổi được ở bảng dưới).');
    if (r.odd) warns.push(r.odd + ' dòng có trạng thái lạ → đặt "Mới" và ghi vào Ghi chú "Sheet cũ: ...".');
    if (r.badKho) warns.push(r.badKho + ' dòng có KHO không nhận ra → để trống.');
    if (r.noKho) warns.push(r.noKho + ' dòng (ngoài nhóm Newtea) chưa có KHO.');
    if (r.noSan) warns.push(r.noSan + ' dòng lỗi: không xác định được sàn (Gian hàng thiếu tiền tố TIKTOK/SHOPEE). Chọn Sàn Shopee/TikTok nếu dữ liệu chỉ có một sàn.');
    if (r.joined.length) warns.push('Đã nối ' + r.joined.length + ' dòng bị ngắt (ô có xuống dòng mất ngoặc kép), kiểm tra dòng: ' + r.joined.join(', ') + '.');
    if (r.dup) warns.push(r.dup + ' dòng trùng mã trong dữ liệu dán → bỏ.');
    var um = Object.keys(r.unmatched);
    $('impInfo').innerHTML = '<p><b>' + r.rows.length + ' dòng có mã: ' + ok + ' hợp lệ, ' + r.errors + ' lỗi; bỏ qua ' + r.noMa + ' dòng không có mã vận đơn.</b></p>' +
      warns.map(function (w) { return '<div class="warn">' + esc(w) + '</div>'; }).join('') +
      (um.length ? '<div class="box"><b>Gian chưa khớp — chọn gian cho từng tên (áp dụng mọi dòng cùng tên):</b>' + um.map(function (n) {
        return '<div class="row">"' + esc(n || '(trống)') + '" (' + r.unmatched[n] + ' dòng) → ' + gianSelect(gians, S.impManual[n] || '', '— Chọn gian —', 'data-um="' + esc(n) + '"') + '</div>';
      }).join('') + '</div>' : '');
    var show = r.rows.slice(0, 300);
    $('impPreview').innerHTML = '<div class="tableWrap"><table><thead><tr><th>Dòng</th><th>Tuần</th><th>Mã vận đơn</th><th>Gian (gốc → khớp)</th><th>Loại tệp</th><th>Lý do trả</th><th>Phân loại</th><th>KHO</th><th>Trạng thái</th><th>Ghi chú</th><th>Lỗi</th></tr></thead><tbody>' +
      show.map(function (x) {
        return '<tr class="' + (x.error ? 'rowerr' : '') + '"><td>' + x.line + '</td><td>' + esc(x.tuan || x.tuan_raw) + '</td><td class="ma">' + esc(x.ma) + '</td><td>' + esc(x.gianRaw) + ' → ' + esc(x.gian || '?') +
          '</td><td><select data-loai="' + esc(x.ma) + '"' + (x.inferred ? ' class="s-chuave"' : '') + '>' + opts(['Trả hàng', 'Giao không thành công'], x.loai_tep) + '</select></td><td class="sp">' + esc(x.ly_do_tra) +
          '</td><td>' + esc(x.phan_loai) + '</td><td>' + esc(x.kho) + '</td><td><span class="badge ' + stCls(x.trang_thai) + '">' + esc(x.trang_thai) + '</span></td><td>' + esc(x.ghi_chu) + '</td><td class="err">' + esc(x.error || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (r.rows.length > show.length ? '<p class="muted">Chỉ hiện ' + show.length + '/' + r.rows.length + ' dòng đầu.</p>' : '');
    $('impRun').disabled = !ok;
  }
  function onImpChange(e) {
    var t = e.target;
    if (t.dataset.loai) { S.impOverride[t.dataset.loai] = t.value; t.classList.remove('s-chuave'); }
    else if (t.dataset.um != null) {
      if (t.value) S.impManual[t.dataset.um] = t.value; else delete S.impManual[t.dataset.um];
      parseImport();
    }
  }
  function runImport() {
    var rows = (S.imp ? S.imp.rows : []).filter(function (x) { return !x.error; }), skipped = S.imp.errors + S.imp.noMa + S.imp.dup;
    var groups = {}, keys = [], sum = { created: 0, existed: 0, kho: 0 }, upErr = [];
    rows.forEach(function (x) {
      var k = x.gian + '|' + x.tuan + '|' + x.loai_tep;
      if (!groups[k]) { groups[k] = []; keys.push(k); }
      groups[k].push(x);
    });
    $('impRun').disabled = true;
    var step = function (i) {
      if (i >= keys.length) return Promise.resolve();
      var g = groups[keys[i]], p = keys[i].split('|');
      $('impResult').textContent = 'Đang nhập nhóm ' + (i + 1) + '/' + keys.length + ' (' + p[0] + ', ' + p[1] + ', ' + p[2] + ')...';
      return api('ingest_san', { gian: p[0], tuan: p[1], dry_run: false, rows: g.map(function (x) {
        return { ma: x.ma, loai_tep: x.loai_tep, ten_sp: x.ten_sp, phan_loai: x.phan_loai, ma_don_hang: x.ma_don_hang, dvvc: x.dvvc, ly_do_tra: x.ly_do_tra };
      }) }).then(function (j) { sum.created += j.created; sum.existed += j.existedCase + j.existedClosed; sum.kho += j.matchedKho; return step(i + 1); });
    };
    step(0).then(function () { return refresh(true); }).then(function () {
      var cur = {};
      S.data.cases.forEach(function (c) { cur[c.ma] = c; });
      var items = rows.filter(function (x) { return cur[x.ma]; }).map(function (x) {
        var c = cur[x.ma], f = {};
        if (x.kho && x.kho !== c.kho) f.kho = x.kho;
        if (x.trang_thai !== 'Mới' && x.trang_thai !== c.trang_thai) f.trang_thai = x.trang_thai;
        if (x.thoi_gian_tra && x.thoi_gian_tra !== c.thoi_gian_tra) f.thoi_gian_tra = x.thoi_gian_tra;
        if (x.ghi_chu && x.ghi_chu !== c.ghi_chu) f.ghi_chu = x.ghi_chu;
        if (x.ly_do_tra && x.ly_do_tra !== c.ly_do_tra) f.ly_do_tra = x.ly_do_tra;
        return { ma: x.ma, fields: f };
      }).filter(function (it) { return Object.keys(it.fields).length; });
      var up = function (i) {
        if (i >= items.length) return Promise.resolve();
        $('impResult').textContent = 'Đang cập nhật KHO/trạng thái/ghi chú ' + Math.min(i + 1000, items.length) + '/' + items.length + '...';
        return api('update_cases', { items: items.slice(i, i + 1000) }).then(function (j) { upErr = upErr.concat(j.errors || []); return up(i + 1000); });
      };
      return up(0).then(function () { return items.length; });
    }).then(function (nUp) {
      $('impResult').innerHTML = '<p class="okc"><b>Xong: đã nhập ' + sum.created + ' đơn mới, ' + sum.existed + ' đơn đã có sẵn, ' + sum.kho + ' mã đã có trong kho (không tạo đơn), bỏ qua ' + skipped + ' dòng.</b> Cập nhật thêm ' + nUp + ' đơn.</p>' +
        (upErr.length ? '<div class="err">Lỗi cập nhật ' + upErr.length + ' đơn:<br>' + upErr.slice(0, 50).map(function (x) { return esc(x.ma + ': ' + x.message); }).join('<br>') + '</div>' : '') +
        (S.imp.errors ? '<div class="warn">Dòng bị bỏ qua do lỗi: ' + S.imp.rows.filter(function (x) { return x.error; }).slice(0, 50).map(function (x) { return 'dòng ' + x.line + ' (' + esc(x.ma) + '): ' + esc(x.error); }).join('; ') + '</div>' : '');
      msg('Đã nhập từ Sheet cũ', 'ok');
    }).catch(function (e) {
      $('impResult').innerHTML = '<p class="err">Lỗi: ' + esc(errText(e)) + ' (đã nhập ' + sum.created + ' đơn trước khi lỗi; nhập lại an toàn)</p>';
      $('impRun').disabled = false;
    });
  }

  // ---------- Tải Excel theo bộ lọc ----------
  // Xuất đúng các dòng đang thấy (mọi trang, đúng thứ tự); có dòng tick thì hỏi tải phần đã chọn hay toàn bộ.
  function onExport() {
    var rows = filtered(), selMa = Object.keys(S.sel);
    if (!selMa.length) return doExport(rows, 'Tất cả ' + rows.length + ' dòng theo bộ lọc');
    var sel = S.data.cases.filter(function (c) { return S.sel[c.ma]; }).sort(sortCases);
    $('expSel').textContent = 'Tải ' + sel.length + ' dòng đã chọn';
    $('expAll').textContent = 'Tải tất cả ' + rows.length + ' dòng theo bộ lọc';
    $('expAll').disabled = !rows.length;
    $('expSel').onclick = function () { $('dlgExport').close(); doExport(sel, sel.length + ' dòng đã chọn'); };
    $('expAll').onclick = function () { $('dlgExport').close(); doExport(rows, 'Tất cả ' + rows.length + ' dòng theo bộ lọc'); };
    $('dlgExport').showModal();
  }
  function exportInfo(scope, n, now) {
    var f = filterState(), txt = function (id) { var o = $(id).selectedOptions[0]; return o && o.value ? o.textContent : 'Tất cả'; };
    return [['Sàn', txt('fSan')], ['Gian', txt('fGian')], ['KHO', txt('fKho')], ['Tuần', txt('fTuan')], ['Trạng thái', txt('fTt')],
      ['Phụ trách', txt('fOwner')], ['Mã vận đơn tìm', f.codes.join(' ') || '(không)'], ['Hiện đơn đã đóng', f.closed ? 'Có' : 'Không'],
      ['Phạm vi', scope], ['Người xuất', S.user ? S.user.name + ' (' + S.user.username + ')' : 'Khách (chưa đăng nhập)'],
      ['Thời điểm xuất', Export.fmtNow(now)], ['Tổng số dòng', n]];
  }
  function doExport(cases, scope) {
    if (!cases.length) return msg('Không có dòng nào để tải', 'err');
    try {
      var now = new Date(), own = owners();
      var rows = Export.caseRows(cases, { nhomOf: nhomOf, ownerOf: function (g) { return own[g] || ''; }, days: days });
      var data = Export.workbook(rows, exportInfo(scope, cases.length, now), XLSX.CFB);
      var parts = ['fGian', 'fSan', 'fTuan', 'fTt', 'fKho', 'fOwner'].map(function (id) { var o = $(id).selectedOptions[0]; return o && o.value ? o.textContent : ''; });
      if ($('fGian').value) parts[1] = '';
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = Export.fileName(scope.indexOf('đã chọn') > 0 ? ['Da-chon'].concat(parts) : parts, now);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      msg('Đã tải ' + cases.length + ' dòng: ' + a.download, 'ok');
    } catch (e) { msg('Không tạo được file Excel: ' + e.message, 'err'); }
  }

  // ---------- Sự kiện ----------
  function bind() {
    $('btnRefresh').onclick = function () { refresh(); };
    $('btnLogin').onclick = function () { $('loginErr').textContent = ''; $('formLogin').reset(); $('dlgLogin').showModal(); };
    $('btnLogout').onclick = function () { setUser(null, ''); msg('Đã đăng xuất', 'ok'); };
    $('btnPin').onclick = function () { $('pinErr').textContent = ''; $('formPin').reset(); $('dlgPin').showModal(); };
    $('btnUpload').onclick = function () { showView('upload'); };
    $('btnBack').onclick = function () { showView('list'); };
    $('btnStaff').onclick = function () { showView('staff'); };
    $('btnGian').onclick = function () { showView('gian'); };
    $('btnImport').onclick = function () { showView('import'); };
    document.querySelectorAll('[data-back]').forEach(function (b) { b.onclick = function () { showView('list'); }; });
    $('tblGian').addEventListener('change', onGianEdit);
    $('tblGian').addEventListener('click', onGianEdit);
    $('gNhom').onchange = function () { $('gNhomNewBox').hidden = $('gNhom').value !== '__new'; };
    $('formGian').onsubmit = addGian;
    $('impParse').onclick = function () { S.impManual = {}; S.impOverride = {}; parseImport(); };
    $('impRun').onclick = runImport;
    $('importView').addEventListener('change', onImpChange);
    $('btnBack2').onclick = function () { showView('list'); };
    $('tblStaff').addEventListener('click', onStaffClick);
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

    ['fGian', 'fKho', 'fTuan', 'fTt', 'fOwner', 'fClosed'].forEach(function (id) { $(id).onchange = function () { S.page = 1; render(); }; });
    $('fSan').onchange = function () { S.page = 1; $('fGian').value = ''; fillFilters(); render(); };
    $('fMa').oninput = function () { S.page = 1; render(); };
    $('pPrev').onclick = function () { S.page--; render(); };
    $('btnExport').onclick = onExport;
    $('btnView').onclick = function () { setView(S.view === 'full' ? 'compact' : 'full'); };
    $('btnClearF').onclick = clearFilters;
    $('pNext').onclick = function () { S.page++; render(); };

    var tb = $('tbl');
    tb.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'selAll') {
        filtered().slice((S.page - 1) * PAGE, S.page * PAGE).filter(canEdit).forEach(function (c) { t.checked ? S.sel[c.ma] = 1 : delete S.sel[c.ma]; });
        return render();
      }
      if (t.dataset.sel) { t.checked ? S.sel[t.dataset.sel] = 1 : delete S.sel[t.dataset.sel]; return renderBulk(); }
      if (t.dataset.f === 'tuan') {
        var w = wkCheck(t, true);
        if (w) saveItems([{ ma: t.dataset.ma, fields: { tuan: w.tuan } }]);
        return;
      }
      if (t.dataset.f) { var fl = {}; fl[t.dataset.f] = t.value; saveItems([{ ma: t.dataset.ma, fields: fl }]); }
    });
    tb.addEventListener('input', function (e) {
      if (e.target.classList.contains('wk')) wkTyping(e.target);
      if (e.target.classList.contains('auto')) autoH(e.target);
    });
    wkBind($('bulkTuan'), function (w) { $('bulkTuanBtn').disabled = !w; });
    $('bulkTuanBtn').onclick = function () {
      var w = wkCheck($('bulkTuan'), true);
      if (!w) return;
      saveItems(Object.keys(S.sel).map(function (ma) { return { ma: ma, fields: { tuan: w.tuan } }; })).then(function () { S.sel = {}; $('bulkTuan').value = ''; $('bulkTuanBtn').disabled = true; render(); });
    };
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

  S.view = loadView();
  bind();
  var tk = load('token');
  if (tk) {
    S.token = tk;
    api('me').then(function (j) { setUser(j.user, tk); }).catch(function () { });
  }
  refresh();
})();
