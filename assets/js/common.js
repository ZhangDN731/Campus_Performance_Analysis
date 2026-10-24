/* ============================================================
   common.js — 数据解析与计算核心（无页面依赖）
   全局数据：window.DANZHAO_DATA_2026（assets/data/data_2026.js）
   ============================================================ */

(function (global) {
  'use strict';

  /* 页面要求的科目横向排列顺序 */
  var SUBJECT_ORDER = ['总分', '语文', '数学', '英语', '物理', '化学', '生物',
    '历史', '地理', '政治', '美术', '信息', '职测总分'];

  /* 科目表头别名 → 标准名 */
  var SUBJECT_ALIAS = {
    '信息技术': '信息',
    '信息': '信息',
    '美术': '美术',
    '职测总分': '职测总分',
    '职业技能测试总分': '职测总分',
    '职业适应性测试总分': '职测总分',
    '总分': '总分',
    '总分合计': '总分'
  };

  var SUBJECT_RE = /(语文|数学|英语|物理|化学|生物|历史|地理|政治|美术|信息技术|信息|职测总分|职业技能测试总分|总分)/;

  /* ---------- 基础工具 ---------- */
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim().replace(/,/g, '');
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function trim(s) { return String(s == null ? '' : s).trim(); }

  /* 解析 "语文（100）" / "职测总分(350)" → {key, max} */
  function parseSubjectHeader(cell) {
    if (cell === null || cell === undefined) return null;
    var raw = String(cell).trim();
    var m = raw.match(SUBJECT_RE);
    if (!m) return null;
    var key = SUBJECT_ALIAS[m[1]] || m[1];
    var max = null;
    var mm = raw.match(/[（(](\d+(?:\.\d+)?)\s*[）)]?/);
    if (mm) max = Number(mm[1]);
    return { key: key, max: max };
  }

  /* 班级名 → 考试类 id（"2类1"→2, "10类"→10, "8类"→8） */
  function classToCategory(className) {
    var m = String(className).match(/\s*(\d+)\s*类/);
    if (!m) return null;
    var id = String(parseInt(m[1], 10));
    return global.DANZHAO_DATA_2026[id] ? id : null;
  }

  /* ---------- 成绩工作簿解析（输出每次考试，各自独立排名） ---------- */
  function parseGradeWorkbook(wb) {
    var classes = [];
    wb.SheetNames.forEach(function (sheetName) {
      var ws = wb.Sheets[sheetName];
      if (!ws) return;
      var mat = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      if (!mat.length) return;

      /* 识别表头行：第1行若直接含科目名，则无“考试名称行”，否则表头在第2行 */
      var headerRow = 1;
      var row0 = mat[0] || [];
      for (var c = 1; c < row0.length; c++) {
        if (row0[c] != null && SUBJECT_RE.test(String(row0[c]))) { headerRow = 0; break; }
      }
      var headRow = mat[headerRow] || [];

      /* 计算每一列的科目归属 */
      var colSubj = {};
      var lastHeaderCol = 0;
      for (var c2 = 1; c2 < headRow.length; c2++) {
        var p = parseSubjectHeader(headRow[c2]);
        if (p) { colSubj[c2] = p; lastHeaderCol = c2; }
      }
      if (!lastHeaderCol) return;

      /* 考试分组（按第1行标签，保留全部考试） */
      var groups = [];
      if (headerRow === 1) {
        for (var c3 = 1; c3 < row0.length; c3++) {
          if (row0[c3] != null && trim(row0[c3]) !== '') groups.push({ c: c3, label: trim(row0[c3]) });
        }
      }
      if (!groups.length) groups = [{ c: 1, label: '最新成绩' }];
      groups.sort(function (a, b) { return a.c - b.c; });
      groups.forEach(function (g, i) { g.end = (i + 1 < groups.length) ? groups[i + 1].c - 1 : lastHeaderCol; });

      /* 学生名单（全部考试并集，按首次出现顺序） */
      var roster = [];
      var rowByName = {};
      for (var r = headerRow + 1; r < mat.length; r++) {
        var row = mat[r] || [];
        var name = trim(row[0]);
        if (!name) continue;
        if (/均分|平均|人数|统计|合计|最高|最低|备注/.test(name)) continue;
        if (!(name in rowByName)) { roster.push(name); rowByName[name] = row; }
      }
      if (!roster.length) return;

      /* 逐次考试生成成绩与排名 */
      var exams = groups.map(function (g) {
        var students = roster.map(function (name) {
          var scores = {};
          for (var cc = g.c; cc <= g.end; cc++) {
            var sp = colSubj[cc];
            if (!sp) continue;
            var v = num(rowByName[name][cc]);
            if (!(sp.key in scores)) scores[sp.key] = { v: v, max: sp.max };
          }
          return { name: name, scores: scores };
        });

        var rankKey = students.some(function (s) { return s.scores['总分'] && s.scores['总分'].v != null; })
          ? '总分' : '职测总分';
        var ranked = students.filter(function (s) { return s.scores[rankKey] && s.scores[rankKey].v != null; });
        ranked.sort(function (a, b) { return b.scores[rankKey].v - a.scores[rankKey].v; });
        var n = ranked.length;
        ranked.forEach(function (s, i) {
          s.rank = (i > 0 && ranked[i - 1].scores[rankKey].v === s.scores[rankKey].v)
            ? ranked[i - 1].rank : i + 1;
          s.n = n;
        });
        students.forEach(function (s) { if (s.rank == null) { s.rank = null; s.n = n; } });

        var subjectKeys = SUBJECT_ORDER.filter(function (k) {
          return students.some(function (s) { return s.scores[k]; });
        });

        var maxes = students.map(function (s) { return s.scores['总分'] ? s.scores['总分'].max : null; })
          .filter(function (x) { return x != null; });
        var totalMax = maxes.length ? maxes.sort(function (a, b) { return b - a; })[0] : null;

        return {
          label: g.label,
          students: students,
          subjectKeys: subjectKeys,
          rankKey: rankKey,
          totalMax: totalMax,
          rankedCount: n
        };
      });

      classes.push({
        name: sheetName,
        cid: classToCategory(sheetName),
        exams: exams,
        roster: roster,
        examCount: exams.length
      });
    });
    return { classes: classes };
  }

  /* ---------- 目标院校工作簿解析 ---------- */
  function parseTargetWorkbook(wb) {
    var classes = {};
    var sheetNames = [];
    wb.SheetNames.forEach(function (sheetName) {
      var ws = wb.Sheets[sheetName];
      if (!ws) return;
      var mat = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      if (!mat.length) return;
      var startRow = 0;
      var first = mat[0] || [];
      var a = trim(first[0]), b = trim(first[1]);
      if (a.indexOf('姓名') >= 0 || b.indexOf('院校') >= 0 || b.indexOf('目标') >= 0) startRow = 1;
      var map = {};
      for (var r = startRow; r < mat.length; r++) {
        var row = mat[r] || [];
        var name = trim(row[0]);
        var target = trim(row[1]);
        if (name && target) map[name] = target;
      }
      classes[sheetName] = map;
      sheetNames.push(sheetName);
    });
    return { classes: classes, sheetNames: sheetNames };
  }

  /* ---------- 院校匹配 ---------- */
  function normKey(s) {
    return trim(s).replace(/\s+/g, '').replace(/[（）]/g, function (ch) {
      return ch === '（' ? '(' : ')';
    }).toLowerCase();
  }

  /* 在某类中按名称找院校（精确 → 包含），返回标准院校名 */
  function matchSchoolName(cid, name) {
    var c = global.DANZHAO_DATA_2026[cid];
    if (!c) return null;
    var names = {};
    c.majors.forEach(function (m) { names[m['院校名称']] = 1; });
    var key = normKey(name);
    var list = Object.keys(names);
    var exact = list.filter(function (n) { return normKey(n) === key; });
    if (exact.length) return exact[0];
    var inc = list.filter(function (n) {
      var k = normKey(n);
      return k.indexOf(key) >= 0 || key.indexOf(k) >= 0;
    });
    if (inc.length) {
      inc.sort(function (x, y) { return x.length - y.length; });
      return inc[0];
    }
    return null;
  }

  /* 全类别搜索院校 */
  function findSchoolEverywhere(name) {
    var ids = Object.keys(global.DANZHAO_DATA_2026);
    for (var i = 0; i < ids.length; i++) {
      var hit = matchSchoolName(ids[i], name);
      if (hit) return { cid: ids[i], name: hit };
    }
    return null;
  }

  /* ---------- 一分一档查询 ---------- */
  function totalPopulation(cid) {
    var yy = global.DANZHAO_DATA_2026[cid].yifenyidang;
    var max = 0;
    yy.forEach(function (r) { var n = num(r['累计人数']); if (n != null && n > max) max = n; });
    return max;
  }

  /* 分数 → 累计位次（找分数 ≤ score 的第一行） */
  function rankAtScore(cid, score) {
    if (score == null) return null;
    var yy = global.DANZHAO_DATA_2026[cid].yifenyidang;
    var rows = yy.map(function (r) {
      return { s: num(r['分数']), n: num(r['累计人数']) };
    }).filter(function (r) { return r.s != null && r.n != null; });
    rows.sort(function (a, b) { return b.s - a.s; });
    if (score >= rows[0].s) return Math.max(1, rows[0].n - 50);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].s <= score) return rows[i].n;
    }
    return rows[rows.length - 1].n;
  }

  /* 累计位次 → 分数（找累计人数 ≥ rank 的第一行） */
  function scoreAtRank(cid, rank) {
    var yy = global.DANZHAO_DATA_2026[cid].yifenyidang;
    var rows = yy.map(function (r) {
      return { s: num(r['分数']), n: num(r['累计人数']) };
    }).filter(function (r) { return r.s != null && r.n != null; });
    rows.sort(function (a, b) { return b.s - a.s; });
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].n >= rank) return rows[i].s;
    }
    return rows[rows.length - 1].s;
  }

  /* ---------- 院校信息聚合 ---------- */
  function buildSchoolInfo(cid, schoolName) {
    var c = global.DANZHAO_DATA_2026[cid];
    if (!c) return null;
    var stdName = matchSchoolName(cid, schoolName);
    if (!stdName) return null;

    var majorRows = c.majors.filter(function (m) { return m['院校名称'] === stdName; });
    var majors = majorRows.map(function (m) {
      return {
        major: trim(m['专业名称']),
        score: num(m['2026投档最低分']),
        plan: trim(m['计划数']),
        years: trim(m['学制']),
        fee: trim(m['学费(元/年)'])
      };
    });
    var scores = majors.map(function (m) { return m.score; }).filter(function (x) { return x != null; });
    var minScore = scores.length ? Math.min.apply(null, scores) : null;
    var maxScore = scores.length ? Math.max.apply(null, scores) : null;

    var sRow = c.schools.filter(function (s) { return s['院校名称'] === stdName; })[0] || null;
    var address = majorRows.length ? trim(majorRows[0]['院校地址']) : '';

    return {
      cid: cid,
      name: stdName,
      categoryName: c.fullName,
      region: sRow ? trim(sRow['所在地区']) : '',
      nature: sRow ? trim(sRow['办学性质']) : '',
      address: address,
      majors: majors,
      minScore: minScore,
      maxScore: maxScore,
      rank: minScore != null ? rankAtScore(cid, minScore) : null
    };
  }

  /* 给定目标院校名（可能不在本类），返回 {cid, info} */
  function resolveSchool(cid, name) {
    if (cid) {
      var info = buildSchoolInfo(cid, name);
      if (info) return info;
    }
    var ev = findSchoolEverywhere(name);
    if (ev) return buildSchoolInfo(ev.cid, ev.name);
    return null;
  }

  /* 每所院校的最低投档分清单（用于“可达院校”匹配） */
  function schoolMinScoreList(cid) {
    var c = global.DANZHAO_DATA_2026[cid];
    var map = {};
    c.majors.forEach(function (m) {
      var n = m['院校名称'];
      var s = num(m['2026投档最低分']);
      if (s == null) return;
      if (!(n in map) || s < map[n]) map[n] = s;
    });
    return Object.keys(map).map(function (n) { return { name: n, score: map[n] }; });
  }

  /* ---------- 学生升学投影 ----------
     输入：cid, classRank(班级排名), n(班级参与排名人数),
           totalScore(当前总分, 原始满分), totalMax(本次考试满分, 通常450或750)
     预估位次：采用“班级排名折合”模式（班级排名/n × 全省N）
     非750分制考试：分数先按比例折合到750再做分数位次参考 */
  function buildProjection(cid, classRank, n, totalScore, totalMax) {
    var N = totalPopulation(cid);
    var R_scale = (classRank && n) ? Math.ceil(classRank / n * N) : null;

    /* 分数换算到750分制（与录取线同口径） */
    var convertedScore = null;
    if (totalScore != null) {
      convertedScore = (!totalMax || totalMax === 750) ? totalScore
        : Math.round(totalScore * 750 / totalMax);
    }
    var R_score = convertedScore != null ? rankAtScore(cid, convertedScore) : null;

    /* 预估位次以班级排名折合为准 */
    var R = R_scale;
    var projectedScore = R != null ? scoreAtRank(cid, R) : null;

    var list = schoolMinScoreList(cid);
    var c = global.DANZHAO_DATA_2026[cid];

    /* 院校办学性质映射（公办 / 民办） */
    var natureMap = {};
    if (c) c.schools.forEach(function (s) { natureMap[s['院校名称']] = trim(s['办学性质']); });

    var reachable = list.filter(function (x) { return projectedScore != null && x.score <= projectedScore; });
    reachable.sort(function (a, b) { return b.score - a.score || a.name.localeCompare(b.name); });
    var best = reachable.length ? reachable[0] : null;
    var reachablePublic = reachable.some(function (x) { return natureMap[x.name] === '公办'; });
    var reachablePrivate = reachable.some(function (x) { return natureMap[x.name] === '民办'; });

    var all = list.slice().sort(function (a, b) { return a.score - b.score; });
    var lowest = all.length ? all[0] : null;

    return {
      N: N,
      R_scale: R_scale,
      R_score: R_score,
      R: R,
      convertedScore: convertedScore,
      projectedScore: projectedScore,
      reachablePublic: reachablePublic,
      reachablePrivate: reachablePrivate,
      school: best ? {
        name: best.name,
        minScore: best.score,
        rank: rankAtScore(cid, best.score),
        nature: natureMap[best.name] || ''
      } : null,
      lowest: lowest ? {
        name: lowest.name,
        minScore: lowest.score,
        rank: rankAtScore(cid, lowest.score),
        nature: natureMap[lowest.name] || ''
      } : null
    };
  }

  /* ---------- 导出 ---------- */
  global.AppCore = {
    SUBJECT_ORDER: SUBJECT_ORDER,
    num: num,
    trim: trim,
    classToCategory: classToCategory,
    parseSubjectHeader: parseSubjectHeader,
    parseGradeWorkbook: parseGradeWorkbook,
    parseTargetWorkbook: parseTargetWorkbook,
    matchSchoolName: matchSchoolName,
    findSchoolEverywhere: findSchoolEverywhere,
    rankAtScore: rankAtScore,
    scoreAtRank: scoreAtRank,
    totalPopulation: totalPopulation,
    buildSchoolInfo: buildSchoolInfo,
    resolveSchool: resolveSchool,
    schoolMinScoreList: schoolMinScoreList,
    buildProjection: buildProjection
  };

})(window);
