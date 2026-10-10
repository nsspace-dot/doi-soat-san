// Hàm thuần đọc file kho/sàn (rút từ tool cũ legacy/doi_soat_cu.html). Không đụng DOM.
(function (root) {
  var P = {};

  P.normalizeMa = function (v) { return v == null ? '' : String(v).replace(/[\s​﻿]+/g, '').toUpperCase(); };

  // Mã vận đơn thật không có khoảng trắng bên trong và dài ≥ 3.
  P.isLikelyRealTrackingId = function (raw) {
    var s = String(raw == null ? '' : raw).trim();
    return s.length >= 3 && !/\s/.test(s);
  };

  // Chống mã 12-17 số bị đọc thành 1.23E+15.
  P.cellToStr = function (cell) {
    if (!cell) return '';
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

  P.parseSan = function (aoa) {
    var d = P.detectSan(aoa);
    if (d.error) return d;
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
        ma_don_hang: g(r, d.ma_don_hang), dvvc: g(r, d.dvvc) });
    }
    return { san: d.san, loai_tep: d.loai_tep, total: total, rows: rows, skipped: { noMa: noMa, badMa: badMa } };
  };

  // Gợi ý gian theo tên file (giống backend Lib.gs): lọc theo sàn nếu có, alias dài thắng.
  function fold(s) {
    return ' ' + String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'D')
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
  P.mondayOf = function (d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
  P.recentWeeks = function (now, n) {
    var m = P.mondayOf(now), out = [];
    for (var i = 0; i < n; i++) { var d = new Date(m); d.setDate(m.getDate() - 7 * i); out.push(P.ymd(d)); }
    return out;
  };
  P.fmtWeek = function (tuan) {
    var d = P.parseDate(tuan);
    if (!d) return String(tuan || '');
    var e = new Date(d); e.setDate(d.getDate() + 6);
    return d.getDate() + '/' + (d.getMonth() + 1) + ' - ' + e.getDate() + '/' + (e.getMonth() + 1);
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

  if (typeof module !== 'undefined' && module.exports) module.exports = P;
  else root.Parse = P;
})(this);
