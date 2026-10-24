/* ============================================================
   learning-module.js — 可挂载的“学习目标”模块
   用途：嵌入校区成绩分析页（龙泉/星耀/睿智），成绩直接复用
         校区已加载的成绩文件；目标院校表由 GitHub 托管，
         仅管理员（持有令牌）可上传，其他用户只能查看。
   依赖：AppCore（common.js）、GitHubUpload（github-upload.js）、
         XLSX（SheetJS）。
   用法：LearningModule.mount(container, {
           gradeData: <AppCore.parseGradeWorkbook 的结果>,
           targetPath: 'data/targets/龙泉校区目标.xlsx'
         });
   ============================================================ */

(function (global) {
  'use strict';

  /* ==================== 工具 ==================== */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* ==================== 实例状态 ==================== */
  function createInstance(container, opts) {
    var inst = {
      root: container,
      gradeData: opts.gradeData || null,
      targetData: null,
      targetPath: opts.targetPath || '',
      targetsMeta: null,
      currentClass: null,
      currentExamIdx: 0
    };

    /* DOM 句柄在构建后填充 */
    var el = {};

    /* ==================== Toast（容器为全局共享单例） ==================== */
    function toast(msg, type) {
      var w = ensureToastWrap();
      var d = document.createElement('div');
      d.className = 'lm-toast' + (type ? ' ' + type : '');
      d.textContent = msg;
      w.appendChild(d);
      setTimeout(function () {
        d.style.transition = 'opacity .3s';
        d.style.opacity = '0';
        setTimeout(function () { d.remove(); }, 320);
      }, 2400);
    }
    function ensureToastWrap() {
      var existing = document.querySelector('.lm-toast-wrap');
      if (existing) return existing;
      var wrap = document.createElement('div');
      wrap.className = 'lm-toast-wrap';
      document.body.appendChild(wrap);
      return wrap;
    }

    /* ==================== 数据状态 ==================== */
    function renderDataStatus() {
      var classes = inst.gradeData ? inst.gradeData.classes : [];
      var totalStudents = classes.reduce(function (a, c) { return a + c.roster.length; }, 0);
      var examCount = classes.reduce(function (m, c) { return Math.max(m, c.examCount); }, 0);
      var hasTarget = !!(inst.targetData && Object.keys(inst.targetData.classes).length);
      if (classes.length) {
        var parts = [];
        parts.push('<b>' + classes.length + ' 个班级</b>');
        parts.push(examCount + ' 次考试');
        parts.push(totalStudents + ' 名学生');
        parts.push(hasTarget ? '<span class="ds-ok">目标院校表已加载</span>'
          : '<span class="ds-warn">目标院校表尚未上传</span>');
        el.dataStatus.innerHTML = '数据状态：' + parts.join(' · ');
      } else {
        el.dataStatus.textContent = '数据状态：暂无成绩数据';
      }
    }

    /* ==================== 班级 / 考试胶囊 ==================== */
    function renderClassChips() {
      var classes = inst.gradeData ? inst.gradeData.classes : [];
      el.classChips.innerHTML = '';
      if (!classes.length) {
        el.emptyTip.style.display = '';
        el.tableWrap.innerHTML = '';
        el.statBar.innerHTML = '';
        el.examChips.innerHTML = '';
        return;
      }
      el.emptyTip.style.display = 'none';
      if (!inst.currentClass || !classes.some(function (c) { return c.name === inst.currentClass.name; })) {
        inst.currentClass = classes[0];
        inst.currentExamIdx = classes[0].exams.length - 1;
      }
      classes.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'lm-chip' + (inst.currentClass.name === c.name ? ' active' : '');
        b.textContent = c.name + '（' + c.roster.length + '）';
        b.addEventListener('click', function () {
          inst.currentClass = c;
          inst.currentExamIdx = c.exams.length - 1;
          renderClassChips();
        });
        el.classChips.appendChild(b);
      });
      renderExamChips();
      renderOverview();
    }

    function renderExamChips() {
      el.examChips.innerHTML = '';
      if (!inst.currentClass) return;
      inst.currentClass.exams.forEach(function (e, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'lm-chip' + (i === inst.currentExamIdx ? ' active' : '');
        b.textContent = e.label + (e.totalMax && e.totalMax !== 750 ? '（' + e.totalMax + '分制）' : '');
        b.addEventListener('click', function () {
          inst.currentExamIdx = i;
          renderExamChips();
          renderOverview();
        });
        el.examChips.appendChild(b);
      });
    }

    function currentExam() {
      if (!inst.currentClass) return null;
      return inst.currentClass.exams[inst.currentExamIdx] || null;
    }

    function getClassTargets(className) {
      if (!inst.targetData) return null;
      var classes = inst.targetData.classes;
      if (classes[className]) return classes[className];
      var norm = className.replace(/\s+/g, '');
      var names = Object.keys(classes);
      for (var i = 0; i < names.length; i++) {
        if (names[i].replace(/\s+/g, '') === norm) return classes[names[i]];
      }
      return null;
    }

    function buildRow(classObj, exam, student) {
      var total = student.scores['总分'] ? student.scores['总分'].v : null;
      var tmap = getClassTargets(classObj.name);
      var targetName = tmap ? (tmap[student.name] || null) : null;
      var targetInfo = targetName ? AppCore.resolveSchool(classObj.cid, targetName) : null;
      var proj = (classObj.cid && student.rank != null && total != null)
        ? AppCore.buildProjection(classObj.cid, student.rank, student.n, total, exam.totalMax) : null;
      return { total: total, targetName: targetName, targetInfo: targetInfo, proj: proj };
    }

    /* ==================== 统计条 ==================== */
    function renderStats(classObj, exam, rows) {
      var vals = exam.students
        .map(function (s) { return s.scores[exam.rankKey] && s.scores[exam.rankKey].v; })
        .filter(function (v) { return v != null; });
      var avg = vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length * 10) / 10 : 0;
      var targetCount = rows.filter(function (r) { return r.data.targetName; }).length;
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
      el.statBar.innerHTML = boxes.map(function (b) {
        return '<div class="lm-stat-box ' + b.c + '"><span>' + b.t + '</span><b>' + b.v + '</b>' +
          (b.sub ? '<em>' + b.sub + '</em>' : '') + '</div>';
      }).join('');
    }

    /* ==================== 总览表 ==================== */
    function renderOverview() {
      if (!inst.currentClass) {
        el.tableWrap.innerHTML = ''; el.statBar.innerHTML = '';
        el.emptyTip.style.display = '';
        return;
      }
      el.emptyTip.style.display = 'none';
      var exam = currentExam();

      function rowTotal(s) {
        return s.scores[exam.rankKey] && s.scores[exam.rankKey].v != null ? s.scores[exam.rankKey].v : null;
      }
      function nameCmp(x, y) {
        return String(x).localeCompare(String(y), 'zh-CN', { numeric: true, sensitivity: 'base' });
      }
      var rows = exam.students.map(function (s) {
        return { student: s, data: buildRow(inst.currentClass, exam, s) };
      }).sort(function (a, b) {
        var ta = rowTotal(a.student), tb = rowTotal(b.student);
        if (ta == null && tb == null) return nameCmp(a.student.name, b.student.name);
        if (ta == null) return 1;
        if (tb == null) return -1;
        if (tb !== ta) return tb - ta;
        return nameCmp(a.student.name, b.student.name);
      });

      renderStats(inst.currentClass, exam, rows);

      var keys = exam.subjectKeys;
      var thead = '<thead><tr>' +
        '<th class="lm-rank">排名</th><th class="lm-name">姓名</th>' +
        keys.map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') +
        '<th>目标院校</th><th>目标分</th>' +
        '<th title="按本次班级排名等比例折合到全省的位次">预估位次</th>' +
        '<th>可达院校</th><th>可达分</th><th>可达位次</th>' +
        '</tr></thead>';

      var tbody = '<tbody>' + rows.map(function (r) {
        var s = r.student, d = r.data;
        var cells = keys.map(function (k) {
          var sc = s.scores[k];
          var v = sc ? sc.v : null;
          return '<td class="' + (k === '总分' ? 'lm-total-cell' : '') + '">' +
            (v != null ? esc(v) : '<span class="lm-muted-cell">—</span>') + '</td>';
        }).join('');

        var t = d.targetInfo;
        var targetCells = t
          ? '<td><span class="lm-school-link-cell lm-school-link" data-cid="' + esc(t.cid) + '" data-name="' + esc(t.name) + '" title="' + esc(t.name) + '">' + esc(t.name) + '</span></td>' +
            '<td>' + (t.minScore != null ? esc(t.minScore) : '—') + '</td>'
          : '<td><span class="lm-muted-cell">' + (d.targetName ? '未匹配' : '未设置') + '</span></td><td>—</td>';

        var p = d.proj;
        var rankCell = p && p.R_scale != null ? p.R_scale : '—';
        var reachCells = (p && p.school)
          ? '<td><span class="lm-school-link-cell lm-school-link" data-cid="' + esc(inst.currentClass.cid) + '" data-name="' + esc(p.school.name) + '" title="' + esc(p.school.name) + '">' + esc(p.school.name) + '</span></td>' +
            '<td>' + p.school.minScore + '</td><td>' + p.school.rank + '</td>'
          : '<td><span class="lm-muted-cell">' + (p && p.lowest ? '未达线' : '—') + '</span></td><td>—</td><td>—</td>';

        return '<tr data-name="' + esc(s.name) + '">' +
          '<td class="lm-rank">' + (s.rank != null ? s.rank : '—') + '</td>' +
          '<td class="lm-name"><span class="lm-name-cell" data-name="' + esc(s.name) + '">' + esc(s.name) + '</span></td>' +
          cells + targetCells +
          '<td class="lm-rank-cell">' + rankCell + '</td>' +
          reachCells + '</tr>';
      }).join('') + '</tbody>';

      el.tableWrap.innerHTML = '<table class="lm-data">' + thead + tbody + '</table>';
      applySearch();
    }

    /* ==================== 搜索 ==================== */
    function applySearch() {
      var kw = el.searchInput.value.trim();
      el.tableWrap.querySelectorAll('tbody tr').forEach(function (tr) {
        if (!kw) { tr.style.display = ''; return; }
        tr.style.display = tr.getAttribute('data-name').indexOf(kw) >= 0 ? '' : 'none';
      });
    }

    /* ==================== 学生弹窗 ==================== */
    function scoreGrid(exam, student) {
      return exam.subjectKeys.map(function (k) {
        var s = student.scores[k];
        var v = s ? s.v : null;
        var max = s ? s.max : null;
        var cls = k === '总分' ? 'lm-subj total' : 'lm-subj';
        if (v == null) cls += ' empty';
        var pct = 0, barCls = '';
        if (v != null && max) {
          pct = Math.max(2, Math.min(100, v / max * 100));
          if (pct < 50) barCls = 'bad';
          else if (pct < 70) barCls = 'warn';
        }
        return '<div class="' + cls + '">' +
          '<div class="lm-s-name">' + esc(k) + '</div>' +
          '<div class="lm-s-val">' + (v != null ? esc(v) : '未考') +
            (v != null && max ? '<small>/' + esc(max) + '</small>' : '') + '</div>' +
          '<div class="lm-s-bar"><i class="' + barCls + '" style="width:' + pct + '%"></i></div>' +
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

    function prevExamBlock(classObj, examIdx, student, curTotal) {
      var head = '<div class="lm-modal-block-title"><span class="lm-bar"></span>上一次考试对比</div>';
      if (examIdx <= 0) {
        return head + '<div class="lm-mini-note">该考试为已记录的第一次考试，暂无上一次考试数据。</div>';
      }
      var prev = classObj.exams[examIdx - 1];
      var cur = classObj.exams[examIdx];
      var prevStu = prev.students.filter(function (x) { return x.name === student.name; })[0];
      if (!prevStu) {
        return head + '<div class="lm-mini-note">上一次考试（' + esc(prev.label) + '）未找到该学生的成绩记录。</div>';
      }
      var prevTotal = prevStu.scores['总分'] ? prevStu.scores['总分'].v : null;
      var prevRank = prevStu.rank;
      function to750(v, max) {
        if (v == null) return null;
        return (!max || max === 750) ? v : Math.round(v * 750 / max);
      }
      var scaleNote = (prev.totalMax !== cur.totalMax) ? '（均折合 750 分制）' : '';
      var scoreDelta = (to750(curTotal, cur.totalMax) != null && to750(prevTotal, prev.totalMax) != null)
        ? to750(curTotal, cur.totalMax) - to750(prevTotal, prev.totalMax) : null;
      var rankDelta = (student.rank != null && prevRank != null) ? prevRank - student.rank : null;

      function deltaBadge(delta, suffix) {
        if (delta == null) return '<span class="lm-badge gray">—</span>';
        if (delta === 0) return '<span class="lm-badge gray">持平</span>';
        var arrow = delta > 0 ? '↑' : '↓';
        return '<span class="lm-badge ' + (delta > 0 ? 'green' : 'red') + '">' + arrow + ' ' + Math.abs(delta) + suffix + '</span>';
      }
      return head + '<div class="lm-compare-grid">' +
        '<div class="lm-cmp-item"><span>上一次考试</span><b>' + esc(prev.label) + (prev.totalMax ? '（' + esc(prev.totalMax) + '分制）' : '') + '</b></div>' +
        '<div class="lm-cmp-item"><span>上次总分</span><b>' + (prevTotal != null ? esc(prevTotal) : '—') + '</b></div>' +
        '<div class="lm-cmp-item"><span>上次班级排名</span><b>' + (prevRank != null ? '第 ' + esc(prevRank) + ' 名' : '—') + '</b></div>' +
        '<div class="lm-cmp-item"><span>本次总分变化' + scaleNote + '</span><b>' + (scoreDelta == null ? '—' : (scoreDelta > 0 ? '+' : '') + scoreDelta) + ' 分</b> ' + deltaBadge(scoreDelta, ' 分') + '</div>' +
        '<div class="lm-cmp-item"><span>本次排名变化</span><b>' + (rankDelta == null ? '—' : (rankDelta > 0 ? '进步 ' : rankDelta < 0 ? '退步 ' : '') + (rankDelta === 0 ? '持平' : Math.abs(rankDelta) + ' 名')) + '</b> ' + deltaBadge(rankDelta, ' 名') + '</div>' +
        '</div>';
    }

    function targetBlock(classObj, student, convertedScore) {
      var head = '<div class="lm-modal-block-title"><span class="lm-bar"></span>我的目标院校</div>';
      var tmap = getClassTargets(classObj.name);
      var targetName = tmap ? (tmap[student.name] || null) : null;
      if (!targetName) {
        return head + '<div class="lm-mini-note">尚未设置目标院校，请由老师在目标院校表中填写。</div>';
      }
      var info = AppCore.resolveSchool(classObj.cid, targetName);
      if (!info) {
        return head + '<div class="lm-mini-note">未找到目标院校“' + esc(targetName) + '”的信息，请核对名称。</div>';
      }
      var gap = (convertedScore != null && info.minScore != null) ? info.minScore - convertedScore : null;
      var gapText = gap == null ? '' :
        (gap > 0 ? '<span class="lm-badge red">还差 ' + gap + ' 分</span>'
          : '<span class="lm-badge green">已超过 ' + (-gap) + ' 分</span>');
      return head + '<div class="lm-school-line">' +
        '<span class="lm-sl-name lm-school-link" data-cid="' + esc(info.cid) + '" data-name="' + esc(info.name) + '">' + esc(info.name) + '</span>' +
        gapText +
        '<span class="lm-sl-nums">' +
          '<div class="lm-num-chip indigo"><b>' + (info.minScore != null ? esc(info.minScore) : '—') + '</b><span>最低录取分</span></div>' +
          '<div class="lm-num-chip"><b>' + (info.rank != null ? esc(info.rank) : '—') + '</b><span>累计位次</span></div>' +
        '</span></div>';
    }

    function reachableBlock(classObj, student, total, proj) {
      var head = '<div class="lm-modal-block-title"><span class="lm-bar"></span>按本次成绩预估可达到的院校</div>';
      if (!classObj.cid) return head + '<div class="lm-mini-note">无法识别该班级对应的考试类。</div>';
      if (student.rank == null || total == null || !proj) {
        return head + '<div class="lm-mini-note">本次考试缺少总分，暂无法推算。</div>';
      }
      var note = '<div class="lm-gap-row">' +
        '本次预估位次按班级排名折合：<b>' + student.rank + ' / ' + student.n + ' × ' + proj.N + ' = 第 ' + proj.R_scale + ' 位</b>（约合 ' + proj.projectedScore + ' 分）；' +
        (proj.convertedScore != null && proj.convertedScore !== total
          ? '本次总分按比例折合 750 分制为 <b>' + proj.convertedScore + ' 分</b>，' : '') +
        '按折合分数查表位次约 <b>' + proj.R_score + '</b> 位（参考）。</div>';
      var body;
      if (proj.school) {
        body = '<div class="lm-school-line">' +
          '<span class="lm-sl-name lm-school-link" data-cid="' + esc(classObj.cid) + '" data-name="' + esc(proj.school.name) + '">' + esc(proj.school.name) + '</span>' +
          '<span class="lm-badge indigo">以最低录取分计可达到</span>' +
          '<span class="lm-sl-nums">' +
            '<div class="lm-num-chip violet"><b>' + proj.school.minScore + '</b><span>最低录取分</span></div>' +
            '<div class="lm-num-chip"><b>' + proj.school.rank + '</b><span>累计位次</span></div>' +
          '</span></div>';
      } else {
        body = '<div class="lm-mini-note">当前水平暂未达到该类院校最低投档线；该类投档线最低的院校为：' +
          '<span class="lm-school-link" data-cid="' + esc(classObj.cid) + '" data-name="' + esc(proj.lowest.name) + '">' + esc(proj.lowest.name) + '</span>' +
          '（' + proj.lowest.minScore + ' 分 / 第 ' + proj.lowest.rank + ' 位），继续努力。</div>';
      }
      return head + note + body +
        '<div class="lm-gap-row">点击院校名称可查看该学校的招生专业、学费、地址等详细信息。</div>';
    }

    function adviceBlock(classObj, exam, examIdx, student, d, stats) {
      var head = '<div class="lm-modal-block-title"><span class="lm-bar"></span>学习建议</div>';
      var total = d.total;
      if (total == null) {
        return '<div class="lm-modal-block"><div class="lm-advice-block">' + head +
          '<div class="lm-mini-note">本次考试缺少该学生的总成绩记录，可能为缺考或未录入，建议核实后再做分析。</div></div></div>';
      }
      var proj = d.proj;
      var conv = proj ? proj.convertedScore : null;
      function to750(v) {
        if (v == null) return null;
        return (!exam.totalMax || exam.totalMax === 750) ? v : Math.round(v * 750 / exam.totalMax);
      }
      var avg750 = stats.avg != null ? to750(stats.avg) : null;
      var items = [];

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
            if (rd > 0) line += '；较上一次考试（' + esc(prev.label) + '）<b>进步 ' + rd + ' 名</b>，继续保持';
            else if (rd < 0) line += '；较上一次考试（' + esc(prev.label) + '）<b>退步 ' + Math.abs(rd) + ' 名</b>，要尽快找回状态';
            else line += '；排名与上一次考试持平，需寻求突破';
          }
        }
        line += '。';
        items.push(line);
      }

      var ti = d.targetInfo;
      if (ti && ti.minScore != null && conv != null) {
        var gap = ti.minScore - conv;
        if (gap > 0) {
          var rankGap = (proj && proj.R_scale != null && ti.rank != null) ? proj.R_scale - ti.rank : null;
          items.push('目标院校 <b>' + esc(ti.name) + '</b> 2026 年最低录取分 <b>' + ti.minScore + ' 分</b>（累计位次约 ' +
            (ti.rank != null ? '第 <b>' + ti.rank + '</b> 位' : '—') + '），当前折合总分<b>还差 ' + gap + ' 分</b>' +
            (rankGap > 0 ? '，全省位次还需再提前约 <b>' + rankGap + '</b> 位' : '') +
            '。建议把目标分拆到每次周测，稳步缩小差距。');
        } else {
          items.push('当前折合总分已<b>超过</b>目标院校 <b>' + esc(ti.name) + '</b> 最低录取线 <b>' + (-gap) + ' 分</b>，' +
            '目标基本达成；建议稳住状态，并在当前可达到的院校中再冲一所层次更高的公办校。');
        }
      } else if (!d.targetName) {
        items.push(proj && proj.R_scale != null
          ? '尚未设置目标院校。建议结合当前预估全省位次（约第 <b>' + proj.R_scale + '</b> 位），' +
            '按“冲一冲、稳一稳、保一保”尽快确定 1-2 所目标院校，让复习更有方向。'
          : '尚未设置目标院校，建议尽快结合自身成绩确定 1-2 所目标院校。');
      }

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

      if (proj) {
        if (proj.reachablePublic && proj.school) {
          items.push('按本次预估位次可达到<b>公办院校</b>（最高可冲 <b>' + esc(proj.school.name) + '</b>，' +
            proj.school.minScore + ' 分），公办院校学费较低、办学有保障，建议优先考虑。');
        } else if (proj.reachablePrivate && proj.school) {
          items.push('按本次预估位次目前只能达到<b>民办院校</b>（如 ' + esc(proj.school.name) + '，' +
            proj.school.minScore + ' 分），距离公办院校还需继续提分，重点突破上面的薄弱科目。');
        } else if (proj.lowest) {
          items.push('当前成绩尚未达到该类最低投档线（最低为 ' + esc(proj.lowest.name) + ' ' +
            proj.lowest.minScore + ' 分），建议先夯实基础、保住基础分，再逐步提升。');
        }
      }

      var html = head + '<div class="lm-advice-list">' + items.map(function (t) {
        return '<div class="lm-advice-item"><span class="lm-ai-dot"></span><div>' + t + '</div></div>';
      }).join('') + '</div>';
      return '<div class="lm-modal-block"><div class="lm-advice-block">' + html + '</div></div>';
    }

    function openStudent(name) {
      var classObj = inst.currentClass;
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
        ? '<span class="lm-badge amber">本次为 ' + exam.totalMax + ' 分制，折合 750 分制约 ' + (converted != null ? converted : '—') + ' 分</span>' : '';

      var html = '' +
        '<div class="lm-modal-head">' +
          '<div style="min-width:0">' +
            '<h3>' + esc(student.name) + '</h3>' +
            '<div class="lm-mh-sub">' +
              '<span class="lm-badge indigo">' + esc(classObj.name) + '</span>' +
              '<span class="lm-badge gray">' + esc(exam.label) + '</span>' +
              scaleBadge +
            '</div></div>' +
          '<button class="lm-modal-close" data-close aria-label="关闭">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button></div>' +
        '<div class="lm-modal-body">' +
          '<div class="lm-rank-banner">' +
            '<div class="lm-rb-num">' + (student.rank != null ? student.rank : '—') + '<small> 名</small></div>' +
            '<div class="lm-rb-label"><strong>' + esc(student.name) + '</strong><br>班级排名 · 参考 ' + (student.n || 0) + ' 人</div>' +
            '<div class="lm-rb-spacer"></div>' +
            '<div class="lm-rank-stats">' +
              '<div class="lm-rs-item"><b>' + (total != null ? total : '—') + '</b>本次总分</div>' +
              '<div class="lm-rs-item"><b>' + (stats.avg != null ? stats.avg : '—') + '</b>班级平均</div>' +
              '<div class="lm-rs-item"><b>' + (stats.max != null ? stats.max : '—') + '</b>班级最高</div>' +
              '<div class="lm-rs-item hl"><b>' + (proj && proj.R_scale != null ? proj.R_scale : '—') + '</b>预估位次</div>' +
            '</div></div>' +
          '<div class="lm-modal-block"><div class="lm-modal-block-title"><span class="lm-bar"></span>本次各科成绩' +
            '<span class="lm-tag"><span class="lm-badge gray">按 总分→语文→数学… 顺序</span></span></div>' +
            '<div class="lm-score-grid">' + scoreGrid(exam, student) + '</div></div>' +
          '<div class="lm-modal-block">' + prevExamBlock(classObj, inst.currentExamIdx, student, total) + '</div>' +
          '<div class="lm-modal-block">' + targetBlock(classObj, student, converted) + '</div>' +
          '<div class="lm-modal-block">' + reachableBlock(classObj, student, total, proj) + '</div>' +
          adviceBlock(classObj, exam, inst.currentExamIdx, student, d, stats) +
        '</div>';

      el.studentModal.innerHTML = html;
      el.studentMask.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    /* ==================== 院校弹窗 ==================== */
    function openSchool(cid, name) {
      var info = AppCore.resolveSchool(cid, name);
      if (!info) { toast('未找到该院校信息：' + name, 'err'); return; }
      var majorsRows = info.majors.map(function (m) {
        return '<tr>' +
          '<td style="text-align:left;white-space:normal;min-width:220px">' + esc(m.major) + '</td>' +
          '<td>' + (m.score != null ? esc(m.score) : '<span class="lm-muted-cell">—</span>') + '</td>' +
          '<td>' + (m.plan ? esc(m.plan) : '—') + '</td>' +
          '<td>' + (m.years ? esc(m.years) + '年' : '—') + '</td>' +
          '<td>' + (m.fee ? esc(m.fee) : '—') + '</td>' +
          '</tr>';
      }).join('');
      var html = '' +
        '<div class="lm-modal-head">' +
          '<div style="min-width:0">' +
            '<h3>' + esc(info.name) + '</h3>' +
            '<div class="lm-mh-sub">' +
              '<span class="lm-badge indigo">' + esc(info.categoryName) + '</span>' +
              (info.nature ? '<span class="lm-badge ' + (info.nature.indexOf('公办') >= 0 ? 'green' : 'amber') + '">' + esc(info.nature) + '</span>' : '') +
              (info.region ? '<span class="lm-badge gray">' + esc(info.region) + '</span>' : '') +
            '</div></div>' +
          '<button class="lm-modal-close" data-close aria-label="关闭">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button></div>' +
        '<div class="lm-modal-body">' +
          '<div class="lm-info-grid">' +
            '<div class="lm-info-item"><span>2026 最低投档分</span><b>' + (info.minScore != null ? esc(info.minScore) + ' 分' : '—') + '</b></div>' +
            '<div class="lm-info-item"><span>2026 最高投档分</span><b>' + (info.minScore != null ? esc(info.maxScore) + ' 分' : '—') + '</b></div>' +
            '<div class="lm-info-item"><span>最低分对应累计位次</span><b>' + (info.rank != null ? '第 ' + esc(info.rank) + ' 位' : '—') + '</b></div>' +
            (info.region ? '<div class="lm-info-item"><span>所在地区</span><b>' + esc(info.region) + '</b></div>' : '') +
            (info.nature ? '<div class="lm-info-item"><span>办学性质</span><b>' + esc(info.nature) + '</b></div>' : '') +
          '</div>' +
          (info.address ? '<div class="lm-info-item" style="margin-bottom:14px"><span>院校地址</span><b>' + esc(info.address) + '</b></div>' : '') +
          '<div class="lm-card-title" style="margin-bottom:9px"><span class="lm-bar"></span>招生专业（' + info.majors.length + ' 个）</div>' +
          '<div class="lm-table-wrap" style="max-height:340px;overflow:auto">' +
            '<table class="lm-data"><thead><tr>' +
              '<th style="text-align:left">专业名称</th><th>投档最低分</th><th>计划数</th><th>学制</th><th>学费(元/年)</th>' +
              '</tr></thead><tbody>' + majorsRows + '</tbody></table>' +
          '</div></div>';
      el.schoolModal.innerHTML = html;
      el.schoolMask.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    /* ==================== 管理员登录弹窗 ==================== */
    function openAdminLogin() {
      var html = '<div class="lm-modal-head">' +
        '<h3>管理员验证</h3>' +
        '<button class="lm-modal-close" data-close aria="关闭">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button></div>' +
        '<div class="lm-modal-body lm-admin-body">' +
          '<label>GitHub Personal Access Token</label>' +
          '<input type="password" id="lmAdminToken" placeholder="请输入管理员令牌（ghp_ 开头）" autocomplete="off">' +
          '<div class="lm-admin-err" id="lmAdminErr"></div>' +
          '<button class="lm-btn" id="lmAdminSubmit" style="width:100%;margin-top:6px">验证并登录</button>' +
          '<div class="lm-admin-note">仅管理员持有可写入的令牌；登录状态仅保存在当前标签页，关闭后自动失效。没有令牌的用户无法上传目标文件。</div>' +
        '</div>';
      el.adminModal.innerHTML = html;
      el.adminMask.classList.add('show');
      var input = document.getElementById('lmAdminToken');
      if (input) input.focus();
      document.getElementById('lmAdminSubmit').addEventListener('click', function () {
        var token = document.getElementById('lmAdminToken').value;
        var errBox = document.getElementById('lmAdminErr');
        errBox.textContent = '';
        GitHubUpload.login(token).then(function () {
          el.adminMask.classList.remove('show');
          toast('管理员登录成功', 'ok');
          renderAdminBtn();
        }).catch(function (e) {
          errBox.textContent = e.message || '登录失败';
        });
      });
      if (input) input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') document.getElementById('lmAdminSubmit').click();
      });
    }

    function renderAdminBtn() {
      var logged = GitHubUpload.isLoggedIn();
      var u = GitHubUpload.getLogin();
      el.adminBtn.innerHTML = logged
        ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4m0 0L8 8m4-4l4 4"/><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>'
          + '上传目标院校表'
        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4m0 0L8 8m4-4l4 4"/><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>'
          + '上传目标院校表';
    }

    /* ==================== 目标文件上传 ==================== */
    function pickAndUploadTarget() {
      /* 未登录先要求管理员验证，其他用户在此被拦截 */
      if (!GitHubUpload.isLoggedIn()) {
        openAdminLogin();
        return;
      }
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx,.xls';
      input.addEventListener('change', function () {
        var file = input.files[0];
        if (!file) return;
        if (!/\.(xlsx|xls)$/i.test(file.name)) { toast('请选择 .xlsx 格式文件', 'err'); return; }
        toast('正在上传目标文件…');
        GitHubUpload.uploadFile(inst.targetPath, file, 'upload: 目标院校表 ' + inst.targetPath)
          .then(function () {
            toast('目标文件上传成功，正在刷新', 'ok');
            return loadTarget(true);
          })
          .catch(function (e) {
            toast('上传失败：' + (e.message || e), 'err');
          });
      });
      input.click();
    }

    /* ==================== 目标文件拉取 ==================== */
    function loadTarget(isReload) {
      if (!inst.targetPath) return Promise.resolve();
      return GitHubUpload.fetchRawBytes(inst.targetPath).then(function (buf) {
        if (!buf) {
          inst.targetData = null;
          renderDataStatus();
          if (isReload) renderOverview();
          return;
        }
        var wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
        inst.targetData = AppCore.parseTargetWorkbook(wb);
        renderDataStatus();
        renderOverview();
      }).catch(function () {
        /* 拉取失败时保持无目标状态 */
        inst.targetData = null;
        renderDataStatus();
      });
    }

    /* ==================== 弹窗内点击委托 ==================== */
    function handleInnerClick(e, maskEl) {
      if (e.target === maskEl || e.target.hasAttribute('data-close') ||
        (e.target.closest && e.target.closest('[data-close]'))) {
        maskEl.classList.remove('show');
        if (document.querySelectorAll('.lm-mask.show').length === 0) {
          document.body.style.overflow = '';
        }
        return;
      }
      var sl = e.target.closest('.lm-school-link');
      if (sl) {
        /* 院校弹窗叠加：在最上层打开 */
        openSchool(sl.getAttribute('data-cid'), sl.getAttribute('data-name'));
      }
    }

    /* ==================== 构建 DOM ==================== */
    function buildDOM() {
      inst.root.innerHTML =
        '<div class="lm-root">' +
          /* 筛选卡 */
          '<div class="lm-card lm-filter-card">' +
            '<div class="lm-filter-head">' +
              '<div class="lm-data-status" id="lmDataStatus">正在加载数据…</div>' +
              '<div class="lm-filter-actions">' +
                '<a class="lm-btn sm gray" href="../assets/templates/目标院校填写模板.xlsx" download>' +
                  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>' +
                  '目标模板</a>' +
                '<button class="lm-btn sm" id="lmAdminBtn" type="button"></button>' +
              '</div></div>' +
            '<div class="lm-chip-row">' +
              '<span class="lm-chip-label">班级</span>' +
              '<div class="lm-chips" id="lmClassChips"></div>' +
            '</div>' +
            '<div class="lm-chip-row">' +
              '<span class="lm-chip-label">考试</span>' +
              '<div class="lm-chips" id="lmExamChips"></div>' +
            '</div>' +
            '<div class="lm-filter-head" style="margin-top:12px;margin-bottom:0">' +
              '<div class="lm-search-box" style="flex:1">' +
                '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
                '<input type="search" id="lmSearch" placeholder="输入姓名快速定位…" style="width:100%">' +
              '</div></div>' +
          '</div>' +
          /* 统计条 */
          '<div class="lm-stat-bar" id="lmStatBar"></div>' +
          /* 表格卡 */
          '<div class="lm-card lm-table-card">' +
            '<div class="lm-card-title"><span class="lm-bar"></span>全班成绩总览' +
              '<span class="lm-tag"><span class="lm-badge indigo">点击姓名查看个人详情</span></span></div>' +
            '<div class="lm-table-wrap" id="lmTableWrap"></div>' +
            '<div class="lm-empty-state" id="lmEmptyTip" style="display:none">' +
              '<div class="lm-es-icon">' +
                '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l7-3.82z"/></svg>' +
              '</div>' +
              '<h3>暂无成绩数据</h3><p>请先加载校区成绩文件</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
        /* 学生弹窗 */
        '<div class="lm-mask" id="lmStudentMask"><div class="lm-modal" id="lmStudentModal"></div></div>' +
        /* 院校弹窗 */
        '<div class="lm-mask" id="lmSchoolMask" style="z-index:210"><div class="lm-modal" id="lmSchoolModal"></div></div>' +
        /* 管理员登录弹窗 */
        '<div class="lm-mask" id="lmAdminMask" style="z-index:220"><div class="lm-modal" id="lmAdminModal"></div></div>';

      el.dataStatus = document.getElementById('lmDataStatus');
      el.classChips = document.getElementById('lmClassChips');
      el.examChips = document.getElementById('lmExamChips');
      el.statBar = document.getElementById('lmStatBar');
      el.tableWrap = document.getElementById('lmTableWrap');
      el.emptyTip = document.getElementById('lmEmptyTip');
      el.searchInput = document.getElementById('lmSearch');
      el.studentMask = document.getElementById('lmStudentMask');
      el.studentModal = document.getElementById('lmStudentModal');
      el.schoolMask = document.getElementById('lmSchoolMask');
      el.schoolModal = document.getElementById('lmSchoolModal');
      el.adminMask = document.getElementById('lmAdminMask');
      el.adminModal = document.getElementById('lmAdminModal');
      el.adminBtn = document.getElementById('lmAdminBtn');

      /* 事件绑定 */
      el.searchInput.addEventListener('input', applySearch);
      el.tableWrap.addEventListener('click', function (e) {
        var nameCell = e.target.closest('.lm-name-cell');
        if (nameCell) { openStudent(nameCell.getAttribute('data-name')); return; }
        var sl = e.target.closest('.lm-school-link');
        if (sl) { openSchool(sl.getAttribute('data-cid'), sl.getAttribute('data-name')); }
      });
      el.studentMask.addEventListener('click', function (e) { handleInnerClick(e, el.studentMask); });
      el.schoolMask.addEventListener('click', function (e) { handleInnerClick(e, el.schoolMask); });
      el.adminMask.addEventListener('click', function (e) { handleInnerClick(e, el.adminMask); });
      el.adminBtn.addEventListener('click', pickAndUploadTarget);

      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var masks = document.querySelectorAll('.lm-mask.show');
        if (masks.length) {
          var top = masks[masks.length - 1];
          top.classList.remove('show');
          if (document.querySelectorAll('.lm-mask.show').length === 0) {
            document.body.style.overflow = '';
          }
        }
      });
    }

    /* ==================== 启动 ==================== */
    buildDOM();
    renderAdminBtn();
    renderDataStatus();
    renderClassChips();
    loadTarget(false);

    return {
      refresh: function () { renderClassChips(); },
      setGradeData: function (gd) {
        inst.gradeData = gd;
        inst.currentClass = null;
        renderDataStatus();
        renderClassChips();
      }
    };
  }

  /* ==================== 模块入口 ==================== */
  global.LearningModule = {
    mount: function (container, opts) {
      if (!container) throw new Error('LearningModule.mount: 缺少容器');
      return createInstance(container, opts || {});
    }
  };

})(window);
