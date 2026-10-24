/* ============================================================
   ui.js — 共享 UI：Toast 提示、院校信息弹窗
   ============================================================ */

(function (global) {
  'use strict';

  /* ---------- Toast ---------- */
  var toastWrap = null;
  function ensureToastWrap() {
    if (!toastWrap) {
      toastWrap = document.createElement('div');
      toastWrap.className = 'toast-wrap';
      document.body.appendChild(toastWrap);
    }
    return toastWrap;
  }

  function toast(msg, type) {
    var w = ensureToastWrap();
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    w.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 320);
    }, 2400);
  }

  /* ---------- 院校信息弹窗 ---------- */
  var mask = null;

  function esc(s) {
    return AppCore.trim(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function badge(text, cls) {
    return '<span class="badge ' + (cls || 'teal') + '">' + esc(text) + '</span>';
  }

  function renderSchool(info) {
    var majorsRows = info.majors.map(function (m) {
      return '<tr>' +
        '<td style="text-align:left;white-space:normal;min-width:220px">' + esc(m.major) + '</td>' +
        '<td>' + (m.score != null ? esc(m.score) : '<span class="muted-cell">—</span>') + '</td>' +
        '<td>' + (m.plan ? esc(m.plan) : '—') + '</td>' +
        '<td>' + (m.years ? esc(m.years) + '年' : '—') + '</td>' +
        '<td>' + (m.fee ? esc(m.fee) : '—') + '</td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="modal-head">' +
        '<div style="min-width:0">' +
          '<h3>' + esc(info.name) + '</h3>' +
          '<div class="mh-sub">' +
            badge(info.categoryName, 'indigo') +
            (info.nature ? badge(info.nature, info.nature.indexOf('公办') >= 0 ? 'green' : 'amber') : '') +
            (info.region ? badge(info.region, 'gray') : '') +
          '</div>' +
        '</div>' +
        '<button class="modal-close" data-modal-close aria-label="关闭">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="info-grid">' +
          '<div class="info-item"><span>2026 最低投档分</span><b>' + (info.minScore != null ? esc(info.minScore) + ' 分' : '—') + '</b></div>' +
          '<div class="info-item"><span>2026 最高投档分</span><b>' + (info.maxScore != null ? esc(info.maxScore) + ' 分' : '—') + '</b></div>' +
          '<div class="info-item"><span>最低分对应累计位次</span><b>' + (info.rank != null ? '第 ' + esc(info.rank) + ' 位' : '—') + '</b></div>' +
          (info.region ? '<div class="info-item"><span>所在地区</span><b>' + esc(info.region) + '</b></div>' : '') +
          (info.nature ? '<div class="info-item"><span>办学性质</span><b>' + esc(info.nature) + '</b></div>' : '') +
        '</div>' +
        (info.address ? '<div class="info-item" style="margin-bottom:14px"><span>院校地址</span><b>' + esc(info.address) + '</b></div>' : '') +
        '<div class="card-title" style="margin-bottom:9px"><span class="bar"></span>招生专业（' + info.majors.length + ' 个）</div>' +
        '<div class="table-wrap" style="max-height:340px;overflow:auto">' +
          '<table class="data">' +
            '<thead><tr>' +
              '<th style="text-align:left">专业名称</th><th>投档最低分</th><th>计划数</th><th>学制</th><th>学费(元/年)</th>' +
            '</tr></thead>' +
            '<tbody>' + majorsRows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';
  }

  function ensureMask() {
    if (mask) return mask;
    mask = document.createElement('div');
    mask.className = 'modal-mask';
    var modal = document.createElement('div');
    modal.className = 'modal';
    mask.appendChild(modal);
    document.body.appendChild(mask);

    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.hasAttribute('data-modal-close') ||
        (e.target.closest && e.target.closest('[data-modal-close]'))) {
        closeModal();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
    return mask;
  }

  function openModal(html) {
    var m = ensureMask();
    m.querySelector('.modal').innerHTML = html;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    if (mask) mask.classList.remove('show');
    var sm = document.getElementById('studentMask');
    document.body.style.overflow = (sm && sm.classList.contains('show')) ? 'hidden' : '';
  }

  function openSchool(cid, name) {
    var info = AppCore.resolveSchool(cid, name);
    if (!info) { toast('未找到该院校信息：' + name, 'err'); return; }
    openModal(renderSchool(info));
  }

  global.UI = {
    toast: toast,
    esc: esc,
    openModal: openModal,
    closeModal: closeModal,
    renderSchool: renderSchool,
    openSchool: openSchool
  };

})(window);
