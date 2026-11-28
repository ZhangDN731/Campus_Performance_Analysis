/* ============================================================
   roster.js — 从成绩工作簿抽取「班级名单 + 班级→科目」映射
   供上传管理台（无成绩解析状态的独立管理宿主）分配默认班级使用。
   解析口径与各校区分析页一致：班级名 = 工作表名；科目取表头行并去掉满分括号。
   依赖：window.XLSX
   ============================================================ */
(function (global) {
  'use strict';

  var FULLMARK_RE = /[（(][^)）]*?(\d+(?:\.\d+)?)[^)）]*[)）]\s*$/;

  function trim(v) { return String(v == null ? '' : v).trim(); }

  /* 与校区页 normalizeSubjectKey 同口径：去掉尾部“（满分）”，保留科目原名 */
  function normSubject(orig) {
    var s = trim(orig);
    if (!s) return s;
    var base = s.replace(FULLMARK_RE, '').trim();
    return base || s;
  }

  /* 定位表头：姓名列、考号列、纵向表标记；兼容「考号在前」与「只有姓名」两种表 */
  function sheetLayout(mat) {
    var rows = mat || [];
    var row0 = rows[0] || [], row1 = rows[1] || [];
    var h00 = trim(row0[0]), h01 = trim(row1[0]);
    if (h00 === '学生' && h01 === '考试') {
      var h0 = row0.map(trim);
      return { vertical: true, nameCol: h0.indexOf('姓名'), noCol: h0.indexOf('考号'), startCol: 2 };
    }
    var r1 = row1.map(trim), r0 = row0.map(trim);
    var nameCol = r1.indexOf('姓名');
    if (nameCol < 0) nameCol = r0.indexOf('姓名');
    if (nameCol < 0) nameCol = 0;                 /* 旧表没有表头时第 1 列就是姓名 */
    return { vertical: false, nameCol: nameCol, noCol: r1.indexOf('考号') >= 0 ? r1.indexOf('考号') : r0.indexOf('考号'), startCol: nameCol + 1 };
  }

  /* 解析单个工作表，返回该班出现过的归一化科目（去重，保持表头顺序） */
  function sheetSubjects(mat, layout) {
    var rows = mat || [];
    if (!rows.length) return [];
    var row0 = rows[0] || [], row1 = rows[1] || [];
    layout = layout || sheetLayout(mat);
    var raw = [];
    if (layout.vertical) {
      raw = row0.slice(layout.startCol).map(trim).filter(Boolean);
    } else {
      for (var c = layout.startCol; c < row1.length; c++) {
        var s = trim(row1[c]) || trim(row0[c]);
        if (s) raw.push(s);
      }
    }
    var seen = {}, out = [];
    raw.forEach(function (r) {
      var k = normSubject(r);
      if (k && !seen[k]) { seen[k] = 1; out.push(k); }
    });
    return out;
  }

  /* 工作表里的学生名单（考号+姓名），从第一行数据开始 */
  function sheetStudents(mat, layout) {
    var out = [], seen = {};
    var rows = mat || [];
    var start = layout.vertical ? 1 : 2;
    for (var r = start; r < rows.length; r++) {
      var row = rows[r] || [];
      var name = trim(row[layout.nameCol]);
      if (!name) continue;
      var no = trim(row[layout.noCol]);
      var key = no + '|' + name;
      if (seen[key]) continue;
      seen[key] = 1;
      out.push({ no: no, name: name });
    }
    return out;
  }

  /* 解析工作簿 → { classes, map, students:{班级:[{no,name}]}, noMap:{班级:{考号:姓名}} } */
  function buildRoster(wb) {
    var classes = [], map = {}, students = {}, noMap = {};
    if (!wb || !wb.SheetNames) return { classes: classes, map: map, students: students, noMap: noMap };
    wb.SheetNames.forEach(function (name) {
      var cls = trim(name);
      if (!cls) return;
      var ws = wb.Sheets[name];
      if (!ws) return;
      var mat = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      var layout = sheetLayout(mat);
      var subs = sheetSubjects(mat, layout);
      if (!subs.length) return;
      var list = sheetStudents(mat, layout);
      if (!list.length) return;
      classes.push(cls);
      map[cls] = subs;
      students[cls] = list;
      var nm = {};
      list.forEach(function (s) { if (s.no) nm[s.no] = s.name; });
      noMap[cls] = nm;
    });
    return { classes: classes, map: map, students: students, noMap: noMap };
  }

  /* 按「考号+姓名」核对一张班级表：返回不一致明细，用于上传前拦截 */
  function checkSheet(mat, refStudents) {
    var layout = sheetLayout(mat);
    var rows = sheetStudents(mat, layout);
    var ref = {};
    (refStudents || []).forEach(function (s) { if (s.no) ref[s.no] = s.name; });
    var errs = [];
    var hasNoRef = Object.keys(ref).length > 0;
    if (!rows.length) errs.push({ row: 0, text: '没有识别到学生数据' });
    rows.forEach(function (s) {
      if (!hasNoRef) {
        /* 名单里还没有考号（旧表）：只按姓名核对 */
        if (!(refStudents || []).some(function (x) { return x.name === s.name; })) errs.push({ row: 0, text: s.name + '：姓名不在名单里' });
        return;
      }
      if (!s.no) { errs.push({ row: 0, text: '「' + s.name + '」缺少考号' }); return; }
      if (!ref[s.no]) { errs.push({ row: 0, text: s.no + ' ' + s.name + '：考号不在名单里' }); return; }
      if (ref[s.no] !== s.name) errs.push({ row: 0, text: s.no + '：考号对应「' + ref[s.no] + '」，表中写的是「' + s.name + '」' });
    });
    return { ok: errs.length === 0, errors: errs, layout: layout, students: rows };
  }

  /* 由带考号的成绩表生成考号记录单：[{name, rows:[{no,name}]}] */
  function buildKaohaoBook(wb) {
    var sheets = [];
    if (!wb || !wb.SheetNames) return sheets;
    wb.SheetNames.forEach(function (name) {
      var ws = wb.Sheets[name];
      if (!ws) return;
      var mat = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      var layout = sheetLayout(mat);
      var rows = sheetStudents(mat, layout).filter(function (s) { return s.no; });
      if (rows.length) sheets.push({ name: trim(name), rows: rows });
    });
    return sheets;
  }


  function rosterFromB64(b64) {
    if (!b64 || typeof global.XLSX === 'undefined') return null;
    try {
      var wb = global.XLSX.read(b64, { type: 'base64' });
      return buildRoster(wb);
    } catch (e) { console.error('roster b64 解析失败', e); return null; }
  }

  function rosterFromBytes(bytes) {
    if (!bytes || typeof global.XLSX === 'undefined') return null;
    try {
      var wb = global.XLSX.read(bytes, { type: 'array' });
      return buildRoster(wb);
    } catch (e) { console.error('roster 字节解析失败', e); return null; }
  }

  global.Roster = {
    normSubject: normSubject,
    sheetLayout: sheetLayout,
    buildRoster: buildRoster,
    checkSheet: checkSheet,
    buildKaohaoBook: buildKaohaoBook,
    rosterFromB64: rosterFromB64,
    rosterFromBytes: rosterFromBytes
  };
})(window);
