/* ============================================================
   learning-module.js — 可挂载的“学习目标”模块
   用途：嵌入校区成绩分析页（龙泉/星耀/睿智），成绩直接复用
         校区已加载的成绩文件；目标院校表由 GitHub 托管，
         由上传管理页（upload.html）统一上传，本模块只读取、
         自动拉取，页面内不再提供上传/下载入口。
   班级筛选复用校区顶部“已加载班级”勾选结果；本模块仅保留
   考试切换与姓名搜索，不重复出现班级选择器。
   依赖：AppCore（common.js）、GitHubUpload（github-upload.js）、
         XLSX（SheetJS）。
   用法：LearningModule.mount(container, {
           gradeData: <AppCore.parseGradeWorkbook 的结果>,
           targetPath: 'data/targets/龙泉校区目标.xlsx',
           getSelectedClasses: function () { return ['1类1班', ...]; }
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

  /* ==================== 导出辅助 ==================== */
  function p2(n) { return String(n).padStart(2, '0'); }
  function fmtTime(d) {
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
      ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function sanitizeFileName(s) {
    return String(s == null ? '' : s).replace(/[\\/:*?"<>|]+/g, '').trim();
  }
  var PURE_NUM_RE = /^-?\d+(\.\d+)?$/;
  function cellToValue(text) {
    var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    return PURE_NUM_RE.test(t) ? parseFloat(t) : t;
  }

  /* ==================== 分值对齐（与核心分析「对齐最高满分」同口径） ====================
     规则：以每个「班级 × 科目」历次考试中出现过的最高满分为基准，
     其余考试成绩按 最高满分 / 当次满分 等比放大；总分未标注满分时，
     按该次考试各科满分之和推导。只影响本模块显示，不改原始文件。 */
  function alignGradeData(gd) {
    if (!gd || !gd.classes) return gd;
    gd.classes.forEach(function (c) {
      if (!c.exams || !c.exams.length) return;
      /* 1) 每次考试每个科目的当前满分（总分缺失时由各科满分推导） */
      var examMax = c.exams.map(function (ex) {
        var map = {};
        ex.subjectKeys.forEach(function (k) {
          var m = null;
          ex.students.forEach(function (s) {
            var sc = s.scores[k];
            if (sc && sc.max != null && (m == null || sc.max > m)) m = sc.max;
          });
          map[k] = m;
        });
        if (map['总分'] == null) {
          var sum = 0, n = 0;
          ex.subjectKeys.forEach(function (k) {
            if (k === '总分' || k === '职测总分') return;
            if (map[k] != null) { sum += map[k]; n++; }
          });
          if (n) map['总分'] = sum;
        }
        return map;
      });
      /* 2) 各班各科目标满分 = 历次最高满分 */
      var target = {};
      c.exams.forEach(function (ex, ei) {
        ex.subjectKeys.forEach(function (k) {
          var m = examMax[ei][k];
          if (m != null && (target[k] == null || m > target[k])) target[k] = m;
        });
      });
      /* 3) 等比放大并回写满分；考试总分满分同步到对齐后尺度 */
      c.exams.forEach(function (ex, ei) {
        ex.students.forEach(function (s) {
          Object.keys(s.scores).forEach(function (k) {
            var sc = s.scores[k];
            var cur = examMax[ei][k];
            var t = target[k];
            if (typeof sc.v !== 'number' || cur == null || cur <= 0 || t == null) return;
            if (Math.abs(t - cur) < 1e-9) { sc.max = t; return; }
            sc.v = Math.round(sc.v * t / cur * 10) / 10;
            sc.max = t;
          });
        });
        if (target['总分'] != null) ex.totalMax = target['总分'];
      });
    });
    return gd;
  }

  /* ==================== 实例状态 ==================== */
  function createInstance(container, opts) {
    var inst = {
      root: container,
      gradeData: alignGradeData(opts.gradeData || null),
      targetData: null,
      targetPath: opts.targetPath || '',
      campusName: opts.campusName || '',
      getSelectedClasses: typeof opts.getSelectedClasses === 'function' ? opts.getSelectedClasses : null,
      activeExamIdx: 0,
      activeExamLabel: '',
      hasRows: false,
      examTouched: false
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

    /* ==================== 班级选择（复用校区顶部勾选） ==================== */
    function selectedClassObjs() {
      var all = inst.gradeData ? inst.gradeData.classes : [];
      if (!inst.getSelectedClasses) return all.slice();
      var picked = inst.getSelectedClasses() || [];
      var norm = {};
      picked.forEach(function (n) { norm[String(n).replace(/\s+/g, '')] = true; });
      return all.filter(function (c) {
        var k = c.name.replace(/\s+/g, '');
        return norm[k] || norm[c.name];
      });
    }

    function examList() {
      var cls = selectedClassObjs();
      if (!cls.length) return [];
      return cls[0].exams || [];
    }

    /* 当前考试下，每个已选班级对应的 { classObj, exam, examIdx } */
    function selectedPairs() {
      var cls = selectedClassObjs();
      var pairs = [];
      cls.forEach(function (c) {
        var ex = c.exams[inst.activeExamIdx];
        if (ex) pairs.push({ classObj: c, exam: ex, examIdx: inst.activeExamIdx });
      });
      return pairs;
    }

    /* ==================== 数据状态 ==================== */
    function renderDataStatus() {
      var classes = inst.gradeData ? inst.gradeData.classes : [];
      var selected = selectedClassObjs();
      var totalStudents = classes.reduce(function (a, c) { return a + c.roster.length; }, 0);
      var examCount = classes.reduce(function (m, c) { return Math.max(m, c.examCount); }, 0);
      var hasTarget = !!(inst.targetData && Object.keys(inst.targetData.classes).length);
      if (classes.length) {
        var parts = [];
        parts.push('<b>' + selected.length + ' / ' + classes.length + ' 个班级</b>');
        parts.push(examCount + ' 次考试');
        parts.push(totalStudents + ' 名学生');
        parts.push(hasTarget ? '<span class="ds-ok">目标院校表已加载</span>'
          : '<span class="ds-warn">目标院校表尚未上传</span>');
        el.dataStatus.innerHTML = '数据状态：' + parts.join(' · ');
      } else {
        el.dataStatus.textContent = '数据状态：暂无成绩数据';
      }
    }

    /* ==================== 考试胶囊（班级选择已上移至顶部筛选条） ==================== */
    function renderExamChips() {
      el.examChips.innerHTML = '';
      var exams = examList();
      if (!exams.length) return;
      /* 用户未手动切换过时，默认选中最新一次考试（列表最后一项） */
      if (!inst.examTouched) inst.activeExamIdx = exams.length - 1;
      if (inst.activeExamIdx >= exams.length) inst.activeExamIdx = exams.length - 1;
      exams.forEach(function (e, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'lm-chip' + (i === inst.activeExamIdx ? ' active' : '');
        b.textContent = e.label + (e.totalMax && e.totalMax !== 750 ? '（' + e.totalMax + '分制）' : '');
        b.addEventListener('click', function () {
          inst.examTouched = true;
          inst.activeExamIdx = i;
          renderExamChips();
          renderOverview();
        });
        el.examChips.appendChild(b);
      });
    }

    function allSubjectKeys(pairs) {
      var order = (AppCore.SUBJECT_ORDER || []);
      var set = {};
      pairs.forEach(function (p) {
        p.exam.subjectKeys.forEach(function (k) { set[k] = true; });
      });
      var keys = order.filter(function (k) { return set[k]; });
      Object.keys(set).forEach(function (k) {
        if (keys.indexOf(k) < 0) keys.push(k);
      });
      return keys;
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

    /* ==================== 统计条（跨已选班级汇总） ==================== */
    function renderStats(pairs, rows) {
      var vals = [];
      pairs.forEach(function (p) {
        p.exam.students.forEach(function (s) {
          var v = s.scores[p.exam.rankKey] && s.scores[p.exam.rankKey].v;
          if (v != null) vals.push(v);
        });
      });
      var avg = vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length * 10) / 10 : 0;
      var targetCount = rows.filter(function (r) { return r.data.targetName; }).length;
      var publicCount = rows.filter(function (r) { return r.data.proj && r.data.proj.reachablePublic; }).length;
      var privateCount = rows.filter(function (r) {
        return r.data.proj && !r.data.proj.reachablePublic && r.data.proj.reachablePrivate;
      }).length;
      var denom = vals.length;
      var totalRoster = pairs.reduce(function (a, p) { return a + p.classObj.roster.length; }, 0);
      function pct(x) { return denom ? Math.round(x / denom * 1000) / 10 + '%' : '—'; }
      var boxes = [
        { t: '参考人数 / 班级人数', v: vals.length + ' <small>/ ' + totalRoster + '</small>', c: 'navy' },
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

    /* ==================== 总览表（跨已选班级合并展示） ==================== */
    function setExportState(on) {
      inst.hasRows = !!on;
    }

    function renderOverview() {
      var pairs = selectedPairs();
      if (!pairs.length) {
        el.tableWrap.innerHTML = '';
        el.statBar.innerHTML = '';
        el.examChips.innerHTML = '';
        el.emptyTip.style.display = '';
        inst.activeExamLabel = '';
        setExportState(false);
        return;
      }
      el.emptyTip.style.display = 'none';
      if (inst.activeExamIdx >= examList().length) inst.activeExamIdx = examList().length - 1;
      pairs = selectedPairs();
      if (!pairs.length) {
        el.tableWrap.innerHTML = '';
        el.statBar.innerHTML = '';
        el.emptyTip.style.display = '';
        inst.activeExamLabel = '';
        setExportState(false);
        return;
      }

      var rows = [];
      pairs.forEach(function (p) {
        p.exam.students.forEach(function (s) {
          rows.push({
            student: s,
            classObj: p.classObj,
            exam: p.exam,
            examIdx: p.examIdx,
            data: buildRow(p.classObj, p.exam, s)
          });
        });
      });

      function rowTotal(r) {
        var k = r.exam.rankKey;
        return r.student.scores[k] && r.student.scores[k].v != null ? r.student.scores[k].v : null;
      }
      function nameCmp(x, y) {
        return String(x).localeCompare(String(y), 'zh-CN', { numeric: true, sensitivity: 'base' });
      }
      rows.sort(function (a, b) {
        var ta = rowTotal(a), tb = rowTotal(b);
        if (ta == null && tb == null) return nameCmp(a.student.name, b.student.name);
        if (ta == null) return 1;
        if (tb == null) return -1;
        if (tb !== ta) return tb - ta;
        return nameCmp(a.student.name, b.student.name);
      });

      renderStats(pairs, rows);

      var curExam = pairs[0] && pairs[0].exam;
      inst.activeExamLabel = curExam ? curExam.label : '';
      setExportState(true);

      var keys = allSubjectKeys(pairs);
      var thead = '<thead><tr>' +
        '<th class="lm-rank">排名</th><th class="lm-class-col">班级</th><th class="lm-name">姓名</th>' +
        keys.map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') +
        '<th>目标院校</th><th>目标分</th>' +
        '<th title="按本次班级排名等比例折合到全省的位次">预估位次</th>' +
        '<th>可达院校</th><th>可达分</th><th>可达位次</th>' +
        '</tr></thead>';

      var tbody = '<tbody>' + rows.map(function (r) {
        var s = r.student, d = r.data, c = r.classObj;
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
          ? '<td><span class="lm-school-link-cell lm-school-link" data-cid="' + esc(c.cid) + '" data-name="' + esc(p.school.name) + '" title="' + esc(p.school.name) + '">' + esc(p.school.name) + '</span></td>' +
            '<td>' + p.school.minScore + '</td><td>' + p.school.rank + '</td>'
          : '<td><span class="lm-muted-cell">' + (p && p.lowest ? '未达线' : '—') + '</span></td><td>—</td><td>—</td>';

        return '<tr data-name="' + esc(s.name) + '">' +
          '<td class="lm-rank">' + (s.rank != null ? s.rank : '—') + '</td>' +
          '<td class="lm-class-cell">' + esc(c.name) + '</td>' +
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

    /* ==================== 导出：Excel / PDF ==================== */
    function currentExamLabel() {
      return inst.activeExamLabel ||
        ((examList()[inst.activeExamIdx] || {}).label) || '成绩';
    }
    function exportBaseName(ext) {
      var parts = [
        inst.campusName ? sanitizeFileName(inst.campusName) : '',
        '学习目标',
        sanitizeFileName(currentExamLabel())
      ].filter(Boolean);
      return (parts.join('-') || '学习目标成绩') + '.' + ext;
    }
    function visibleBodyRows() {
      return Array.prototype.filter.call(
        el.tableWrap.querySelectorAll('tbody tr'),
        function (tr) { return tr.style.display !== 'none'; }
      );
    }

    /* Excel：导出当前考试、当前勾选班级与搜索结果对应的总览表 */
    function exportExcel() {
      if (!inst.hasRows) { toast('暂无成绩数据可导出', 'err'); return; }
      if (typeof XLSX === 'undefined') { toast('表格组件未加载，请刷新页面重试', 'err'); return; }
      var table = el.tableWrap.querySelector('table.lm-data');
      if (!table) { toast('当前没有可导出的表格', 'err'); return; }
      try {
        var headers = Array.prototype.map.call(
          table.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
        var aoa = [];
        var title = (inst.campusName ? inst.campusName + ' · ' : '') + '学习目标成绩总览';
        var meta = '考试：' + currentExamLabel() +
          ' ｜ 导出时间 ' + fmtTime(new Date()) +
          ' ｜ 已选 ' + selectedClassObjs().length + ' 个班级';
        aoa.push([title]);
        aoa.push([meta]);
        aoa.push([]);
        aoa.push(headers);
        visibleBodyRows().forEach(function (tr) {
          aoa.push(Array.prototype.map.call(
            tr.querySelectorAll('td'), function (td) { return cellToValue(td.textContent); }));
        });
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = headers.map(function (h) {
          return { wch: Math.max(10, Math.min(24, String(h).length * 2 + 6)) };
        });
        var wb = XLSX.utils.book_new();
        var sheetName = (sanitizeFileName(currentExamLabel()) || '成绩总览').slice(0, 28);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, exportBaseName('xlsx'));
        toast('Excel 导出完成', 'ok');
      } catch (e) {
        console.error(e);
        toast('Excel 导出失败：' + e.message, 'err');
      }
    }

    function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    /* PDF：A4 横向，按内容块安全分页，长表按行边界切段，不跨页割裂 */
    async function exportPdf() {
      if (!inst.hasRows) { toast('暂无成绩数据可导出', 'err'); return; }
      if (typeof html2canvas === 'undefined' || !window.jspdf ||
        typeof window.jspdf.jsPDF !== 'function') {
        toast('PDF 组件未加载，请刷新页面重试', 'err'); return;
      }
      var prevBodyOverflow = document.body.style.overflow;
      var prevHtmlOverflow = document.documentElement.style.overflow;
      var area = inst.root;
      var prevAreaWidth = area.style.width;
      var widened = [];
      document.body.classList.add('lm-exporting');

      try {
        var needW = 0;
        area.querySelectorAll('.lm-table-wrap').forEach(function (sc) {
          if (sc.scrollWidth > needW) needW = sc.scrollWidth;
        });
        needW = needW ? needW + 40 : 0;

        var rect = area.getBoundingClientRect();
        if (needW > rect.width) {
          document.body.style.overflow = 'visible';
          document.documentElement.style.overflow = 'visible';
          area.style.width = needW + 'px';
          area.querySelectorAll('.lm-table-wrap').forEach(function (sc) {
            widened.push([sc, sc.style.overflow]);
            sc.style.overflow = 'visible';
          });
          await delay(380);
        }
        rect = area.getBoundingClientRect();

        var blockSel = ['.lm-filter-card', '.lm-stat-bar', '.lm-table-card'];
        var els = [];
        blockSel.forEach(function (s) {
          area.querySelectorAll(s).forEach(function (x) { els.push(x); });
        });
        els = Array.prototype.filter.call(els, function (x) {
          return x.getBoundingClientRect().height > 0;
        });

        var imgW = 297 - 16;
        var k0 = 2;
        var bandMm = 9;
        var mmPerPx = imgW / rect.width;
        var usablePx = (210 - 8 - 8 - bandMm) / mmPerPx;

        var blocks = els.map(function (x) {
          var r = x.getBoundingClientRect();
          return { el: x, top: r.top - rect.top, height: r.height };
        }).sort(function (a, b) { return a.top - b.top; });

        function flatten(rectItem) {
          if (rectItem.height <= usablePx) return [rectItem];
          var kids = Array.prototype.filter.call(rectItem.el.children, function (x) {
            return x.tagName !== 'COLGROUP' && x.tagName !== 'COL';
          }).map(function (x) {
            var r = x.getBoundingClientRect();
            var b = rectItem.el.getBoundingClientRect();
            return { el: x, top: (r.top - b.top) + rectItem.top, height: r.height };
          }).filter(function (x) { return x.height > 0; });
          if (!kids.length) return [rectItem];
          var out = [];
          kids.forEach(function (k) { flatten(k).forEach(function (u) { out.push(u); }); });
          return out;
        }

        var bins = [];
        blocks.forEach(function (b) { flatten(b).forEach(function (u) { bins.push(u); }); });
        bins.sort(function (a, b) { return a.top - b.top; });

        var dedup = [];
        bins.forEach(function (u) {
          var uBot = u.top + u.height;
          var contained = dedup.some(function (d) {
            return d.top - 1 <= u.top && d.top + d.height + 1 >= uBot;
          });
          if (!contained) {
            for (var i = dedup.length - 1; i >= 0; i--) {
              var d = dedup[i];
              if (u.top - 1 <= d.top && uBot >= d.top + d.height) dedup.splice(i, 1);
            }
            dedup.push(u);
          }
        });

        var pages = [];
        var cur = [];
        dedup.forEach(function (u) {
          if (cur.length) {
            var firstTop = cur[0].top;
            var newBottom = u.top + u.height;
            if (newBottom - firstTop > usablePx) { pages.push(cur); cur = []; }
          }
          cur.push(u);
        });
        if (cur.length) pages.push(cur);
        if (!pages.length) { toast('当前没有可导出的内容', 'err'); return; }

        var title = (inst.campusName ? inst.campusName + ' · ' : '') +
          '学习目标 · ' + currentExamLabel();
        var jsPDF = window.jspdf.jsPDF;
        var pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        var bandPx = Math.round(bandMm / mmPerPx * k0);
        var titleFont = Math.round(11 * k0);
        var prevBottom = 0;
        var pagesCount = pages.length;

        for (var i = 0; i < pagesCount; i++) {
          var pg = pages[i];
          var rawTop = Math.max(0, pg[0].top - 3);
          var topCss = Math.max(rawTop, prevBottom);
          var last = pg[pg.length - 1];
          var bottomCss = Math.min(rect.height, Math.max(topCss + 1, last.top + last.height + 3));
          prevBottom = bottomCss;
          var hCss = Math.max(1, bottomCss - topCss);

          var canvas = await html2canvas(area, {
            scale: k0,
            backgroundColor: '#ffffff',
            useCORS: true,
            windowWidth: Math.max(needW, rect.width),
            x: 0, y: topCss, width: rect.width, height: hCss + bandPx / k0
          });
          var contentH = Math.max(1, Math.round(hCss * k0));

          var tmp = document.createElement('canvas');
          tmp.width = canvas.width;
          tmp.height = Math.min(canvas.height, contentH + bandPx);
          var tctx = tmp.getContext('2d');
          tctx.fillStyle = '#ffffff';
          tctx.fillRect(0, 0, tmp.width, tmp.height);
          tctx.fillStyle = '#312e81';
          tctx.font = '700 ' + titleFont + 'px "Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';
          tctx.textBaseline = 'middle';
          tctx.fillText(title + (pagesCount > 1 ? '　(' + (i + 1) + '/' + pagesCount + ')' : ''),
            Math.round(6 * k0), Math.round(bandPx * 0.52));
          tctx.strokeStyle = 'rgba(79,70,229,.35)';
          tctx.lineWidth = Math.max(1, k0);
          tctx.beginPath();
          tctx.moveTo(0, bandPx - Math.max(1, k0));
          tctx.lineTo(tmp.width, bandPx - Math.max(1, k0));
          tctx.stroke();
          tctx.drawImage(canvas, 0, 0, canvas.width, contentH, 0, bandPx, canvas.width, contentH);

          if (i > 0) pdf.addPage();
          var hMm = (contentH + bandPx) / k0 * mmPerPx;
          pdf.addImage(tmp.toDataURL('image/jpeg', 0.92), 'JPEG', 8, 8, imgW, hMm);
        }
        pdf.save(exportBaseName('pdf'));
        toast('PDF 导出完成', 'ok');
      } catch (e) {
        console.error(e);
        toast('PDF 导出失败，可使用浏览器打印另存为 PDF', 'err');
      } finally {
        widened.forEach(function (x) { x[0].style.overflow = x[1]; });
        area.style.width = prevAreaWidth;
        document.body.style.overflow = prevBodyOverflow;
        document.documentElement.style.overflow = prevHtmlOverflow;
        document.body.classList.remove('lm-exporting');
      }
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
        return head + '<div class="lm-mini-note">尚未设置目标院校，请由老师在上传管理页填写。</div>';
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
      var pairs = selectedPairs();
      var hit = null;
      pairs.forEach(function (p) {
        p.exam.students.forEach(function (s) {
          if (s.name === name && !hit) hit = { p: p, student: s };
        });
      });
      if (!hit) return;
      var p = hit.p, classObj = p.classObj, exam = p.exam, examIdx = p.examIdx, student = hit.student;
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
          '<div class="lm-modal-block">' + prevExamBlock(classObj, examIdx, student, total) + '</div>' +
          '<div class="lm-modal-block">' + targetBlock(classObj, student, converted) + '</div>' +
          '<div class="lm-modal-block">' + reachableBlock(classObj, student, total, proj) + '</div>' +
          adviceBlock(classObj, exam, examIdx, student, d, stats) +
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
            '<div class="lm-info-item"><span>2026 最高投档分</span><b>' + (info.maxScore != null ? esc(info.maxScore) + ' 分' : '—') + '</b></div>' +
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

    /* ==================== 目标文件自动拉取（只读，不上传） ==================== */
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
        openSchool(sl.getAttribute('data-cid'), sl.getAttribute('data-name'));
      }
    }

    /* ==================== 构建 DOM ==================== */
    function buildDOM() {
      inst.root.innerHTML =
        '<div class="lm-root">' +
          /* 筛选卡：班级选择复用顶部筛选条，此处仅考试 + 搜索 */
          '<div class="lm-card lm-filter-card">' +
            '<div class="lm-filter-head">' +
              '<div class="lm-data-status" id="lmDataStatus">正在加载数据…</div>' +
              '<div class="lm-search-box" style="flex:1;max-width:320px">' +
                '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
                '<input type="search" id="lmSearch" placeholder="输入姓名快速定位…" style="width:100%">' +
              '</div></div>' +
            '<div class="lm-chip-row">' +
              '<span class="lm-chip-label">考试</span>' +
              '<div class="lm-chips" id="lmExamChips"></div>' +
            '</div>' +
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
              '<h3>暂无成绩数据</h3><p>请先在顶部勾选班级，或先加载校区成绩文件</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
        /* 学生弹窗 */
        '<div class="lm-mask" id="lmStudentMask"><div class="lm-modal" id="lmStudentModal"></div></div>' +
        /* 院校弹窗 */
        '<div class="lm-mask" id="lmSchoolMask" style="z-index:210"><div class="lm-modal" id="lmSchoolModal"></div></div>';

      el.dataStatus = inst.root.querySelector('#lmDataStatus');
      el.examChips = inst.root.querySelector('#lmExamChips');
      el.statBar = inst.root.querySelector('#lmStatBar');
      el.tableWrap = inst.root.querySelector('#lmTableWrap');
      el.emptyTip = inst.root.querySelector('#lmEmptyTip');
      el.searchInput = inst.root.querySelector('#lmSearch');
      el.studentMask = inst.root.querySelector('#lmStudentMask');
      el.studentModal = inst.root.querySelector('#lmStudentModal');
      el.schoolMask = inst.root.querySelector('#lmSchoolMask');
      el.schoolModal = inst.root.querySelector('#lmSchoolModal');

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
    renderDataStatus();
    renderExamChips();
    renderOverview();
    loadTarget(false);

    return {
      refresh: function () {
        renderDataStatus();
        renderExamChips();
        renderOverview();
      },
      setGradeData: function (gd) {
        inst.gradeData = alignGradeData(gd);
        /* 重新载入成绩后回到最新一次考试 */
        inst.examTouched = false;
        renderDataStatus();
        renderExamChips();
        renderOverview();
      },
      /* 导出能力上交给校区页右上角「导出报告」菜单 */
      exportExcel: exportExcel,
      exportPdf: exportPdf,
      hasData: function () { return inst.hasRows; }
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
