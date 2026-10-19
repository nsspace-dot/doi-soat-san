// Xuất Excel theo bộ lọc: hàm thuần, tự dựng file .xlsx (tiêu đề đậm, cố định dòng, AutoFilter, xuống dòng).
// Cần CFB của SheetJS (XLSX.CFB) để nén zip.
(function (root) {
  var E = {};
  E.HEADERS = ['Tuần đối soát', 'KHO', 'Mã vận đơn', 'Gian hàng TikTok', 'Loại tệp tin', 'Tên sản phẩm', 'Phân loại', 'Thời gian trả trên hệ thống'];
  var TEXT_COLS = [2], WRAP_COLS = [5], MAX_W = [16, 8, 30, 30, 24, 55, 30, 22];
  // Độ rộng cột theo nội dung (giới hạn trên mỗi cột; cột xuống dòng dừng ở mức tối đa).
  E.autoWidths = function (rows) {
    return E.HEADERS.map(function (h, ci) {
      var w = rows.reduce(function (m, r) {
        return Math.max(m, String(r[ci] == null ? '' : r[ci]).split('\n').reduce(function (a, l) { return Math.max(a, l.length); }, 0));
      }, h.length);
      return Math.min(MAX_W[ci], Math.max(6, w + 2));
    });
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  E.fmtNow = function (d) {
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  };

  // Chuẩn hóa thời gian về dd/mm/yyyy HH:mm (thêm :ss nếu nguồn có giây). Nhận: chuỗi ISO, dd/mm[/yyyy] + giờ
  // ở bất kỳ thứ tự nào, số ngày Excel. Không nhận ra thì trả nguyên văn gốc.
  E.fmtDateTime = function (v, fallbackYear) {
    var s = String(v == null ? '' : v).trim(), m;
    if (!s) return '';
    var out = function (y, mo, d, h, mi, se) {
      var dt = new Date(Date.UTC(+y, mo - 1, +d, +h || 0, +mi || 0, +se || 0));
      if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== +d || +h > 23 || +mi > 59) return s;
      return pad(+d) + '/' + pad(+mo) + '/' + y + ' ' + pad(+h || 0) + ':' + pad(+mi || 0) + (se != null && se !== '' ? ':' + pad(+se) : '');
    };
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s))) return out(m[1], +m[2], m[3], m[4], m[5], m[6]);
    if (/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) {
      var t = new Date(Math.round((+s - 25569) * 86400) * 1000), sec = t.getUTCSeconds();
      return out(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(), sec ? sec : null);
    }
    // "14:56:38, 14/10/2026", "14/10 14:56", "14.10.2026 14h56"...
    var dm = /(?:^|[^\d:])(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?(?![\d:])/.exec(' ' + s);
    if (dm) {
      var tm = /(\d{1,2})[:h](\d{2})(?::(\d{2}))?/.exec(s.replace(dm[0].trim(), ' '));
      var y = dm[3] ? (dm[3].length === 2 ? '20' + dm[3] : dm[3]) : String(fallbackYear || new Date().getFullYear());
      return out(y, +dm[2], dm[1], tm && tm[1], tm && tm[2], tm && tm[3]);
    }
    return s;
  };
  // Khóa sắp xếp yyyymmddHHMMSS (rỗng nếu không đọc được).
  E.dateKey = function (v, fallbackYear) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(E.fmtDateTime(v, fallbackYear));
    return m ? m[3] + m[2] + m[1] + m[4] + m[5] + (m[6] || '00') : '';
  };

  // 8 cột: tuan, kho, ma, gian, loai_tep, ten_sp, phan_loai, thoi_gian_tra.
  E.caseRows = function (cases) {
    return cases.map(function (c) {
      var y = /^(\d{4})/.exec(c.tuan_key || '');
      return [c.tuan, c.kho, c.ma, c.gian, c.loai_tep, c.ten_sp, c.phan_loai, E.fmtDateTime(c.thoi_gian_tra, y && y[1])];
    });
  };

  function fold(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, function (x) { return x === 'đ' ? 'd' : 'D'; });
  }
  function slug(s) { return fold(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  E.fileName = function (parts, now) {
    var p = parts.map(slug).filter(Boolean).join('_') || 'Tat-ca';
    return 'Doi-soat_' + p.slice(0, 80) + '_' + pad(now.getDate()) + '-' + pad(now.getMonth() + 1) + '-' + now.getFullYear() + '_' +
      pad(now.getHours()) + pad(now.getMinutes()) + '.xlsx';
  };

  // ---------- Dựng file xlsx ----------
  function x(s) {
    return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function colName(i) { var s = ''; i++; while (i) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
  // Style: 0 thường, 1 tiêu đề đậm, 2 chữ (@) căn trên, 3 xuống dòng căn trên, 4 căn trên
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEFE2BF"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function sheetXml(sh) {
    var rows = sh.rows, ncol = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1), last = colName(ncol - 1) + rows.length;
    var body = rows.map(function (r, ri) {
      return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) {
        var ref = colName(ci) + (ri + 1), st = ri === 0 && sh.header ? 1 : (sh.textCols || []).indexOf(ci) >= 0 ? 2 : (sh.wrapCols || []).indexOf(ci) >= 0 ? 3 : 4;
        if (typeof v === 'number' && isFinite(v) && !(ri === 0 && sh.header)) return '<c r="' + ref + '" s="' + st + '"><v>' + v + '</v></c>';
        if (v == null || v === '') return '<c r="' + ref + '" s="' + st + '"/>';
        return '<c r="' + ref + '" s="' + st + '" t="inlineStr"><is><t xml:space="preserve">' + x(v) + '</t></is></c>';
      }).join('') + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<dimension ref="A1:' + last + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"' + (sh.freeze ? '><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>' : '/>') + '</sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      (sh.widths ? '<cols>' + sh.widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' : '') +
      '<sheetData>' + body + '</sheetData>' +
      (sh.filter ? '<autoFilter ref="A1:' + last + '"/>' : '') +
      '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
  }

  // sheets: [{name, rows, header, freeze, filter, widths, textCols, wrapCols}]
  E.buildXlsx = function (sheets, CFB) {
    var z = CFB.utils.cfb_new(), enc = new TextEncoder(), add = function (p, s) { CFB.utils.cfb_add(z, p, enc.encode(s)); };
    var names = sheets.map(function (s) { return x(String(s.name).slice(0, 31)); });
    add('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>');
    add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    add('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + names.map(function (n, i) { return '<sheet name="' + n + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets>' +
      '<definedNames>' + sheets.map(function (s, i) {
        if (!s.filter) return '';
        var nc = s.rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
        return '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' + names[i].replace(/'/g, "''") + '\'!$A$1:$' + colName(nc - 1) + '$' + s.rows.length + '</definedName>';
      }).join('') + '</definedNames></workbook>');
    add('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    add('xl/styles.xml', STYLES);
    sheets.forEach(function (s, i) { add('xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s)); });
    return CFB.write(z, { fileType: 'zip', type: 'array', compression: true });
  };

  // Dựng 2 sheet "Đối soát" + "Bộ lọc". info: [[nhãn, giá trị], ...]
  E.workbook = function (rows, info, CFB) {
    return E.buildXlsx([
      { name: 'Đối soát', rows: [E.HEADERS].concat(rows), header: true, freeze: true, filter: true, widths: E.autoWidths(rows), textCols: TEXT_COLS, wrapCols: WRAP_COLS },
      { name: 'Bộ lọc', rows: [['Mục', 'Giá trị']].concat(info), header: true, widths: [24, 60], wrapCols: [1] }
    ], CFB);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = E;
  else root.Export = E;
})(this);
