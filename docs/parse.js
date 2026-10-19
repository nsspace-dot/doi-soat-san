// Hàm thuần đọc file kho/sàn (rút từ tool cũ legacy/doi_soat_cu.html). Không đụng DOM.
(function (root) {
  var P = {};

  P.normalizeMa = function (v) { return v == null ? '' : String(v).replace(/[\s\u200b\ufeff]+/g, '').toUpperCase(); };

  // Mã vận đơn thật không có khoảng trắng bên trong và dài ≥ 3.
  P.isLikelyRealTrackingId = function (raw) {
    var s = String(raw == null ? '' : raw).trim();
    return s.length >= 3 && !/\s/.test(s);
  };

  // Chống mã 12-17 số bị đọc thành 1.23E+15.
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  P.cellToStr = function (cell) {
    if (!cell) return '';
    if (cell.v instanceof Date) {
      var d = new Date(Math.round(cell.v.getTime() / 1000) * 1000);
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }
    if (cell.t === 'n' || typeof cell.v === 'number') {
      if (cell.w && /^\d+$/.test(String(cell.w).trim())) return String(cell.w).trim();
      return String(Math.round(cell.v));
    }
    var v = String(cell.v === undefined ? '' : cell.v).trim();
    if (/^\d[\d.]*[eE][+\-]?\d+$/.test(v)) return String(Math.round(parseFloat(v)));
    return v;
  };

  // Sheet SheetJS → mảng 2 chiều chuỗi.
  P.sheetToAoa = function (ws, XLSX) {
    if (!ws || !ws['!ref']) return [];
    var rg = XLSX.utils.decode_range(ws['!ref']), out = [];
    for (var r = rg.s.r; r <= rg.e.r; r++) {
      var row = [];
      for (var c = rg.s.c; c <= rg.e.c; c++) row.push(P.cellToStr(ws[XLSX.utils.encode_cell({ r: r, c: c })]));
      out.push(row);
    }
    return out;
  };

  // Trả về undefined khi không thấy (cột A = 0 không bị coi là falsy). '=kw' là khớp tuyệt đối.
  P.findCol = function (hMap, kws, exclude) {
    var keys = Object.keys(hMap);
    for (var i = 0; i < kws.length; i++) {
      var kw = kws[i].toLowerCase(), exact = kw.charAt(0) === '=';
      if (exact) kw = kw.slice(1);
      for (var j = 0; j < keys.length; j++) {
        var k = String(keys[j]).toLowerCase();
        if (exact ? (k !== kw) : (k.indexOf(kw) < 0)) continue;
        if (exclude && exclude.some(function (x) { return k.indexOf(x) >= 0; })) continue;
        return hMap[keys[j]];
      }
    }
    return undefined;
  };

  // Dò dòng tiêu đề trong 10 dòng đầu; cột trùng tên chỉ lấy lần đầu.
  P.detectHeader = function (aoa, kws) {
    for (var hr = 0; hr <= Math.min(10, aoa.length - 1); hr++) {
      var m = {}, found = false, row = aoa[hr] || [];
      for (var c = 0; c < row.length; c++) {
        var v = String(row[c] || '').trim();
        if (!v) continue;
        if (!(v in m)) m[v] = c;
        var l = v.toLowerCase();
        for (var i = 0; i < kws.length && !found; i++) {
          var kw = kws[i], ex = kw.charAt(0) === '=';
          if (ex) kw = kw.slice(1);
          if (ex ? l === kw : l.indexOf(kw) >= 0) found = true;
        }
      }
      if (found) return { headerRow: hr, hMap: m };
    }
    return { headerRow: -1, hMap: {} };
  };

  var KHO_KWS = ['mã vận đơn', '=code', 'tracking id', 'vận đơn'];

  // File kho: đọc ĐÚNG cột mã, không quét mù (tránh cột Timestamp 13 số / Date).
  P.parseKho = function (aoa) {
    var h = P.detectHeader(aoa, KHO_KWS), idx = P.findCol(h.hMap, KHO_KWS);
    if (idx === undefined) return { error: 'Không thấy cột mã vận đơn (Mã vận đơn / Code / Tracking ID)' };
    var codes = [], rows = 0, skipped = 0, ts = 0;
    for (var r = h.headerRow + 1; r < aoa.length; r++) {
      var raw = (aoa[r] || [])[idx];
      if (raw == null || String(raw).trim() === '') continue;
      rows++;
      var m = P.normalizeMa(raw);
      if (!P.isLikelyRealTrackingId(raw) || m.length <= 3) { skipped++; continue; }
      if (/^\d{13}$/.test(m)) ts++;
      codes.push(m);
    }
    var warn = codes.length && ts / codes.length > 0.5 ? 'Nhiều mã 13 chữ số, có thể đang đọc nhầm cột Timestamp' : '';
    return { rows: rows, codes: codes, skipped: skipped, warn: warn, column: Object.keys(h.hMap).filter(function (k) { return h.hMap[k] === idx; })[0] };
  };

  P.dedupe = function (codes) {
    var seen = {}, u = [];
    codes.forEach(function (c) { if (!seen[c]) { seen[c] = 1; u.push(c); } });
    return { unique: u, dup: codes.length - u.length };
  };

  var SAN_KWS = ['tracking id', 'order id', 'mã vận đơn', 'mã đơn hàng', 'product name', 'tên sản phẩm'];

  // Nhận sàn + loại tệp theo tiêu đề cột.
  P.detectSan = function (aoa) {
    var h = P.detectHeader(aoa, SAN_KWS), f = function (k, ex) { return P.findCol(h.hMap, k, ex); };
    if (h.headerRow < 0) return { error: 'Không nhận diện được file: không thấy dòng tiêu đề' };
    var d = { headerRow: h.headerRow, hMap: h.hMap };
    if (f(['order id']) !== undefined || f(['tracking id']) !== undefined) {
      d.san = 'TikTok';
      var ret = f(['return logistics tracking', 'return tracking']);
      if (ret !== undefined) { d.loai_tep = 'Trả hàng'; d.ma = ret; }
      else { d.loai_tep = 'Giao không thành công'; d.ma = f(['tracking id', 'tracking'], ['return', 'trả hàng', 'hoàn']); }
      d.ma_don_hang = f(['order id']);
      d.ten_sp = f(['product name', 'tên sản phẩm']);
      d.phan_loai = f(['sku name', 'variation', 'tên phân loại', 'phân loại hàng', 'tên sku']);
      d.dvvc = f(['shipping provider', 'đơn vị vận chuyển'], ['return']);
    } else if (f(['mã đơn hàng']) !== undefined || f(['mã vận đơn']) !== undefined) {
      d.san = 'Shopee';
      var retS = f(['mã vận đơn trả hàng', 'mã vận đơn trả', 'return tracking'], ['giao']);
      if (retS !== undefined) {
        d.loai_tep = 'Trả hàng'; d.ma = retS;
        d.dvvc = f(['đơn vị vận chuyển trả hàng']);
        if (d.dvvc === undefined) d.dvvc = f(['đơn vị vận chuyển']);
      } else {
        d.loai_tep = 'Giao không thành công'; d.ma = f(['mã vận đơn', 'tracking'], ['kiện', 'trả']);
        d.dvvc = f(['đơn vị vận chuyển']);
      }
      d.ma_don_hang = f(['mã đơn hàng']);
      d.ten_sp = f(['tên sản phẩm', 'product name']);
      d.phan_loai = f(['tên phân loại', 'phân loại hàng', 'phân loại', 'sku phân loại']);
    } else return { error: 'Không nhận diện được sàn từ tiêu đề cột' };
    if (d.ma === undefined) return { error: 'File ' + d.san + ' (' + d.loai_tep + ') không có cột mã vận đơn' };
    return d;
  };

  var TIME_KWS = ['thời gian trả', 'return request time', 'time requested', 'request time', 'return created time', 'return time',
    'failed delivery time', 'delivery failed time', 'thời gian yêu cầu', 'ngày yêu cầu', 'ngày trả', 'requested time'];
  var LYDO_KWS = ['return reason', 'cancel reason', 'lý do trả', 'lý do giao không thành công', 'lý do hoàn', 'reason', 'lý do'];
  P.parseSan = function (aoa) {
    var d = P.detectSan(aoa);
    if (d.error) return d;
    d.ly_do = P.findCol(d.hMap, LYDO_KWS, ['ghi chú']);
    d.tg = P.findCol(d.hMap, TIME_KWS, ['update', 'cập nhật']);
    var rows = [], total = 0, noMa = 0, badMa = 0;
    var g = function (r, i) { return i === undefined ? '' : String(r[i] == null ? '' : r[i]).trim(); };
    for (var i = d.headerRow + 1; i < aoa.length; i++) {
      var r = aoa[i] || [];
      if (!r.some(function (x) { return String(x || '').trim(); })) continue;
      total++;
      var raw = g(r, d.ma);
      if (!raw) { noMa++; continue; }
      if (!P.isLikelyRealTrackingId(raw)) { badMa++; continue; }
      rows.push({ ma: P.normalizeMa(raw), loai_tep: d.loai_tep, ten_sp: g(r, d.ten_sp), phan_loai: g(r, d.phan_loai),
        ma_don_hang: g(r, d.ma_don_hang), dvvc: g(r, d.dvvc), ly_do_tra: g(r, d.ly_do).slice(0, 300), thoi_gian_tra: g(r, d.tg) });
    }
    return { san: d.san, loai_tep: d.loai_tep, total: total, rows: rows, skipped: { noMa: noMa, badMa: badMa } };
  };

  // Gợi ý gian theo tên file (giống backend Lib.gs): lọc theo sàn nếu có, alias dài thắng.
  function fold(s) {
    return ' ' + String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'D')
      .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() + ' ';
  }
  P.matchGian = function (name, gians) {
    var t = fold(name), best = null, bestLen = 0;
    var sans = gians.map(function (g) { return g.san; })
      .filter(function (s, i, a) { return a.indexOf(s) === i && t.indexOf(fold(s)) >= 0; });
    gians.forEach(function (g) {
      if (sans.length === 1 && g.san !== sans[0]) return;
      [g.ten, g.ten.slice(g.san.length)].concat(g.alias || []).forEach(function (a) {
        var f = fold(a);
        if (f.trim() && t.indexOf(f) >= 0 && f.length > bestLen) { best = g; bestLen = f.length; }
      });
    });
    return best;
  };

  // ---------- Ngày tháng ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  P.ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  P.parseDate = function (s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s || ''));
    return m ? new Date(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : null;
  };
  P.WEEK_ERR = 'Tuần phải dạng DD/MM - DD/MM, ví dụ 05/10 - 11/10';
  // Giống backend Lib.gs normalizeWeek.
  P.normalizeWeek = function (s, todayYmd) {
    var t = String(s == null ? '' : s).trim(), m = /^(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(t) ||
      /^(\d{1,2})\s*\/\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(t);
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
    return { tuan: pad(d1) + '/' + pad(m1) + ' - ' + pad(d2) + '/' + pad(m2), tuan_key: y1 + '-' + pad(m1) + '-' + pad(d1) };
  };
  // Khi gõ: tự chèn "/" và " - " nếu đang gõ toàn số hoặc trước đó đã đúng khuôn; tự gõ dấu thì để nguyên.
  function buildWeek(d) {
    d = d.slice(0, 8);
    var o = d.slice(0, 2);
    if (d.length > 2) o += '/' + d.slice(2, 4);
    if (d.length > 4) o += ' - ' + d.slice(4, 6);
    if (d.length > 6) o += '/' + d.slice(6, 8);
    return o;
  }
  P.formatWeekTyping = function (v) {
    var s = String(v || ''), prev = s.slice(0, -1), dg = function (x) { return x.replace(/\D/g, ''); };
    if (!/\d$/.test(s)) return s;
    return /^\d+$/.test(s) || prev === buildWeek(dg(prev)) ? buildWeek(dg(s)) : s;
  };
  P.daysOpen = function (created, closed, now) {
    var a = P.parseDate(created), b = closed ? P.parseDate(closed) : now;
    if (!a || !b) return '';
    var da = new Date(a.getFullYear(), a.getMonth(), a.getDate()), db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.max(0, Math.round((db - da) / 86400000));
  };
  P.splitCodes = function (text) {
    return String(text || '').split(/[\s,;]+/).map(P.normalizeMa).filter(Boolean);
  };


  // ---------- Nhập từ Sheet cũ ----------
  var fn = function (x) { return fold(x).trim(); };
  P.STATES = ['Mới', 'Chưa về kho', 'Chưa tìm thấy', 'Chờ kiểm tra', 'Đã tìm thấy', 'Đã khiếu nại', 'Xác nhận mất', 'Hỏng hóc / Lỗi'];

  // TSV dán từ Google Sheet/Excel: ô trong ngoặc kép có thể chứa tab, xuống dòng, "" là dấu ".
  P.parseTsv = function (text) {
    var t = String(text || '').replace(/\r\n?/g, '\n'), rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (q) {
        if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === '\t') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  };

  P.normalizeOldWeek = function (s, today) {
    var t = String(s == null ? '' : s).trim().replace(/^ngày\s*/i, '').replace(/\./g, '/');
    return P.normalizeWeek(t, today);
  };

  // Khớp tên gian Sheet cũ: chính xác (có/không tiền tố sàn, NS → Newshop) rồi alias, cuối cùng gần đúng.
  P.resolveGian = function (raw, defSan, gians) {
    var f = fn(raw);
    if (!f) return null;
    var by = function (name) { var x = fn(name); return gians.filter(function (g) { return fn(g.ten) === x; })[0] || null; };
    var g = by(raw);
    if (g) return g;
    var m = /^(TIKTOK|SHOPEE)\s+(.*)$/.exec(f), san = m ? (m[1] === 'TIKTOK' ? 'TikTok' : 'Shopee') : defSan, rest = m ? m[2] : f;
    if ((g = by(san + ' ' + rest))) return g;
    if (san === 'Shopee' && (g = by('Shopee ' + rest.replace(/^NS\s+/, 'NEWSHOP ')))) return g;
    var pool = gians.filter(function (x) { return x.san === san; });
    g = pool.filter(function (x) { return (x.alias || []).some(function (a) { return fn(a) === rest; }); })[0];
    return g || P.matchGian(san + ' ' + rest, pool);
  };

  P.inferLoai = function (lydo) {
    var f = fn(lydo);
    return /TU CHOI NHAN|KHONG THE LIEN LAC|KHONG LIEN LAC DUOC|KHONG LIEN HE DUOC/.test(f) ? 'Giao không thành công' : 'Trả hàng';
  };
  P.normLoai = function (raw) {
    var f = fn(raw);
    return /GIAO/.test(f) ? 'Giao không thành công' : /TRA/.test(f) ? 'Trả hàng' : null;
  };
  P.mapTrangThai = function (raw) {
    var f = fn(raw);
    if (!f) return { tt: 'Mới' };
    if (f === 'DA NHAN KHO') return { tt: 'Đã tìm thấy' };
    if (f === 'CHO KIEM TRA') return { tt: 'Chờ kiểm tra' };
    if (['HONG HOC LOI', 'HONG HOC', 'LOI', 'HONG'].indexOf(f) >= 0) return { tt: 'Hỏng hóc / Lỗi' };
    var s = P.STATES.filter(function (x) { return fn(x) === f; })[0];
    return s ? { tt: s } : { tt: 'Mới', odd: true };
  };
  P.normalizeKho = function (raw, list) {
    var t = String(raw == null ? '' : raw).trim();
    if (!t) return { kho: '' };
    if (/^53\s*[\/\-]\s*8/.test(t)) return { kho: 'VL' };
    var f = ' ' + fn(t) + ' ', k = (list || []).filter(function (x) { return f.indexOf(' ' + fn(x) + ' ') >= 0; })[0];
    return k ? { kho: k } : { kho: '', bad: true };
  };

  // o: {defaultSan, gians (đang bật, được phép), kho_list, today, manual: {tên gốc: tên gian}}
  P.parseOldSheet = function (aoa, o) {
    // Dòng tiêu đề: dòng đầu tiên (trong 20 dòng) có ô "Mã vận đơn"; các dòng tổng kết phía trên bị bỏ.
    var h = { headerRow: -1, hMap: {} }, ncol = 0;
    for (var hr = 0; hr < Math.min(20, aoa.length) && h.headerRow < 0; hr++) {
      if ((aoa[hr] || []).some(function (x) { return fn(x).indexOf('MA VAN DON') >= 0; })) {
        h.headerRow = hr;
        aoa[hr].forEach(function (x, ci) { var v = String(x == null ? '' : x).trim(); if (v && !(v in h.hMap)) h.hMap[v] = ci; if (v) ncol = ci + 1; });
      }
    }
    if (h.headerRow < 0) return { error: 'Không thấy dòng tiêu đề có ô "Mã vận đơn" trong 20 dòng đầu' };
    var f = function (k, ex) { return P.findCol(h.hMap, k, ex); };
    var c = {
      tuan: f(['tuần đối soát', 'ngày đối soát', 'tuần', '=ngày']), ma: f(['mã vận đơn']), gian: f(['gian hàng', '=gian']),
      loai: f(['loại tệp tin', 'loại tệp']), lydo: f(['lý do trả', 'lý do'], ['ghi chú']), ten_sp: f(['tên sản phẩm']),
      phan_loai: f(['phân loại']), tg: f(['thời gian trả']), tt: f(['trạng thái'], ['kho']), kho: f(['=kho', 'kho'], ['trạng thái']),
      ghi_chu: f(['ghi chú']), mdh: f(['mã đơn hàng']), dvvc: f(['đơn vị vận chuyển', 'đvvc'])
    };
    var out = { rows: [], noMa: 0, dup: 0, unmatched: {}, inferred: 0, odd: 0, badKho: 0, noKho: 0, hasLoai: c.loai !== undefined, errors: 0, joined: [], noSan: 0 };
    var seen = {}, lastTuan = '', manual = o.manual || {};
    var blank = function (a) { return !(a || []).some(function (x) { return String(x == null ? '' : x).trim(); }); };
    for (var i = h.headerRow + 1; i < aoa.length; i++) {
      if (blank(aoa[i])) continue;
      var raw = (aoa[i] || []).slice(), start = i;
      // Ô có xuống dòng bị mất ngoặc kép: nối với dòng sau cho đủ số cột.
      while (raw.length < ncol && i + 1 < aoa.length) {
        var nx = aoa[++i] || [];
        raw = raw.slice(0, -1).concat([String(raw[raw.length - 1] == null ? '' : raw[raw.length - 1]) + ' ' + String(nx[0] == null ? '' : nx[0])], nx.slice(1));
      }
      while (raw.length > ncol && String(raw[raw.length - 1] || '').trim() === '') raw.pop();
      if (i > start) out.joined.push((start + 1) + '–' + (i + 1));
      if (raw.length !== ncol) {
        out.errors++;
        out.rows.push({ line: start + 1, ma: P.normalizeMa(raw[c.ma]), gianRaw: '', trang_thai: 'Mới', loai_tep: '',
          error: 'Dòng ' + (start + 1) + (i > start ? '–' + (i + 1) : '') + ': số cột (' + raw.length + ') không khớp tiêu đề (' + ncol + ')' });
        continue;
      }
      var r = raw.map(function (x) { return String(x == null ? '' : x).trim(); });
      var g = function (k) { return c[k] === undefined ? '' : (r[c[k]] || ''); };
      if (g('tuan')) lastTuan = g('tuan');
      var ma = P.normalizeMa(g('ma'));
      if (!ma || !P.isLikelyRealTrackingId(g('ma'))) { out.noMa++; continue; }
      if (seen[ma]) { out.dup++; continue; }
      seen[ma] = 1;
      var row = { line: start + 1, ma: ma, gianRaw: g('gian'), ly_do_tra: g('lydo').slice(0, 300), ten_sp: g('ten_sp'), phan_loai: g('phan_loai'),
        ma_don_hang: g('mdh'), dvvc: g('dvvc'), thoi_gian_tra: g('tg'), ghi_chu: g('ghi_chu') };
      var w = P.normalizeOldWeek(lastTuan, o.today);
      row.tuan = w ? w.tuan : ''; row.tuan_raw = lastTuan;
      var lt = c.loai !== undefined ? P.normLoai(g('loai')) : null;
      if (lt) row.loai_tep = lt; else { row.loai_tep = P.inferLoai(row.ly_do_tra); row.inferred = true; out.inferred++; }
      var st = P.mapTrangThai(g('tt'));
      row.trang_thai = st.tt;
      if (st.odd) { out.odd++; row.ghi_chu = (row.ghi_chu ? row.ghi_chu + '; ' : '') + 'Sheet cũ: ' + g('tt'); }
      var kh = P.normalizeKho(g('kho'), o.kho_list);
      row.kho = kh.kho;
      if (kh.bad) out.badKho++;
      // defaultSan rỗng = "Tự nhận": bắt buộc có tiền tố TIKTOK/SHOPEE trong tên gian.
      var noSan = !o.defaultSan && !manual[row.gianRaw] && !/^(TIKTOK|SHOPEE)\s/.test(fn(row.gianRaw));
      var gg = noSan ? null : manual[row.gianRaw] ? o.gians.filter(function (x) { return x.ten === manual[row.gianRaw]; })[0] : P.resolveGian(row.gianRaw, o.defaultSan, o.gians);
      if (noSan) { out.noSan++; row.error = 'Dòng ' + row.line + ': không xác định được sàn (Gian hàng "' + (row.gianRaw || '(trống)') + '" thiếu tiền tố TIKTOK/SHOPEE)'; }
      else if (gg) { row.gian = gg.ten; if (!row.kho && gg.nhom !== 'Newtea') out.noKho++; }
      else { out.unmatched[row.gianRaw] = (out.unmatched[row.gianRaw] || 0) + 1; row.error = 'Chưa chọn gian cho "' + (row.gianRaw || '(trống)') + '"'; }
      if (!w) row.error = (row.error ? row.error + '; ' : '') + 'Tuần không hợp lệ: "' + lastTuan + '"';
      if (row.error) out.errors++;
      out.rows.push(row);
    }
    return out;
  };

  // ---------- Chuẩn hóa lý do trả theo bảng LYDO_MAP ----------
  var lydoIdx = null, lydoSrc = null, lk = function (v) { return fn(String(v).replace(/['\u2019`]/g, '')); };
  P.normLyDo = function (raw, map) {
    var t = String(raw == null ? '' : raw).trim();
    if (!t) return { ten: '', chuan: true };
    if (lydoSrc !== map) {
      lydoSrc = map; lydoIdx = {};
      Object.keys(map || {}).forEach(function (k) { [k].concat(map[k] || []).forEach(function (v) { lydoIdx[lk(v)] = k; }); });
    }
    var k = lydoIdx[lk(t)];
    return k ? { ten: k, chuan: true } : { ten: t.replace(/\s+/g, ' ').replace(/[.\s]+$/, ''), chuan: false };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = P;
  else root.Parse = P;
})(this);
