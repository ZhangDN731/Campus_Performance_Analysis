/* ============================================================
   app.js — 单页主逻辑：班级总览 + 考试切换 + 学生详情弹窗
   ============================================================ */

(function () {
  'use strict';

  var state = { gradeData: null, targetData: null, gradesMeta: null, targetsMeta: null };
  var currentClass = null;   /* 班级对象 */
  var currentExamIdx = 0;    /* 当前考试下标 */

  var classChipsEl = document.getElementById('classChips');
  var examChipsEl = document.getElementById('examChips');
  var statBar = document.getElementById('statBar');
  var tableWrap = document.getElementById('tableWrap');
  var emptyTip = document.getElementById('emptyTip');
  var searchEl = document.getElementById('edSearch');
  var studentMask = document.getElementById('studentMask');
  var studentModal = document.getElementById('studentModal');

  /* ---------- 启动 ---------- */
  function boot() {
    return DataStore.loadAll().then(function (d) {
      state = d;
      renderMetas();
      renderClassChips();
    }).catch(function (e) {
      UI.toast('数据加载失败：' + (e.message || e), 'err');
      document.getElementById('dataStatus').textContent = '数据加载失败';
    });
  }

  function renderMetas() {
    var gm = state.gradesMeta;
    document.getElementById('metaGrades').textContent =
      gm ? gm.name + (gm.isDefault ? '' : '（上传于 ' + DataStore.fmtTime(gm.ts) + '）') : '未加载';
    var tm = state.targetsMeta;
    document.getElementById('metaTargets').textContent = tm
      ? tm.name + '（上传于 ' + DataStore.fmtTime(tm.ts) + '）' : '尚未上传';

    var classes = state.gradeData ? state.gradeData.classes : [];
    var totalStudents = classes.reduce(function (a, c) { return a + c.roster.length; }, 0);
    var examCount = classes.reduce(function (m, c) { return Math.max(m, c.examCount); }, 0);
    var statusEl = document.getElementById('dataStatus');
    if (classes.length) {
      var parts = [];
      parts.push('<b>' + UI.esc(gm ? gm.name.replace(/（内置数据）/, '') : '成绩表') + '</b>');
      parts.push(classes.length + ' 个班级');
      parts.push(examCount + ' 次考试');
      parts.push(totalStudents + ' 名学生');
      parts.push(tm ? '<span class="ds-ok">目标院校表已加载</span>' : '<span class="ds-warn">目标院校表尚未上传</span>');
      statusEl.innerHTML = '数据状态：' + parts.join(' · ');
    } else {
      statusEl.textContent = '数据状态：暂无成绩数据';
    }
  }

  /* ---------- 班级 / 考试胶囊 ---------- */
  function renderClassChips() {
    var classes = state.gradeData ? state.gradeData.classes : [];
    classChipsEl.innerHTML = '';
    if (!classes.length) {
      emptyTip.style.display = '';
      tableWrap.innerHTML = '';
      statBar.innerHTML = '';
      examChipsEl.innerHTML = '';
      return;
    }
    if (!currentClass || !classes.some(function (c) { return c.name === currentClass.name; })) {
      currentClass = classes[0];
      currentExamIdx = classes[0].exams.length - 1; /* 默认最新一次 */
    }
    classes.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (currentClass.name === c.name ? ' active' : '');
      b.textContent = c.name + '（' + c.roster.length + '）';
      b.addEventListener('click', function () {
        currentClass = c;
        currentExamIdx = c.exams.length - 1; /* 默认最新一次 */
        renderClassChips();
        renderExamChips();
        renderOverview();
      });
      classChipsEl.appendChild(b);
    });
    renderExamChips();
    renderOverview();
  }

  function renderExamChips() {
    examChipsEl.innerHTML = '';
    if (!currentClass) return;
    currentClass.exams.forEach(function (e, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip exam-chip' + (i === currentExamIdx ? ' active' : '');
      b.textContent = e.label + (e.totalMax && e.totalMax !== 750 ? '（' + e.totalMax + '分制）' : '');
      b.addEventListener('click', function () {
        currentExamIdx = i;
        renderExamChips();
        renderOverview();
      });
      examChipsEl.appendChild(b);
    });
  }

  function currentExam() {
    if (!currentClass) return null;
    return currentClass.exams[currentExamIdx] || null;
  }

  /* 目标班级表名可能带空格差异，做归一化匹配 */
  function getClassTargets(className) {
    var classes = state.targetData.classes;
    if (classes[className]) return classes[className];
    var norm = className.replace(/\s+/g, '');
    var names = Object.keys(classes);
    for (var i = 0; i < names.length; i++) {
      if (names[i].replace(/\s+/g, '') === norm) return classes[names[i]];
    }
    return null;
  }

  /* ---------- 单个学生一次考试的投影 ---------- */
  function buildRow(classObj, exam, student) {
    var total = student.scores['总分'] ? student.scores['总分'].v : null;
    var tmap = getClassTargets(classObj.name);
    var targetName = tmap ? (tmap[student.name] || null) : null;
    var targetInfo = targetName ? AppCore.resolveSchool(classObj.cid, targetName) : null;
    var proj = (classObj.cid && student.rank != null && total != null)
      ? AppCore.buildProjection(classObj.cid, student.rank, student.n, total, exam.totalMax) : null;
    return { total: total, targetName: targetName, targetInfo: targetInfo, proj: proj };
  }

  /* ---------- 统计条 ---------- */
  function renderStats(classObj, exam, rows) {
    var vals = exam.students
      .map(function (s) { return s.scores[exam.rankKey] && s.scores[exam.rankKey].v; })
      .filter(function (v) { return v != null; });
    var avg = vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length * 10) / 10 : 0;
    var targetCount = rows.filter(function (r) { return r.data.targetName; }).length;

    /* 达到公办 / 民办人数（可达院校中含公办即记为达到公办；仅能达到民办则记民办） */
    var publicCount = rows.filter(function (r) { return r.data.proj && r.data.proj.reachablePublic; }).length;
    var privateCount = rows.filter(function (r) {
      return r.data.proj && !r.data.proj.reachablePublic && r.data.proj.reachablePrivate;
    }).length;
    var denom = vals.length;
    function pct(x) { return denom ? Math.round(x / denom * 1000) / 10 + '%' : '—'; }

    var boxes = [
      { t: '参考人数 / 班级人数', v: vals.length + ' <small>/ ' + classObj.roster.length + '</small>', c: 'navy' },
      { t: '平均总分', v: avg, c: 'indigo' },
      { t: '已设目标人数', v: targetCount, c: 'violet' },
      { t: '达到公办人数', v: publicCount + ' <small>人</small>', c: 'green', sub: '达到率 ' + pct(publicCount) },
      { t: '达到民办人数', v: privateCount + ' <small>人</small>', c: 'amber', sub: '达到率 ' + pct(privateCount) }
    ];
    statBar.innerHTML = boxes.map(function (b) {
      return '<div class="stat-box ' + b.c + '"><span>' + b.t + '</span><b>' + b.v + '</b>' +
        (b.sub ? '<em>' + b.sub + '</em>' : '') + '</div>';
    }).join('');
  }

  /* ---------- 总览表格 ---------- */
  function renderOverview() {
    if (!currentClass) {
      tableWrap.innerHTML = ''; statBar.innerHTML = '';
      emptyTip.style.display = '';
      return;
    }
    emptyTip.style.display = 'none';
    var exam = currentExam();

    /* 按总分降序排序，同分按姓氏（姓名拼音）升序，无成绩者置底 */
    function rowTotal(s) {
      return s.scores[exam.rankKey] && s.scores[exam.rankKey].v != null ? s.scores[exam.rankKey].v : null;
    }
    function nameCmp(x, y) {
      return String(x).localeCompare(String(y), 'zh-CN', { numeric: true, sensitivity: 'base' });
    }
    var rows = exam.students.map(function (s) {
      return { student: s, data: buildRow(currentClass, exam, s) };
    }).sort(function (a, b) {
      var ta = rowTotal(a.student), tb = rowTotal(b.student);
      if (ta == null && tb == null) return nameCmp(a.student.name, b.student.name);
      if (ta == null) return 1;
      if (tb == null) return -1;
      if (tb !== ta) return tb - ta;
      return nameCmp(a.student.name, b.student.name);
    });

    renderStats(currentClass, exam, rows);

    var keys = exam.subjectKeys;
    var thead = '<thead><tr>' +
      '<th class="rank">排名</th><th class="name">姓名</th>' +
      keys.map(function (k) { return '<th>' + k + '</th>'; }).join('') +
      '<th>目标院校</th><th>目标分</th>' +
      '<th title="按本次班级排名等比例折合到全省的位次">预估位次</th>' +
      '<th>可达院校</th><th>可达分</th><th>可达位次</th>' +
      '</tr></thead>';

    var tbody = '<tbody>' + rows.map(function (r) {
      var s = r.student, d = r.data;
      var cells = keys.map(function (k) {
        var sc = s.scores[k];
        var v = sc ? sc.v : null;
        return '<td class="' + (k === '总分' ? 'total-cell' : '') + '">' +
          (v != null ? v : '<span class="muted-cell">—</span>') + '</td>';
      }).join('');

      var t = d.targetInfo;
      var targetCells = t
        ? '<td><span class="school-link-cell school-link" data-cid="' + t.cid + '" data-name="' + UI.esc(t.name) + '" title="' + UI.esc(t.name) + '">' + UI.esc(t.name) + '</span></td>' +
          '<td>' + (t.minScore != null ? t.minScore : '—') + '</td>'
        : '<td><span class="muted-cell">' + (d.targetName ? '未匹配' : '未设置') + '</span></td><td>—</td>';

      var p = d.proj;
      var rankCell = p && p.R_scale != null ? p.R_scale : '—';
      var reachCells = (p && p.school)
        ? '<td><span class="school-link-cell school-link" data-cid="' + currentClass.cid + '" data-name="' + UI.esc(p.school.name) + '" title="' + UI.esc(p.school.name) + '">' + UI.esc(p.school.name) + '</span></td>' +
          '<td>' + p.school.minScore + '</td><td>' + p.school.rank + '</td>'
        : '<td><span class="muted-cell">' + (p && p.lowest ? '未达线' : '—') + '</span></td><td>—</td><td>—</td>';

      return '<tr data-name="' + UI.esc(s.name) + '">' +
        '<td class="rank">' + (s.rank != null ? s.rank : '—') + '</td>' +
        '<td class="name"><span class="name-cell" data-name="' + UI.esc(s.name) + '">' + UI.esc(s.name) + '</span></td>' +
        cells + targetCells +
        '<td class="rank-cell">' + rankCell + '</td>' +
        reachCells + '</tr>';
    }).join('') + '</tbody>';

    tableWrap.innerHTML = '<table class="data">' + thead + tbody + '</table>';
    applySearch();
  }

  /* ---------- 姓名搜索 ---------- */
  function applySearch() {
    var kw = searchEl.value.trim();
    tableWrap.querySelectorAll('tbody tr').forEach(function (tr) {
      if (!kw) { tr.style.display = ''; return; }
      tr.style.display = tr.getAttribute('data-name').indexOf(kw) >= 0 ? '' : 'none';
    });
  }

  /* ============================================================
     学生详情弹窗
     ============================================================ */

  function scoreGrid(exam, student) {
    return exam.subjectKeys.map(function (k) {
      var s = student.scores[k];
      var v = s ? s.v : null;
      var max = s ? s.max : null;
      var cls = k === '总分' ? 'subj total' : 'subj';
      if (v == null) cls += ' empty';
      var pct = 0, barCls = '';
      if (v != null && max) {
        pct = Math.max(2, Math.min(100, v / max * 100));
        if (pct < 50) barCls = 'bad';
        else if (pct < 70) barCls = 'warn';
      }
      return '<div class="' + cls + '">' +
        '<div class="s-name">' + k + '</div>' +
        '<div class="s-val">' + (v != null ? v : '未考') +
          (v != null && max ? '<small>/' + max + '</small>' : '') + '</div>' +
        '<div class="s-bar"><i class="' + barCls + '" style="width:' + pct + '%"></i></div>' +
        '</div>';
    }).join('');
  }

  function examStats(exam) {
    var vals = exam.students
      .map(function (s) { return s.scores[exam.rankKey] && s.scores[exam.rankKey].v; })
      .filter(function (v) { return v != null; });
    return {
      avg: vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length * 10) / 10 : null,
      max: vals.length ? Math.max.apply(null, vals) : null
    };
  }

  /* 上一次考试简要对比 */
  function prevExamBlock(classObj, examIdx, student, curTotal) {
    var head = '<div class="modal-block-title"><span class="bar"></span>上一次考试对比</div>';
    if (examIdx <= 0) {
      return head + '<div class="mini-note">该考试为已记录的第一次考试，暂无上一次考试数据。</div>';
    }
    var prev = classObj.exams[examIdx - 1];
    var cur = classObj.exams[examIdx];
    var prevStu = prev.students.filter(function (x) { return x.name === student.name; })[0];
    if (!prevStu) {
      return head + '<div class="mini-note">上一次考试（' + UI.esc(prev.label) + '）未找到该学生的成绩记录。</div>';
    }
    var prevTotal = prevStu.scores['总分'] ? prevStu.scores['总分'].v : null;
    var prevRank = prevStu.rank;
    /* 分数变化统一折合到 750 分制，避免 450/750 混考导致虚高 */
    function to750(v, max) {
      if (v == null) return null;
      return (!max || max === 750) ? v : Math.round(v * 750 / max);
    }
    var scaleNote = (prev.totalMax !== cur.totalMax) ? '（均折合 750 分制）' : '';
    var scoreDelta = (to750(curTotal, cur.totalMax) != null && to750(prevTotal, prev.totalMax) != null)
      ? to750(curTotal, cur.totalMax) - to750(prevTotal, prev.totalMax) : null;
    var rankDelta = (student.rank != null && prevRank != null) ? prevRank - student.rank : null;

    function deltaBadge(delta, suffix, better) {
      if (delta == null) return '<span class="badge gray">—</span>';
      if (delta === 0) return '<span class="badge gray">持平</span>';
      var cls = better ? (delta > 0 ? 'green' : 'red') : (delta > 0 ? 'green' : 'red');
      var arrow = delta > 0 ? '↑' : '↓';
      return '<span class="badge ' + cls + '">' + arrow + ' ' + Math.abs(delta) + suffix + '</span>';
    }

    return head + '<div class="compare-grid">' +
      '<div class="cmp-item"><span>上一次考试</span><b>' + UI.esc(prev.label) + (prev.totalMax ? '（' + prev.totalMax + '分制）' : '') + '</b></div>' +
      '<div class="cmp-item"><span>上次总分</span><b>' + (prevTotal != null ? prevTotal : '—') + '</b></div>' +
      '<div class="cmp-item"><span>上次班级排名</span><b>' + (prevRank != null ? '第 ' + prevRank + ' 名' : '—') + '</b></div>' +
      '<div class="cmp-item"><span>本次总分变化' + scaleNote + '</span><b>' + (scoreDelta == null ? '—' : (scoreDelta > 0 ? '+' : '') + scoreDelta) + ' 分</b> ' + deltaBadge(scoreDelta, ' 分', true) + '</div>' +
      '<div class="cmp-item"><span>本次排名变化</span><b>' + (rankDelta == null ? '—' : (rankDelta > 0 ? '进步 ' : rankDelta < 0 ? '退步 ' : '') + (rankDelta === 0 ? '持平' : Math.abs(rankDelta) + ' 名')) + '</b> ' + deltaBadge(rankDelta, ' 名', true) + '</div>' +
      '</div>';
  }

  /* 目标院校块 */
  function targetBlock(classObj, student, convertedScore) {
    var head = '<div class="modal-block-title"><span class="bar"></span>我的目标院校</div>';
    var tmap = getClassTargets(classObj.name);
    var targetName = tmap ? (tmap[student.name] || null) : null;
    if (!targetName) {
      return head + '<div class="mini-note">尚未设置目标院校，请由老师在目标院校表中填写。</div>';
    }
    var info = AppCore.resolveSchool(classObj.cid, targetName);
    if (!info) {
      return head + '<div class="mini-note">未找到目标院校“' + UI.esc(targetName) + '”的信息，请核对名称。</div>';
    }
    var gap = (convertedScore != null && info.minScore != null) ? info.minScore - convertedScore : null;
    var gapText = gap == null ? '' :
      (gap > 0 ? '<span class="badge red">还差 ' + gap + ' 分</span>'
                : '<span class="badge green">已超过 ' + (-gap) + ' 分</span>');
    return head + '<div class="school-line">' +
      '<span class="sl-name school-link" data-cid="' + info.cid + '" data-name="' + UI.esc(info.name) + '">' + UI.esc(info.name) + '</span>' +
      gapText +
      '<span class="sl-nums">' +
        '<div class="num-chip indigo"><b>' + (info.minScore != null ? info.minScore : '—') + '</b><span>最低录取分</span></div>' +
        '<div class="num-chip"><b>' + (info.rank != null ? info.rank : '—') + '</b><span>累计位次</span></div>' +
      '</span></div>';
  }

  /* 可达院校块 */
  function reachableBlock(classObj, student, total, proj) {
    var head = '<div class="modal-block-title"><span class="bar"></span>按本次成绩预估可达到的院校</div>';
    if (!classObj.cid) return head + '<div class="mini-note">无法识别该班级对应的考试类。</div>';
    if (student.rank == null || total == null || !proj) {
      return head + '<div class="mini-note">本次考试缺少总分，暂无法推算。</div>';
    }
    var note = '<div class="gap-row">' +
      '本次预估位次按班级排名折合：<b>' + student.rank + ' / ' + student.n + ' × ' + proj.N + ' = 第 ' + proj.R_scale + ' 位</b>（约合 ' + proj.projectedScore + ' 分）；' +
      (proj.convertedScore != null && proj.convertedScore !== total
        ? '本次总分按比例折合 750 分制为 <b>' + proj.convertedScore + ' 分</b>，'
        : '') +
      '按折合分数查表位次约 <b>' + proj.R_score + '</b> 位（参考）。</div>';
    var body;
    if (proj.school) {
      body = '<div class="school-line">' +
        '<span class="sl-name school-link" data-cid="' + classObj.cid + '" data-name="' + UI.esc(proj.school.name) + '">' + UI.esc(proj.school.name) + '</span>' +
        '<span class="badge indigo">以最低录取分计可达到</span>' +
        '<span class="sl-nums">' +
          '<div class="num-chip violet"><b>' + proj.school.minScore + '</b><span>最低录取分</span></div>' +
          '<div class="num-chip"><b>' + proj.school.rank + '</b><span>累计位次</span></div>' +
        '</span></div>';
    } else {
      body = '<div class="mini-note">当前水平暂未达到该类院校最低投档线；该类投档线最低的院校为：' +
        '<span class="school-link" data-cid="' + classObj.cid + '" data-name="' + UI.esc(proj.lowest.name) + '">' + UI.esc(proj.lowest.name) + '</span>' +
        '（' + proj.lowest.minScore + ' 分 / 第 ' + proj.lowest.rank + ' 位），继续努力。</div>';
    }
    return head + note + body +
      '<div class="gap-row">点击院校名称可查看该学校的招生专业、学费、地址等详细信息。</div>';
  }

  /* 针对个人目标的简单意见和建议 */
  function adviceBlock(classObj, exam, examIdx, student, d, stats) {
    var head = '<div class="modal-block-title"><span class="bar"></span>学习建议</div>';
    var total = d.total;
    if (total == null) {
      return '<div class="modal-block advice-block">' + head +
        '<div class="mini-note">本次考试缺少该学生的总成绩记录，可能为缺考或未录入，建议核实后再做分析。</div></div>';
    }
    var proj = d.proj;
    var conv = proj ? proj.convertedScore : null;
    function to750(v) {
      if (v == null) return null;
      return (!exam.totalMax || exam.totalMax === 750) ? v : Math.round(v * 750 / exam.totalMax);
    }
    var avg750 = stats.avg != null ? to750(stats.avg) : null;

    var items = [];

    /* 1. 总体定位 + 趋势 */
    if (student.rank != null) {
      var line = '本次折合 750 分制约 <b>' + conv + ' 分</b>，班级第 <b>' + student.rank + ' 名</b>（参考 ' + student.n + ' 人）';
      if (avg750 != null) {
        var diff = Math.round((conv - avg750) * 10) / 10;
        line += diff >= 0 ? '，<b>高于</b>班级平均 ' + Math.abs(diff) + ' 分'
                          : '，<b>低于</b>班级平均 ' + Math.abs(diff) + ' 分';
      }
      if (examIdx > 0) {
        var prev = classObj.exams[examIdx - 1];
        var ps = prev.students.filter(function (x) { return x.name === student.name; })[0];
        if (ps && ps.rank != null) {
          var rd = ps.rank - student.rank;
          if (rd > 0) line += '；较上一次考试（' + UI.esc(prev.label) + '）<b>进步 ' + rd + ' 名</b>，继续保持';
          else if (rd < 0) line += '；较上一次考试（' + UI.esc(prev.label) + '）<b>退步 ' + Math.abs(rd) + ' 名</b>，要尽快找回状态';
          else line += '；排名与上一次考试持平，需寻求突破';
        }
      }
      line += '。';
      items.push(line);
    }

    /* 2. 目标院校差距 */
    var ti = d.targetInfo;
    if (ti && ti.minScore != null && conv != null) {
      var gap = ti.minScore - conv;
      if (gap > 0) {
        var rankGap = (proj && proj.R_scale != null && ti.rank != null) ? proj.R_scale - ti.rank : null;
        items.push('目标院校 <b>' + UI.esc(ti.name) + '</b> 2026 年最低录取分 <b>' + ti.minScore + ' 分</b>（累计位次约 ' +
          (ti.rank != null ? '第 <b>' + ti.rank + '</b> 位' : '—') + '），当前折合总分<b>还差 ' + gap + ' 分</b>' +
          (rankGap > 0 ? '，全省位次还需再提前约 <b>' + rankGap + '</b> 位' : '') +
          '。建议把目标分拆到每次周测，稳步缩小差距。');
      } else {
        items.push('当前折合总分已<b>超过</b>目标院校 <b>' + UI.esc(ti.name) + '</b> 最低录取线 <b>' + (-gap) + ' 分</b>，' +
          '目标基本达成；建议稳住状态，并在当前可达到的院校中再冲一所层次更高的公办校。');
      }
    } else if (!d.targetName) {
      items.push(proj && proj.R_scale != null
        ? '尚未设置目标院校。建议结合当前预估全省位次（约第 <b>' + proj.R_scale + '</b> 位），' +
          '按“冲一冲、稳一稳、保一保”尽快确定 1-2 所目标院校，让复习更有方向。'
        : '尚未设置目标院校，建议尽快结合自身成绩确定 1-2 所目标院校。');
    }

    /* 3. 薄弱科目 */
    var weak = exam.subjectKeys.filter(function (k) {
      return k !== '总分' && student.scores[k] && student.scores[k].v != null && student.scores[k].max;
    }).map(function (k) {
      var sc = student.scores[k];
      return { k: k, r: sc.v / sc.max, v: sc.v, max: sc.max };
    }).sort(function (a, b) { return a.r - b.r; });
    if (weak.length && weak[0].r < 0.7) {
      var w0 = weak[0];
      var line3 = '得分率最低的科目是 <b>' + w0.k + '（' + w0.v + '/' + w0.max + '，得分率 ' + Math.round(w0.r * 100) + '%）</b>';
      if (weak.length > 1 && weak[1].r < 0.7) {
        var w1 = weak[1];
        line3 += '，其次是 <b>' + w1.k + '（' + Math.round(w1.r * 100) + '%）</b>';
      }
      line3 += '，这是当前最值得优先补的短板；建议回归课本和基础题型、安排专项训练，每科提升 5-10 分就能明显前移全省位次。';
      items.push(line3);
    } else if (weak.length) {
      items.push('各科得分率均在 70% 以上，基础较均衡；建议在稳住优势科目的同时，主攻易错题与中难题，向更高分数段冲刺。');
    }

    /* 4. 院校层次 */
    if (proj) {
      if (proj.reachablePublic && proj.school) {
        items.push('按本次预估位次可达到<b>公办院校</b>（最高可冲 <b>' + UI.esc(proj.school.name) + '</b>，' +
          proj.school.minScore + ' 分），公办院校学费较低、办学有保障，建议优先考虑。');
      } else if (proj.reachablePrivate && proj.school) {
        items.push('按本次预估位次目前只能达到<b>民办院校</b>（如 ' + UI.esc(proj.school.name) + '，' +
          proj.school.minScore + ' 分），距离公办院校还需继续提分，重点突破上面的薄弱科目。');
      } else if (proj.lowest) {
        items.push('当前成绩尚未达到该类最低投档线（最低为 ' + UI.esc(proj.lowest.name) + ' ' +
          proj.lowest.minScore + ' 分），建议先夯实基础、保住基础分，再逐步提升。');
      }
    }

    var html = head + '<div class="advice-list">' + items.map(function (t) {
      return '<div class="advice-item"><span class="ai-dot"></span><div>' + t + '</div></div>';
    }).join('') + '</div>';
    return '<div class="modal-block advice-block">' + html + '</div>';
  }

  function openStudent(name) {
    var classObj = currentClass;
    var exam = currentExam();
    if (!classObj || !exam) return;
    var student = exam.students.filter(function (x) { return x.name === name; })[0];
    if (!student) return;

    var total = student.scores['总分'] ? student.scores['总分'].v : null;
    var stats = examStats(exam);
    var d = buildRow(classObj, exam, student);
    var proj = d.proj;
    var converted = proj ? proj.convertedScore : null;

    var scaleBadge = exam.totalMax && exam.totalMax !== 750
      ? '<span class="badge amber">本次为 ' + exam.totalMax + ' 分制，折合 750 分制约 ' + (converted != null ? converted : '—') + ' 分</span>'
      : '';

    var html = '' +
      '<div class="modal-head">' +
        '<div style="min-width:0">' +
          '<h3>' + UI.esc(student.name) + '</h3>' +
          '<div class="mh-sub">' +
            '<span class="badge indigo">' + UI.esc(classObj.name) + '</span>' +
            '<span class="badge gray">' + UI.esc(exam.label) + '</span>' +
            scaleBadge +
          '</div>' +
        '</div>' +
        '<button class="modal-close" data-student-close aria-label="关闭">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="rank-banner">' +
          '<div class="rb-num">' + (student.rank != null ? student.rank : '—') + '<small> 名</small></div>' +
          '<div class="rb-label"><strong>' + UI.esc(student.name) + '</strong><br>' +
            '班级排名 · 参考 ' + (student.n || 0) + ' 人</div>' +
          '<div class="rb-spacer"></div>' +
          '<div class="rank-stats">' +
            '<div class="rs-item"><b>' + (total != null ? total : '—') + '</b>本次总分</div>' +
            '<div class="rs-item"><b>' + (stats.avg != null ? stats.avg : '—') + '</b>班级平均</div>' +
            '<div class="rs-item"><b>' + (stats.max != null ? stats.max : '—') + '</b>班级最高</div>' +
            '<div class="rs-item hl"><b>' + (proj && proj.R_scale != null ? proj.R_scale : '—') + '</b>预估位次</div>' +
          '</div>' +
        '</div>' +
        '<div class="modal-block"><div class="modal-block-title"><span class="bar"></span>本次各科成绩' +
          '<span class="tag"><span class="badge gray">按 总分→语文→数学… 顺序</span></span></div>' +
          '<div class="score-grid">' + scoreGrid(exam, student) + '</div></div>' +
        '<div class="modal-block">' + prevExamBlock(classObj, currentExamIdx, student, total) + '</div>' +
        '<div class="modal-block">' + targetBlock(classObj, student, converted) + '</div>' +
        '<div class="modal-block">' + reachableBlock(classObj, student, total, proj) + '</div>' +
        adviceBlock(classObj, exam, currentExamIdx, student, d, stats) +
      '</div>';

    studentModal.innerHTML = html;
    studentMask.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeStudent() {
    studentMask.classList.remove('show');
    var uiMask = document.querySelector('.modal-mask.show');
    document.body.style.overflow = uiMask ? 'hidden' : '';
  }

  /* ---------- 事件 ---------- */
  /* 表格：姓名点击 → 学生弹窗；院校名点击 → 院校弹窗 */
  tableWrap.addEventListener('click', function (e) {
    var nameCell = e.target.closest('.name-cell');
    if (nameCell) { openStudent(nameCell.getAttribute('data-name')); return; }
    var sl = e.target.closest('.school-link');
    if (sl) { UI.openSchool(sl.getAttribute('data-cid'), sl.getAttribute('data-name')); }
  });

  /* 学生弹窗内部点击 */
  studentMask.addEventListener('click', function (e) {
    if (e.target === studentMask || e.target.hasAttribute('data-student-close') ||
      (e.target.closest && e.target.closest('[data-student-close]'))) {
      closeStudent();
      return;
    }
    var sl = e.target.closest('.school-link');
    if (sl) { UI.openSchool(sl.getAttribute('data-cid'), sl.getAttribute('data-name')); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    /* 院校弹窗最上层时由 ui.js 关闭 */
    var schoolMaskOpen = false;
    document.querySelectorAll('.modal-mask').forEach(function (m) {
      if (m !== studentMask && m.classList.contains('show')) schoolMaskOpen = true;
    });
    if (!schoolMaskOpen && studentMask.classList.contains('show')) closeStudent();
  });

  searchEl.addEventListener('input', applySearch);

  /* 数据管理面板 */
  function toggleData(show) {
    var panel = document.getElementById('dataPanel');
    var hidden = panel.style.display === 'none';
    var next = show != null ? show : hidden;
    panel.style.display = next ? '' : 'none';
    if (next) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  document.getElementById('btnDataTop').addEventListener('click', function () { toggleData(); });

  function handleFile(key, file) {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) { UI.toast('请选择 .xlsx 格式的文件', 'err'); return; }
    DataStore.saveUpload(key, file).then(function () {
      UI.toast('上传成功，正在重新解析数据', 'ok');
      currentClass = null;
      return boot();
    }).catch(function (e) {
      UI.toast('保存失败：' + (e.message || e), 'err');
    });
  }
  document.getElementById('fileGrades').addEventListener('change', function (e) {
    handleFile(DataStore.KEY_GRADES, e.target.files[0]); e.target.value = '';
  });
  document.getElementById('fileTargets').addEventListener('change', function (e) {
    handleFile(DataStore.KEY_TARGETS, e.target.files[0]); e.target.value = '';
  });
  document.getElementById('btnResetGrades').addEventListener('click', function () {
    DataStore.resetGrades().then(function () { UI.toast('已恢复内置默认成绩', 'ok'); currentClass = null; return boot(); });
  });
  document.getElementById('btnClearTargets').addEventListener('click', function () {
    DataStore.clearTargets().then(function () { UI.toast('已清除目标院校数据', 'ok'); return boot(); });
  });

  /* ---------- 窄屏竖屏提示（3 秒自动消失） ---------- */
  var rotateTimer = null;
  function maybeRotateTip() {
    var tip = document.getElementById('rotateTip');
    if (!tip) return;
    var narrowPortrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;
    if (narrowPortrait) {
      if (!tip.classList.contains('show')) {
        tip.classList.add('show');
        clearTimeout(rotateTimer);
        rotateTimer = setTimeout(function () { tip.classList.remove('show'); }, 3000);
      }
    } else {
      tip.classList.remove('show');
      clearTimeout(rotateTimer);
    }
  }
  window.addEventListener('resize', maybeRotateTip);
  window.addEventListener('orientationchange', function () { setTimeout(maybeRotateTip, 300); });
  maybeRotateTip();

  boot();
})();
