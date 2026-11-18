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

  /* 解析单个工作表，返回该班出现过的归一化科目（去重，保持表头顺序） */
  function sheetSubjects(mat) {
    var rows = mat || [];
    if (!rows.length) return [];
    var row0 = rows[0] || [], row1 = rows[1] || [];
    var h00 = trim(row0[0]), h01 = trim(row1[0]);
    var raw = [];
    if (h00 === '学生' && h01 === '考试') {
      /* 纵向表：表头在第 1 行，第 1 列学生、第 2 列考试，科目从第 3 列起 */
      raw = row0.slice(2).map(trim).filter(Boolean);
    } else {
      /* 横向表：科目在第 2 行，第 1 列姓名，科目从第 2 列起 */
      for (var c = 1; c < row1.length; c++) {
        var s = trim(row1[c]);
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

  /* 解析工作簿 → { classes:[班级...], map:{ 班级:[科目...] } } */
  function buildRoster(wb) {
    var classes = [], map = {};
    if (!wb || !wb.SheetNames) return { classes: classes, map: map };
    wb.SheetNames.forEach(function (name) {
      var cls = trim(name);
      if (!cls) return;
      var ws = wb.Sheets[name];
      if (!ws) return;
      var mat = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      var subs = sheetSubjects(mat);
      if (!subs.length) return;
      classes.push(cls);
      map[cls] = subs;
    });
    return { classes: classes, map: map };
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
    buildRoster: buildRoster,
    rosterFromB64: rosterFromB64,
    rosterFromBytes: rosterFromBytes
  };
})(window);
