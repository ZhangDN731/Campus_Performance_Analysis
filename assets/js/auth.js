/* ==========================================================================
 * 平行世界 · 龙泉校区 —— 登录 / 注册 / 审核 / 后台模块
 * · 未登录时页面与原版龙泉校区完全一致（无 F8、无班级锁定）
 * · 审核员 admin / admin：可审核注册申请、管理教师账号、给教师设置默认班级
 * · 教师账号：姓名全拼，默认密码 123456；用默认密码登录会提示改密
 * · 登录后只显示：达标率 / 四线达标率 / 全班成绩 / 学习目标 / 单科分析报告
 * ========================================================================== */
(function () {
  'use strict';

  /* 账号 / 审核 / 默认班级统一存进一个数据库对象，只占一个 localStorage 键 */
  const LS_DB = 'pw_lq_db_v2';
  const LS_DB_OLD = 'pw_lq_accounts_v1';   /* v1 旧键，读取时自动迁移并删除 */
  const LS_SESSION = 'pw_lq_session_v1';    /* 只放"当前登录的是谁"，不算账号数据 */
  const DB_VERSION = 3;

  /* 姓名 → 拼音（预置教师，注册时可自动生成账号） */
  const PY = {
    '周景辉': 'zhoujinghui', '颜立营': 'yanliying', '吴恩乐': 'wuenle',
    '陈莹哲': 'chenyingzhe', '杜翠花': 'ducuihua', '张迪楠': 'zhangdinan',
    '王玄烨': 'wangxuanye', '杜得京': 'dudejing', '徐静娜': 'xujingna',
    '尹雅蕾': 'yinyalei', '贾晓迈': 'jiaxiaomai', '王敏婕': 'wangminjie',
    '李欣茹': 'lixinru', '张洁': 'zhangjie', '杜佳雯': 'dujiawen',
    '赵晓亚': 'zhaoxiaoya', '丁然': 'dingran'
  };

  /* 预置教师（科目名与成绩表一致：信息技术） */
  /* 赵晓亚（语文）、丁然（数学）为学科组长，可在个人 / 组长身份间切换 */
  const LEADERS = ['赵晓亚', '丁然'];
  const SEED = [
    { name: '周景辉', subject: '物理' }, { name: '颜立营', subject: '历史' },
    { name: '吴恩乐', subject: '政治' }, { name: '陈莹哲', subject: '英语' },
    { name: '杜翠花', subject: '信息技术' }, { name: '张迪楠', subject: '信息技术' },
    { name: '王玄烨', subject: '数学' }, { name: '杜得京', subject: '数学' },
    { name: '徐静娜', subject: '语文' }, { name: '尹雅蕾', subject: '语文' },
    { name: '贾晓迈', subject: '化学' }, { name: '王敏婕', subject: '地理' },
    { name: '李欣茹', subject: '美术' }, { name: '张洁', subject: '生物' },
    { name: '杜佳雯', subject: '语文' }, { name: '赵晓亚', subject: '语文' },
    { name: '丁然', subject: '数学' }
  ];

  /* 旧数据里写过「计算机」，读入时统一换成「信息技术」 */
  const SUBJECT_ALIAS = { '计算机': '信息技术', '信息技术': '信息技术' };
  const DEFAULT_PWD = '123456';
  const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '信息技术', '美术'];

  /* ---------- 三校区共用一套数据库：账号带校区，班级分组按校区隔离 ---------- */
  const CAMPUSES = ['龙泉校区', '星耀校区', '睿智校区'];
  const CAMPUS = (typeof CAMPUS_CONFIG !== 'undefined' && CAMPUS_CONFIG.name) || '龙泉校区';
  /* 龙泉校区人员由管理员统一维护，不开放自助注册；星耀 / 睿智 可老师自己注册，也可由 admin 建号 */
  const SELF_REG = CAMPUS !== '龙泉校区';

  /* 各角色可见的核心页签 */
  const PAGES_BASE = ['f6', 'f7', 'f5', 'f4b', 'f3a', 'f1a'];
  const PAGES_ADMIN = PAGES_BASE.concat(['f8', 'f9']);
  const PAGES_TEACHER = PAGES_BASE.concat(['f8', 'f9', 'f10']);

  let db = null;
  let view = 'login';
  let msg = null;
  let draft = {};
  let editUser = null;      /* 后台：正在编辑默认班级的账号 */
  let editSubject = null;   /* 后台：当前选中的科目分组（旧版按科目共用，保留兼容） */
  let editTeacher = null;   /* 后台：当前正在分配默认班级的老师账号 */
  let selUsers = new Set(); /* 后台：账号表里勾选待批量删除的账号 */
  let adminTab = 'pending';
  let adminCampus = '全部'; /* 后台：账号表默认看全部三校区，可用小胶囊切换 */

  /* ---------------- 基础工具 ---------------- */
  function nowStr() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  /* ---------------- 数据库（单一对象） ----------------
   * pw_lq_db_v2 = { v, updatedAt, users[], subjectClasses{}, logs[] }
   * users: 账号 + 审核状态 + 身份 + 密码状态全在里面
   * subjectClasses: { '语文': ['9类1','10类'], ... } 默认班级按科目分组
   */
  function seedUsers() {
    const users = [{
      u: 'admin', name: '审核员', role: 'admin', subject: '', pwd: 'admin', campus: '全部',
      defaultPwd: false, status: 'active', classes: [], createdAt: '系统内置'
    }];
    SEED.forEach(t => {
      users.push({
        u: PY[t.name], name: t.name, role: 'teacher', subject: t.subject, campus: '龙泉校区',
        pwd: DEFAULT_PWD, defaultPwd: true, status: 'active', classes: [], createdAt: '预置账号', seed: true,
        isLeader: LEADERS.indexOf(t.name) >= 0, mode: 'self'
      });
    });
    return users;
  }
  function emptyCampusMap() {
    const o = {};
    CAMPUSES.forEach(c => { o[c] = { subjectClasses: {} }; });
    return o;
  }
  function emptyDB() {
    return {
      v: DB_VERSION, updatedAt: nowStr(), users: seedUsers(),
      campuses: emptyCampusMap(),
      subjectClasses: {},           /* 兼容旧字段，迁移时并入「龙泉校区」 */
      logs: []
    };
  }
  function loadDB() {
    /* 1) 新库 */
    try {
      const raw = localStorage.getItem(LS_DB);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && Array.isArray(o.users) && o.users.length) { migrate(o); return o; }
      }
    } catch (e) { console.warn('数据库读取失败', e); }
    /* 2) 旧键自动迁移（只迁一次，迁完删掉旧键） */
    try {
      const raw = localStorage.getItem(LS_DB_OLD);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && Array.isArray(o.users) && o.users.length) {
          const n = {
            v: DB_VERSION, updatedAt: nowStr(), users: o.users,
            campuses: emptyCampusMap(), subjectClasses: o.subjectClasses || {}, logs: []
          };
          migrate(n);
          saveDB(n);
          try { localStorage.removeItem(LS_DB_OLD); } catch (e) {}
          return n;
        }
      }
    } catch (e) { console.warn('旧数据迁移失败', e); }
    /* 3) 首次：写入初始库 */
    const o = emptyDB();
    saveDB(o);
    return o;
  }
  /* 老数据/外部导入的归一化：补版本、补校区、补组长标记、补身份、统一科目名 */
  function migrate(o) {
    o.v = DB_VERSION;
    if (!o.updatedAt) o.updatedAt = nowStr();
    if (!o.campuses) o.campuses = emptyCampusMap();
    CAMPUSES.forEach(c => {
      if (!o.campuses[c]) o.campuses[c] = { subjectClasses: {} };
      if (!o.campuses[c].subjectClasses) o.campuses[c].subjectClasses = {};
    });
    /* 旧版扁平 subjectClasses → 龙泉校区 */
    if (!o.subjectClasses) o.subjectClasses = {};
    const lq = o.campuses['龙泉校区'].subjectClasses;
    Object.keys(o.subjectClasses).forEach(k => {
      if (!lq[k] || !lq[k].length) lq[k] = o.subjectClasses[k];
    });
    delete o.subjectClasses;
    if (!Array.isArray(o.logs)) o.logs = [];
    if (!Array.isArray(o.users)) o.users = [];
    /* 科目名统一（计算机 → 信息技术） */
    CAMPUSES.forEach(c => {
      const map = o.campuses[c].subjectClasses;
      const oldKeys = Object.keys(map).filter(k => !SUBJECTS.includes(k) && mapSubject(k) && mapSubject(k) !== k);
      oldKeys.forEach(k => {
        const nk = mapSubject(k);
        if (!(map[nk] || []).length) map[nk] = map[k];
        delete map[k];
      });
    });
    o.users.forEach(u => {
      u.subject = u.subject ? mapSubject(u.subject) : '';
      if (!u.campus) u.campus = (u.role === 'admin' ? '全部' : '龙泉校区');
      if (u.role === 'admin') return;
      if (typeof u.isLeader === 'undefined') u.isLeader = LEADERS.indexOf(u.name) >= 0;
      if (!u.mode) u.mode = 'self';
      if (!u.status) u.status = 'active';
      if (typeof u.defaultPwd === 'undefined') u.defaultPwd = (u.pwd === DEFAULT_PWD);
      const cm = o.campuses[u.campus] ? o.campuses[u.campus].subjectClasses : null;
      if (!cm) return;
      const key = mapSubject(u.subject) || '未设科目';
      if (Array.isArray(u.classes) && u.classes.length && !(cm[key] || []).length) {
        cm[key] = u.classes.slice();
      }
    });
  }
  function saveDB(o) {
    db = o || db;
    db.updatedAt = nowStr();
    try { localStorage.setItem(LS_DB, JSON.stringify(db)); } catch (e) { console.warn('数据库保存失败', e); }
  }
  function logAct(text) {
    if (!db) return;
    if (!Array.isArray(db.logs)) db.logs = [];
    db.logs.push({ t: nowStr(), text: String(text) });
    if (db.logs.length > 200) db.logs = db.logs.slice(-200);
  }
  function findUser(u) {
    if (!u) return null;
    if (!db) db = loadDB();   /* 成绩数据可能先于 auth 初始化回调，这里兜底 */
    if (!db || !Array.isArray(db.users)) return null;
    const key = String(u).toLowerCase();
    return db.users.find(x => String(x.u).toLowerCase() === key) || null;
  }
  function sessionName() {
    try { return localStorage.getItem(LS_SESSION) || ''; } catch (e) { return ''; }
  }
  function currentUser() {
    const n = sessionName();
    if (!n) return null;
    const u = findUser(n);
    if (!u || u.status !== 'active') return null;
    /* 登录态带校区：账号不属于当前校区就视为未登录（admin 除外，可跨校区） */
    if (u.role !== 'admin' && u.campus && u.campus !== CAMPUS) return null;
    return u;
  }
  function isAdmin() {
    const u = currentUser();
    return !!(u && u.role === 'admin');
  }
  function mapSubject(s) {
    if (!s) return '';
    return SUBJECT_ALIAS[s] || s;
  }
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function statusText(u) {
    if (u.status === 'pending') return '待审核';
    if (u.status === 'disabled') return '已停用';
    return '正常';
  }
  function classList() {
    try { return (typeof state !== 'undefined' && state.classList) ? state.classList.slice() : []; } catch (e) { return []; }
  }

  /* ---------------- 布局应用：页签 + 班级锁定 + 管理台 ---------------- */
  function applyTabs() {
    if (typeof TOP_TABS === 'undefined' || !Array.isArray(TOP_TABS)) return;
    const core = TOP_TABS.find(g => g.id === 'core');
    if (!core) return;
    if (!window.__AUTH_REG) {
      const reg = {};
      TOP_TABS.forEach(g => g.pages.forEach(p => { reg[p.id] = p; }));
      window.__AUTH_REG = reg;
    }
    const reg = window.__AUTH_REG;
    const u = currentUser();
    const isAdmin = !!(u && u.role === 'admin');
    const ids = !u ? PAGES_BASE.slice() : (u.role === 'teacher' ? PAGES_TEACHER.slice() : []);

    /* 审核员登录后不再展示成绩分析页签，整页只剩管理台 */
    document.body.classList.toggle('pw-admin', isAdmin);
    const tabsBar = document.querySelector('.main-tabs');
    const subBar = document.querySelector('.sub-tabs');
    if (tabsBar) tabsBar.style.display = isAdmin ? 'none' : '';
    if (subBar) subBar.style.display = isAdmin ? 'none' : '';
    if (isAdmin) { renderAdminConsole(); return; }

    core.pages = ids.map(id => reg[id]).filter(Boolean);

    const extra = TOP_TABS.find(g => g.id === 'extra');
    /* 登录只是加权限，不削减原有页面：教师同样保留「拓展分析」 */
    const hideExtra = false;
    document.querySelectorAll('.main-tab').forEach(b => {
      if (b.dataset.top === 'extra') b.style.display = hideExtra ? 'none' : '';
    });
    if (hideExtra && (!state || state.topTab === 'extra')) {
      try { state.topTab = 'core'; } catch (e) {}
    }
    if (state && core.pages.length && !core.pages.some(p => p.id === state.currentPage)) {
      state.currentPage = core.pages[0].id;
    }
    if (typeof renderTabs === 'function') renderTabs();
    if (extra && hideExtra && !extra.pages.length) extra.pages = [];
  }

  /* 审核员专用：登录后直接进入整页管理台（教师管理为主界面，不再有控制台卡片） */
  function renderAdminConsole() {
    const mask = el('authMask');
    if (view === 'admin' && mask && mask.classList.contains('show')) return;
    adminTab = 'users';
    openAdmin('users');
    /* 页面成绩数据是异步载入的，稍后补刷一次，保证「默认班级」列不是暂无数据 */
    setTimeout(function () {
      try { if (view === 'admin' && isAdmin()) renderCard(); } catch (e) {}
    }, 1200);
  }

  /* 默认班级按「任课科目」划分：同一校区的同科目教师共享同一组默认班级 */
  function subjectKey(u) { return mapSubject(u && u.subject) || '未设科目'; }
  function campusSubjectClasses(campus) {
    if (!db.campuses) db.campuses = emptyCampusMap();
    const c = CAMPUSES.indexOf(campus) >= 0 ? campus : '龙泉校区';
    if (!db.campuses[c]) db.campuses[c] = { subjectClasses: {} };
    if (!db.campuses[c].subjectClasses) db.campuses[c].subjectClasses = {};
    return db.campuses[c].subjectClasses;
  }
  /* 教师按自己所在校区；admin 按后台选中的校区 */
  function classCampus() {
    const u = currentUser();
    if (u && u.role === 'admin') return adminCampus;
    return CAMPUS;
  }
  function classesOfSubject(subKey) {
    const arr = campusSubjectClasses(classCampus())[subKey];
    return Array.isArray(arr) ? arr.slice() : [];
  }
  function saveClassesOfSubject(subKey, arr) {
    campusSubjectClasses(classCampus())[subKey] = arr.slice();
    saveDB();
  }
  /* 任课科目在成绩数据里出现过的全部班级（登录后默认就是这个范围） */
  function subjectDataClasses(sub) {
    try {
      if (!sub || typeof state === 'undefined' || !state.classList) return [];
      if (typeof getClassSubjects !== 'function') return [];
      return state.classList.filter(c => getClassSubjects(c).indexOf(sub) >= 0);
    } catch (e) { return []; }
  }
  function effectiveClasses(u) {
    if (!u || u.role === 'admin') return [];
    /* 管理员按「单个老师」指定过的，严格按该老师自己的清单（可以是空） */
    if (u.clsSet === true && Array.isArray(u.classes)) return u.classes.slice();
    const sub = mapSubject(u.subject);
    const map = campusSubjectClasses(u.campus || '龙泉校区');
    const conf = Array.isArray(map[sub]) ? map[sub] : [];   /* 旧版按科目组设过，沿用 */
    if (conf.length) return conf.slice();
    return subjectDataClasses(sub);       /* 否则默认本科目全部班级 */
  }

  function lockedClasses() {
    const u = currentUser();
    if (!u || u.role !== 'teacher') return null;
    if (u.mode === 'leader') return null;   /* 组长视角：不限班级 */
    const arr = effectiveClasses(u);
    return arr.length ? arr : null;
  }

  function applyClassLock(reRender) {
    const box = el('globalClassWrap');
    if (!box) return;
    const lock = lockedClasses();
    if (!lock) {
      /* 从「个人」切到「组长」：把被隐藏的班级全部放出来 */
      if (window.__AUTH_LOCK_SIG !== '') {
        restoreAllClasses();
        const acts0 = box.parentElement && box.parentElement.querySelector('.group-actions');
        if (acts0) acts0.style.display = '';
        window.__AUTH_LOCK_SIG = '';
        try { autoSetScoreLines && autoSetScoreLines(); } catch (e) {}
        try { if (reRender && state && state.currentPage) renderCurrentPage(); } catch (e) {}
      }
      return;
    }
    const sig = lock.join('|');
    const items = Array.prototype.slice.call(box.querySelectorAll('.checkbox-item'));
    if (!items.length) return;
    /* 自我校正：只要实际勾选/隐藏状态与锁定不一致就重设，防止页面重建勾选框后失效 */
    const okNow = items.every(it => {
      const inp = it.querySelector('input');
      if (!inp) return true;
      const inLock = lock.indexOf(inp.value) >= 0;
      return inLock ? (inp.checked && it.style.display !== 'none') : (!inp.checked && it.style.display === 'none');
    });
    if (okNow && !reRender) { window.__AUTH_LOCK_SIG = sig; return; }
    window.__AUTH_LOCK_SIG = sig;
    let changed = !okNow;
    items.forEach(it => {
      const inp = it.querySelector('input');
      if (!inp) return;
      const inLock = lock.indexOf(inp.value) >= 0;
      it.style.display = inLock ? '' : 'none';
      if (inp.checked !== inLock) { inp.checked = inLock; changed = true; }
      it.classList.toggle('checked', inp.checked);
      inp.disabled = false;
    });
    const acts = box.parentElement && box.parentElement.querySelector('.group-actions');
    if (acts) acts.style.display = lock ? 'none' : '';

    if (changed) {
      try { autoSetScoreLines && autoSetScoreLines(); } catch (e) {}
      try { if (reRender && state && state.currentPage) renderCurrentPage(); } catch (e) {}
    }
  }

  /* 退出登录后班级勾选恢复成原版「全选」的样子 */
  function restoreAllClasses() {
    const box = el('globalClassWrap');
    if (!box) return false;
    let changed = false;
    Array.prototype.slice.call(box.querySelectorAll('.checkbox-item')).forEach(it => {
      const inp = it.querySelector('input');
      if (!inp) return;
      if (it.style.display === 'none') { it.style.display = ''; changed = true; }
      if (!inp.checked) { inp.checked = true; changed = true; }
      it.classList.toggle('checked', true);
    });
    return changed;
  }

  /* 教师登录后科目勾选默认落到本人任课科目；只做一次，之后用户手动改不再覆盖 */
  function applySubjectDefault() {
    const u = currentUser();
    if (!u || u.role !== 'teacher' || u.mode === 'leader') return;
    const sub = mapSubject(u.subject);
    if (!sub) return;
    const box = el('globalSubjectWrap');
    if (!box) return;
    const items = Array.prototype.slice.call(box.querySelectorAll('.checkbox-item'));
    if (!items.length) return;
    const has = items.some(it => {
      const inp = it.querySelector('input');
      return inp && inp.value === sub;
    });
    if (!has) return;
    const sig = u.u + '|' + sub + '|' + items.length;
    if (window.__AUTH_SUBJ_SIG === sig) return;
    window.__AUTH_SUBJ_SIG = sig;
    let changed = false;
    items.forEach(it => {
      const inp = it.querySelector('input');
      if (!inp) return;
      const on = inp.value === sub;
      if (inp.checked !== on) { inp.checked = on; changed = true; }
      it.classList.toggle('checked', on);
    });
    if (changed) {
      try { autoSetScoreLines && autoSetScoreLines(); } catch (e) {}
    }
  }

  function applyAll(reRender) {
    if (reRender) window.__AUTH_LOCK_SIG = null;
    const admin = isAdmin();
    const area = el('contentArea') || document.querySelector('.content-area');
    if (area && !admin) area.dataset.adminConsole = '0';
    try { applyTabs(); } catch (e) { console.warn('页签应用失败', e); }
    try { applyClassLock(false); } catch (e) { console.warn('班级锁定失败', e); }
    if (reRender) { try { applySubjectDefault(); } catch (e) { console.warn('科目默认失败', e); } }
    renderEntry();
    if (reRender && !admin) {
      try {
        if (typeof renderTabs === 'function') renderTabs();
        if (typeof state !== 'undefined' && state.currentPage) renderCurrentPage();
      } catch (e) { console.warn('重绘失败', e); }
    }
  }

  /* F8 用：教师登录后默认带出自己的名字 */
  window.Auth = {
    currentUser: currentUser,
    isAdmin: isAdmin,
    teacherDefault: function (cls, sub) {
      const u = currentUser();
      if (!u || u.role !== 'teacher') return '';
      if (mapSubject(u.subject) !== sub) return '';
      return u.name;
    },
    teacherSubject: function () {
      const u = currentUser();
      return u && u.role === 'teacher' ? mapSubject(u.subject) : '';
    },
    mode: function () {
      const u = currentUser();
      return (u && u.role === 'teacher' && u.mode === 'leader') ? 'leader' : 'self';
    },
    /* 登录后可选/可导出的班级范围：教师=本科目全部班级，组长=全部班级 */
    myClasses: function () {
      const u = currentUser();
      if (!u || u.role !== 'teacher') return [];
      if (u.mode === 'leader') return (typeof state !== 'undefined' && state.classList) ? state.classList.slice() : [];
      return effectiveClasses(u);
    },
    /* 任课老师下拉备选：本校区在职教师姓名 */
    teacherNames: function () {
      return db.users.filter(x => x.role === 'teacher' && x.status === 'active' && (x.campus || '龙泉校区') === CAMPUS).map(x => x.name);
    },
    campus: CAMPUS,
    afterDataReady: function () {
      applyAll(true);
    },
    /* 原页切到「学习目标」会清空班级勾选，教师账号要立刻把锁定班级补回来 */
    afterGoalsClear: function () {
      if (!lockedClasses()) return;
      window.__AUTH_LOCK_SIG = null;
      applyClassLock(false);
    }
  };

  /* ---------------- 顶部入口按钮 ---------------- */
  function renderEntry() {
    const btn = el('authEntry');
    if (!btn) return;
    const u = currentUser();
    const av = el('authAvatar'), nm = el('authName');
    if (!u) {
      btn.classList.remove('logged');
      if (av) av.textContent = '登';
      if (nm) nm.textContent = '登录';
      btn.title = '登录后可查看成绩分析';
    } else {
      btn.classList.add('logged');
      if (av) av.textContent = u.name.slice(-1);
      if (nm) nm.textContent = u.name + (u.role === 'admin' ? '（管理员）' : '');
      btn.title = '点击打开个人界面';
    }
  }

  /* ---------------- 弹窗骨架 ---------------- */
  function open_(v) {
    view = v || 'login';
    msg = null;
    const mask = el('authMask');
    if (!mask) return;
    mask.classList.add('show');
    mask.setAttribute('aria-hidden', 'false');
    renderCard();
  }
  function close_() {
    const mask = el('authMask');
    if (!mask) return;
    mask.classList.remove('show');
    mask.classList.remove('admin-mode');
    mask.setAttribute('aria-hidden', 'true');
  }
  /* 管理台卡片入口：直接打开后台对应页签 */
  function openAdmin(tab) {
    if (!isAdmin()) return;
    view = 'admin';
    adminTab = tab || 'pending';
    msg = null;
    open_('admin');
  }
  window.__openAdmin = openAdmin;
  function head(title, extra) {
    return '<div class="auth-head"><div class="auth-title">' + esc(title) + '</div>' +
      (extra || '') +
      '<button class="auth-x" type="button" data-act="close" aria-label="关闭">×</button></div>';
  }
  function msgHtml() {
    if (!msg) return '<div class="auth-msg"></div>';
    return '<div class="auth-msg ' + (msg.type || 'err') + '">' + esc(msg.text) + '</div>';
  }
  function loginView() {
    return head('登录 · ' + CAMPUS) +
      '<div class="auth-tabs">' +
        '<button class="on" data-act="tab-login" type="button">登录</button>' +
        (SELF_REG ? '<button data-act="tab-register" type="button">注册</button>' : '') +
      '</div>' +
      '<form id="authLoginForm" class="auth-form">' +
        '<label><span>账号</span><input id="liUser" autocomplete="username" value="' + esc(draft.u || '') + '" placeholder="如 zhangsan"></label>' +
        '<label><span>密码</span><input id="liPwd" type="password" autocomplete="current-password" placeholder="请输入密码"></label>' +
        msgHtml() +
        '<button class="btn btn-primary auth-submit" type="submit">登录</button>' +
        (SELF_REG
          ? '<p class="auth-tip">没有账号？点上方「注册」提交申请，管理员审核通过后即可登录；管理员也直接在后台建号。</p>'
          : '<p class="auth-tip">本校区账号由管理员统一创建。忘记账号或密码请联系管理员，不开放自助注册。</p>') +
      '</form>';
  }
  function registerView() {
    const opts = SUBJECTS.map(s => '<option value="' + s + '"' + (draft.subject === s ? ' selected' : '') + '>' + s + '</option>').join('');
    return head('注册 · ' + CAMPUS) +
      '<div class="auth-tabs">' +
        '<button data-act="tab-login" type="button">登录</button>' +
        '<button class="on" data-act="tab-register" type="button">注册</button>' +
      '</div>' +
      '<form id="authRegForm" class="auth-form">' +
        '<label><span>姓名</span><input id="rgName" value="' + esc(draft.name || '') + '" placeholder="如 张三" autocomplete="name"></label>' +
        '<label><span>任课科目</span><select id="rgSubject">' + opts + '</select></label>' +
        '<label><span>账号</span><input id="rgUser" value="' + esc(draft.ru || '') + '" placeholder="如 zhangsan" autocomplete="username">' +
          '<button class="auth-mini" type="button" data-act="gen-pinyin">按姓名生成</button></label>' +
        '<label><span>密码</span><input id="rgPwd" type="password" value="' + esc(draft.pwd || '') + '" placeholder="至少 6 位"></label>' +
        msgHtml() +
        '<button class="btn btn-primary auth-submit" type="submit">提交注册申请</button>' +
        '<p class="auth-tip">申请会记在「' + esc(CAMPUS) + '」，提交后状态为「待审核」，管理员通过后才能登录。</p>' +
      '</form>';
  }
  function pendingView() {
    return head('提交成功') +
      '<div class="auth-body">' +
        '<div class="auth-ok">✓ 注册申请已提交</div>' +
        '<p class="auth-tip">账号 <b>' + esc(msg && msg.text || '') + '</b> 已进入待审核队列。' +
        '请等待管理员审核通过后，再用该账号登录。</p>' +
        '<button class="btn" type="button" data-act="tab-login">返回登录</button>' +
      '</div>';
  }
  function changePwdView() {
    const u = currentUser();
    const forced = !!(u && (u.pwd === DEFAULT_PWD || u.defaultPwd));
    return head('修改密码') +
      '<div class="auth-body">' +
        (forced ? '<div class="auth-warn">你正在使用初始密码，请先修改为本人的密码。</div>' : '') +
        '<form id="authPwdForm" class="auth-form">' +
          '<label><span>新密码</span><input id="npwNew" type="password" placeholder="至少 6 位"></label>' +
          '<label><span>确认新密码</span><input id="npwNew2" type="password" placeholder="再输入一次"></label>' +
          msgHtml() +
          '<div class="auth-row">' +
            '<button class="btn btn-primary" type="submit">保存新密码</button>' +
            '<button class="btn" type="button" data-act="close">稍后再说</button>' +
          '</div>' +
        '</form>' +
      '</div>';
  }
  function profileView() {
    const u = currentUser();
    if (!u) return loginView();
    const cls = effectiveClasses(u);
    const leader = !!(u.isLeader && u.role !== 'admin');
    const leaderMode = leader && u.mode === 'leader';
    return head(u.role === 'admin' ? '管理员界面' : '教师个人界面') +
      '<div class="auth-body">' +
        '<div class="auth-profile">' +
          '<div class="auth-profile-avatar">' + esc(u.name.slice(-1)) + '</div>' +
          '<div class="auth-profile-main">' +
            '<div class="auth-profile-name">' + esc(u.name) +
              (u.role === 'admin' ? '<span class="auth-badge admin">审核员</span>'
                : leader ? '<span class="auth-badge">' + (leaderMode ? '组长' : '教师') + '</span>'
                : '<span class="auth-badge">教师</span>') +
            '</div>' +
            '<div class="auth-profile-sub">账号 ' + esc(u.u) +
              (u.role === 'admin' ? ' · 三校区管理员' : ' · ' + esc(u.campus || CAMPUS)) +
              (u.subject ? ' · 任课科目 ' + esc(u.subject) : '') +
              (leader ? ' · 学科组长' : '') +
              ' · ' + statusText(u) + '</div>' +
          '</div>' +
        '</div>' +
        msgHtml() +
        (leader
          ? '<div class="auth-role-switch">' +
              '<button class="' + (leaderMode ? '' : 'on') + '" type="button" data-act="mode-self">个人</button>' +
              '<button class="' + (leaderMode ? 'on' : '') + '" type="button" data-act="mode-leader">组长</button>' +
            '</div>' +
            '<p class="auth-tip">个人视角：只统计分配给自己的默认班级；组长视角：不限班级，可查看全校区本科目数据。</p>'
          : '') +
        '<div class="auth-meta">' +
          '<div class="auth-meta-item"><span>任课教师</span><b>' + esc(u.name) + '</b></div>' +
          '<div class="auth-meta-item"><span>任课科目</span><b>' + esc(u.subject || '-') + '</b></div>' +
          '<div class="auth-meta-item"><span>默认班级</span><b>' +
            (leaderMode ? '<span class="auth-muted">组长视角：全部班级</span>'
              : cls.length ? esc(cls.join(' / ')) : '<span class="auth-muted">未设置（联系管理员分配）</span>') + '</b></div>' +
          '<div class="auth-meta-item"><span>密码状态</span><b>' +
            ((u.pwd === DEFAULT_PWD || u.defaultPwd) ? '<span class="auth-warn-text">仍是初始密码</span>' : '已修改') + '</b></div>' +
        '</div>' +
        (u.role === 'admin'
          ? '<div class="auth-row"><button class="btn btn-primary" type="button" data-act="admin">进入后台管理</button>' +
            '<button class="btn" type="button" data-act="change-pwd">修改密码</button>' +
            '<button class="btn" type="button" data-act="logout">退出登录</button></div>'
          : '<div class="auth-row"><button class="btn" type="button" data-act="change-pwd">修改密码</button>' +
            '<button class="btn" type="button" data-act="logout">退出登录</button></div>') +
        '<p class="auth-tip">登录后可用功能：达标率 / 四线达标率 / 全班成绩 / 学习目标 / 单科分析报告' +
          (u.role === 'teacher'
            ? (leaderMode ? '（组长视角：全部班级）' : '（班级已限制为分配的默认班级）')
            : '') + '。</p>' +
      '</div>';
  }

  /* ---------------- 后台 ---------------- */
  function adminView() {
    /* 「默认班级」必须落在某个真实校区上，从「全部」进来自动落到当前页面校区 */
    if (adminTab === 'classes' && adminCampus === '全部') adminCampus = CAMPUS;
    const tabs = [
      { id: 'users', label: '教师管理' },
      { id: 'pending', label: '待审核' },
      { id: 'classes', label: '默认班级' },
      { id: 'data', label: '数据备份' },
      { id: 'secure', label: '安全设置' }
    ];
    const tabHtml = '<div class="auth-tabs">' + tabs.map(t =>
      '<button class="' + ((adminTab === t.id || (t.id === 'users' && adminTab === 'import')) ? 'on' : '') + '" data-act="admin-tab" data-tab="' + t.id + '" type="button">' +
      t.label + (t.id === 'pending' ? pendingBadge() : '') + '</button>').join('') + '</div>';
    let body = '';
    if (adminTab === 'pending') body = adminPending();
    else if (adminTab === 'users') body = adminUsers();
    else if (adminTab === 'classes') body = adminClasses();
    else if (adminTab === 'data') body = adminData();
    else if (adminTab === 'import') body = adminImport();
    else body = adminSecure();
    const cur = tabs.filter(x => x.id === adminTab || (x.id === 'users' && adminTab === 'import'))[0] || tabs[0];
    return head('管理台 · ' + cur.label,
      '<button class="auth-link" type="button" data-act="logout">退出登录</button>') +
      tabHtml + '<div class="auth-body">' + msgHtml() + body + '</div>';
  }
  function pendingBadge() {
    const n = db.users.filter(u => u.status === 'pending').length;
    return n ? '<span class="auth-badge warn">' + n + '</span>' : '';
  }
  function adminPending() {
    const list = db.users.filter(u => u.status === 'pending');
    if (!list.length) return '<p class="auth-empty">暂无待审核的注册申请。</p>';
    return '<div class="auth-table">' +
      '<div class="auth-tr head"><span>姓名</span><span>科目</span><span>账号</span><span>申请时间</span><span>操作</span></div>' +
      list.map(u => '<div class="auth-tr"><span>' + esc(u.name) + '</span><span>' + esc(u.subject || '-') + '</span><span>' +
        esc(u.u) + '</span><span>' + esc(u.createdAt || '-') + '</span><span class="auth-ops">' +
        '<button class="auth-mini primary" type="button" data-act="approve" data-u="' + esc(u.u) + '">通过</button>' +
        '<button class="auth-mini" type="button" data-act="reject" data-u="' + esc(u.u) + '">拒绝</button>' +
        '</span></div>').join('') + '</div>';
  }
  function adminUsers() {
    const all = db.users.filter(u => u.role !== 'admin');
    const list = all.filter(u => adminCampus === '全部' || (u.campus || '龙泉校区') === adminCampus)
      .sort((a, b) => (a.campus || '').localeCompare(b.campus || '') || a.name.localeCompare(b.name, 'zh'));
    const selCount = selUsers.size;
    /* 校区切换收成小按钮，放在工具条右侧，不再占一整行 */
    const campusTabs = '<div class="auth-campus-mini">' +
      ['全部'].concat(CAMPUSES).map(c => {
        const n = c === '全部' ? all.length : all.filter(u => (u.campus || '龙泉校区') === c).length;
        return '<button class="' + (adminCampus === c ? 'on' : '') + '" type="button" data-act="admin-campus" data-campus="' +
          esc(c) + '">' + esc(c.replace('校区', '')) + ' <b>' + n + '</b></button>';
      }).join('') + '</div>';
    return '<div class="auth-toolbar">' +
      '<button class="btn btn-primary" type="button" data-act="new-user">+ 新增教师账号</button>' +
      '<button class="btn" type="button" data-act="import-users">导入账号</button>' +
      '<button class="btn btn-danger" type="button" data-act="bulk-delete"' + (selCount ? '' : ' disabled') +
        '>批量删除' + (selCount ? '（' + selCount + '）' : '') + '</button>' +
      campusTabs +
      '<span class="auth-muted">当前 ' + esc(adminCampus) + '：' + list.length + ' 个账号 / 全库 ' + all.length + ' 个</span></div>' +
      '<div class="auth-table wide">' +
      '<div class="auth-tr head"><span><input id="chkAll" type="checkbox" title="全选本页教师账号"></span>' +
        '<span>姓名</span><span>校区</span><span>科目</span><span>账号</span><span>密码</span><span>状态</span><span>默认班级</span><span>操作</span></div>' +
      list.map(u => '<div class="auth-tr"><span>' +
        '<input class="chkUser" type="checkbox" data-u="' + esc(u.u) + '"' +
          (selUsers.has(u.u) ? ' checked' : '') + '></span>' +
        '<span>' + esc(u.name) + '</span><span>' + esc(u.campus || '龙泉校区') + '</span><span>' +
        esc(u.subject || '-') + '</span><span>' + esc(u.u) + '</span><span>' +
        ((u.pwd === DEFAULT_PWD || u.defaultPwd) ? '<span class="auth-warn-text">初始</span>' : '已改') + '</span><span>' +
        statusText(u) + '</span><span>' +
        (u.role === 'admin' ? '-' :
          (function () {
            const arr = effectiveClasses(u);
            if (!arr.length) return '<span class="auth-muted">全部（自动，暂无数据）</span>';
            return esc(arr.join('、')) + ' <span class="auth-muted">（' + esc(subjectKey(u)) + '组 · ' +
              (u.clsSet === true ? '按本人设定' : '自动全部') + '）</span>';
          })()) + '</span>' +
        '<span class="auth-ops">' +
          (u.role === 'admin' ? '<span class="auth-muted">—</span>' :
            '<button class="auth-mini" type="button" data-act="toggle" data-u="' + esc(u.u) + '">' +
              (u.status === 'disabled' ? '启用' : '停用') + '</button>' +
            '<button class="auth-mini" type="button" data-act="reset" data-u="' + esc(u.u) + '">重置密码</button>' +
            '<button class="auth-mini" type="button" data-act="edit-class" data-u="' + esc(u.u) + '">科目班级</button>' +
            '<button class="auth-mini danger" type="button" data-act="del" data-u="' + esc(u.u) + '">删除</button>') +
        '</span></div>').join('') + '</div>' +
      '<p class="auth-tip dim">默认班级默认自动取「该科目在成绩数据里出现的全部班级」，登录后即按此范围显示与导出；如需缩小范围，可在「默认班级」页按科目勾选（勾选后以手动的为准，清空恢复全部）。</p>';
  }
  function adminImport() {
    return '<p class="auth-tip">支持 CSV（逗号或制表符分隔）和 JSON。列顺序：姓名, 科目, 账号, 密码, 校区（可选：龙泉/星耀/睿智）, 身份（可选，填「组长」）。' +
      '校区不填就归到当前选中的「' + esc(adminCampus) + '」；首行可以是表头，密码不填按初始密码处理。</p>' +
      '<div class="auth-row"><button class="btn" type="button" data-act="pick-import-file">选择文件（.csv / .txt / .json）</button>' +
      '<span class="auth-muted" id="impFile">未选择文件，也可以直接粘贴到下面</span></div>' +
      '<form id="importForm" class="auth-form">' +
        '<label><span>导入内容</span><textarea id="impText" rows="8" placeholder="张三, 语文, zhangsan, 123456, 星耀&#10;李四, 数学, lisi, 123456, 睿智&#10;王五, 信息技术, wangwu, 123456, 龙泉, 组长"></textarea></label>' +
        msgHtml() +
        '<div class="auth-row"><button class="btn btn-primary" type="submit">开始导入</button>' +
        '<button class="btn" type="button" data-act="admin-tab" data-tab="users">返回账号管理</button></div>' +
      '</form>' +
      '<input id="impFileInput" type="file" accept=".csv,.txt,.json" style="display:none">';
  }
  function adminData() {
    const t = db.users.filter(u => u.role !== 'admin').length;
    const groups = CAMPUSES.reduce((n, c) => n + Object.keys(campusSubjectClasses(c)).filter(k => (campusSubjectClasses(c)[k] || []).length).length, 0);
    return '<p class="auth-tip">三个校区的账号、审核状态、默认班级统一存放在<b>一个数据库对象</b>里（浏览器 localStorage 的 ' +
      '<code>pw_lq_db_v2</code>），可以整体导出备份、换电脑时导入恢复。</p>' +
      '<div class="auth-meta">' +
        '<div class="auth-meta-item"><span>数据库版本</span><b>v' + (db.v || DB_VERSION) + '</b></div>' +
        '<div class="auth-meta-item"><span>最后更新</span><b>' + esc(db.updatedAt || '-') + '</b></div>' +
        '<div class="auth-meta-item"><span>教师账号（三校区）</span><b>' + t + ' 个</b></div>' +
        '<div class="auth-meta-item"><span>已设班级的科目组</span><b>' + groups + ' 组</b></div>' +
      '</div>' +
      '<div class="auth-row">' +
        '<button class="btn btn-primary" type="button" data-act="export-db">导出数据库（JSON）</button>' +
        '<button class="btn" type="button" data-act="import-db">导入数据库</button>' +
        '<button class="btn btn-danger" type="button" data-act="reset-db">恢复出厂数据</button>' +
      '</div>' +
      '<p class="auth-tip dim">导出文件是纯 JSON，包含全部账号与密码、审核状态、各科目组的默认班级；请妥善保存。</p>' +
      '<div id="dbImportBox" style="display:none">' +
        '<form id="dbImportForm" class="auth-form">' +
          '<label><span>粘贴数据库 JSON</span><textarea id="dbText" rows="7" placeholder="{ &quot;users&quot;: [...] }"></textarea></label>' +
          '<div class="auth-row"><button class="btn btn-primary" type="submit">确认覆盖</button>' +
          '<button class="btn" type="button" data-act="pick-db-file">选择文件</button></div>' +
        '</form>' +
        '<input id="dbFileInput" type="file" accept=".json,.txt" style="display:none">' +
      '</div>' +
      '<div class="auth-logs">' +
        '<div class="auth-logs-title">最近操作</div>' +
        ((db.logs || []).slice(-8).reverse().map(x => '<div class="auth-log"><span>' + esc(x.t) + '</span>' + esc(x.text) + '</div>').join('') ||
          '<p class="auth-muted">暂无记录</p>') +
      '</div>';
  }
  function adminClasses() {
    if (adminCampus !== CAMPUS) {
      return '<p class="auth-empty">默认班级要按校区、按该校区真实的班级列表来设。请先进入「' + esc(adminCampus) + '」页面，' +
        '在那里打开管理台设置（账号是共用的，不需要重新登录）。</p>' +
        '<div class="auth-row"><a class="btn btn-primary" href="' + esc(adminCampus) + '.html">进入' + esc(adminCampus) + '</a>' +
        '<button class="btn" type="button" data-act="admin-campus" data-campus="' + esc(CAMPUS) + '">切回' + esc(CAMPUS) + '</button></div>';
    }
    const teachers = db.users.filter(u => u.role !== 'admin' && (u.campus || '龙泉校区') === adminCampus);
    if (!classList().length) return '<p class="auth-empty">当前页面还没加载成绩数据，加载后点这里刷新即可分配班级。' +
      '（默认班级是分校区设置的：要给「' + esc(adminCampus) + '」的老师分配，请在该校区页面里操作。）</p>' +
      '<button class="btn" type="button" data-act="admin-tab" data-tab="classes">刷新</button>';
    if (!teachers.length) return '<p class="auth-empty">还没有教师账号。</p>';
    const cur = teachers.find(u => u.u === editTeacher) || teachers[0];
    editTeacher = cur.u;
    /* 该老师本科目实际有成绩的班级（老师自己带的班），没有则退回页面全部班级 */
    const sub = mapSubject(cur.subject);
    const subCls = subjectDataClasses(sub);
    const pool = subCls.length ? subCls : classList();
    const on = effectiveClasses(cur);
    return '<p class="auth-tip">按<b>单个老师</b>分配：左边选老师，右边只显示这个老师任教科目（' + esc(sub || '未设科目') +
      '）实际有成绩的班级。保存后，这位老师登录就只看到、只导出这些班；没分配过的老师默认本科目全部班级。</p>' +
      '<div class="auth-subj-tabs">' +
        teachers.map(u => '<button class="' + (u.u === cur.u ? 'on' : '') + '" type="button" data-act="pick-teacher" data-u="' + esc(u.u) + '">' +
          esc(u.name) + '<span class="n">' + esc(subjectKey(u)) + '</span></button>').join('') +
      '</div>' +
      '<div class="auth-subj-info">' +
        '<span class="label">' + esc(cur.name) + ' · ' + esc(cur.subject || '未设科目') + '</span>' +
        '<span class="names">账号 ' + esc(cur.u) + ' ｜ 可分配班级 ' + pool.length + ' 个</span>' +
        '<span class="count">' + (cur.clsSet === true ? '已按本人设 ' + on.length + ' 个班' : '默认全部 · 当前 ' + on.length + ' 个班') + '</span>' +
      '</div>' +
      '<div class="auth-class-grid" id="clsBox" data-user="' + esc(cur.u) + '" data-subject="' + esc(sub) + '">' +
      pool.map(c => {
        const sel = on.indexOf(c) >= 0;
        return '<label class="auth-check' + (sel ? ' on' : '') + '"><input type="checkbox" value="' + esc(c) + '"' +
          (sel ? ' checked' : '') + '><span>' + esc(c) + '</span></label>';
      }).join('') + '</div>' +
      '<div class="auth-row"><button class="btn btn-primary" type="button" data-act="save-class">保存 ' + esc(cur.name) + ' 的默认班级</button>' +
      '<button class="btn" type="button" data-act="select-all-class">全选</button>' +
      '<button class="btn" type="button" data-act="clear-all-class">全不选</button>' +
      '<button class="btn" type="button" data-act="reset-class">恢复本科目全部班级</button></div>';
  }
  function editingNewUser() { return view === 'admin-newuser'; }
  function adminNewUserForm() {
    const opts = SUBJECTS.map(s => '<option value="' + s + '">' + s + '</option>').join('');
    const cam = CAMPUSES.map(c => '<option value="' + c + '"' + (c === adminCampus || (adminCampus === '全部' && c === CAMPUS) ? ' selected' : '') + '>' + c + '</option>').join('');
    return '<form id="newUserForm" class="auth-form">' +
      '<label><span>姓名</span><input id="nuName" placeholder="教师姓名"></label>' +
      '<label><span>校区</span><select id="nuCampus">' + cam + '</select></label>' +
      '<label><span>科目</span><select id="nuSubject">' + opts + '</select></label>' +
      '<label><span>账号</span><input id="nuUser" placeholder="姓名全拼，不可与现有账号重复"></label>' +
      '<label><span>密码</span><input id="nuPwd" value="123456"></label>' +
      msgHtml() +
      '<div class="auth-row"><button class="btn btn-primary" type="submit">创建账号</button>' +
      '<button class="btn" type="button" data-act="admin-tab" data-tab="users">取消</button></div>' +
      '<p class="auth-tip">新建账号直接为「正常」状态，可直接登录；账号全库唯一，校区只决定他能看到哪个校区的班级。</p></form>';
  }
  function adminSecure() {
    return '<form id="adminPwdForm" class="auth-form">' +
      '<label><span>新密码</span><input id="apwNew" type="password" placeholder="至少 6 位"></label>' +
      '<label><span>确认新密码</span><input id="apwNew2" type="password"></label>' +
      msgHtml() +
      '<button class="btn btn-primary" type="submit">修改审核员密码</button>' +
      '<p class="auth-tip">新密码至少 6 位，修改后请自行记牢。</p>' +
      '<p class="auth-tip dim">账号数据保存在本机浏览器（localStorage），换电脑或清缓存后需重新审核/设置。</p></form>';
  }

  function renderCard() {
    const card = el('authCard');
    if (!card) return;
    let html = '';
    if (view === 'login') html = loginView();
    else if (view === 'register') html = registerView();
    else if (view === 'pending') html = pendingView();
    else if (view === 'change-pwd') html = changePwdView();
    else if (view === 'profile') html = profileView();
    else if (view === 'admin' || view === 'admin-newuser') html = adminView();
    else html = loginView();
    card.className = 'auth-card' + (view === 'admin' || view === 'admin-newuser' ? ' wide admin-full' : '');
    card.innerHTML = html;
    const maskEl = el('authMask');
    if (maskEl) maskEl.classList.toggle('admin-mode', view === 'admin' || view === 'admin-newuser');
    bindCard();
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindCard() {
    const card = el('authCard');
    if (!card) return;
    card.querySelectorAll('[data-act]').forEach(b => {
      b.addEventListener('click', ev => {
        const act = b.dataset.act;
        if (act === 'close') return close_();
        if (act === 'tab-login') { view = 'login'; msg = null; return renderCard(); }
        if (act === 'tab-register') { view = 'register'; msg = null; return renderCard(); }
        if (act === 'profile') { view = currentUser() ? 'profile' : 'login'; msg = null; return renderCard(); }
        if (act === 'change-pwd') { view = 'change-pwd'; msg = null; return renderCard(); }
        if (act === 'admin') { view = 'admin'; adminTab = 'users'; msg = null; return renderCard(); }
        if (act === 'mode-self' || act === 'mode-leader') {
          const u = currentUser();
          if (u && u.isLeader) {
            u.mode = act === 'mode-leader' ? 'leader' : 'self';
            saveDB();
            window.__AUTH_LOCK_SIG = null;
            if (window.__REP_MODE_SYNC) window.__REP_MODE_SYNC(u.mode);
            applyAll(true);
          }
          return renderCard();
        }
        if (act === 'logout') { doLogout(); return; }
        if (act === 'gen-pinyin') {
          const n = (el('rgName') && el('rgName').value.trim()) || '';
          const u = el('rgUser');
          const box = card.querySelector('.auth-msg');
          if (PY[n]) {
            u.value = PY[n];
            draft.ru = PY[n];
            if (box) { box.className = 'auth-msg ok'; box.textContent = '已按姓名生成账号：' + PY[n]; }
          } else if (u) {
            u.focus();
            if (box) { box.className = 'auth-msg warn'; box.textContent = '未识别的姓名，请手动填写姓名全拼（如 zhangdinan）'; }
          }
          return;
        }
        if (act === 'admin-campus') {
          adminCampus = b.dataset.campus || '全部';
          editSubject = null;
          editTeacher = null;
          msg = null;
          return renderCard();
        }
        if (act === 'admin-tab') {
          const t = b.dataset.tab;
          msg = null;
          if (t === 'classes' && !classList().length) { msg = { type: 'warn', text: '成绩数据尚未加载，加载后再分配默认班级。' }; }
          adminTab = t; if (t !== 'classes') view = 'admin';
          return renderCard();
        }
        if (act === 'approve' || act === 'reject') return onApprove(b.dataset.u, act === 'approve');
        if (act === 'toggle') return onToggle(b.dataset.u);
        if (act === 'reset') return onReset(b.dataset.u);
        if (act === 'del') return onDelete(b.dataset.u);
        if (act === 'edit-class') {
          const uu = findUser(b.dataset.u);
          editUser = b.dataset.u;
          editTeacher = b.dataset.u;
          editSubject = uu ? subjectKey(uu) : editSubject;
          adminTab = 'classes';
          if (view === 'admin-newuser') view = 'admin';
          return renderCard();
        }
        if (act === 'pick-teacher') { editTeacher = b.dataset.u || null; msg = null; return renderCard(); }
        if (act === 'pick-subject') return onPickSubject(b.dataset.subject);
        if (act === 'save-class') return onSaveClass();
        if (act === 'reset-class') return onResetTeacherClass();
        if (act === 'select-all-class' || act === 'clear-all-class') {
          const on = act === 'select-all-class';
          card.querySelectorAll('#clsBox input[type=checkbox]').forEach(i => { i.checked = on; i.parentElement.classList.toggle('on', on); });
          return;
        }
        if (act === 'new-user') { view = 'admin-newuser'; adminTab = 'users'; msg = null; return renderCard(); }
        if (act === 'import-users') { view = 'admin'; adminTab = 'import'; msg = null; return renderCard(); }
        if (act === 'bulk-delete') return onBulkDelete();
        if (act === 'pick-import-file') { const f = el('impFileInput'); if (f) f.click(); return; }
        if (act === 'export-db') return onExportDB();
        if (act === 'import-db') { const box = el('dbImportBox'); if (box) box.style.display = 'block'; return; }
        if (act === 'pick-db-file') { const f = el('dbFileInput'); if (f) f.click(); return; }
        if (act === 'reset-db') return onResetDB();
      });
    });

    /* 账号表：单行勾选 / 全选 / 批量删除按钮状态 */
    const chkAll = card.querySelector('#chkAll');
    const rows = Array.prototype.slice.call(card.querySelectorAll('.chkUser'));
    if (chkAll) {
      chkAll.checked = rows.length > 0 && rows.every(c => c.checked);
      chkAll.indeterminate = !chkAll.checked && rows.some(c => c.checked);
      chkAll.addEventListener('change', () => {
        rows.forEach(c => { c.checked = chkAll.checked; if (chkAll.checked) selUsers.add(c.dataset.u); else selUsers.delete(c.dataset.u); });
        syncBulkBtn();
      });
    }
    rows.forEach(c => {
      c.addEventListener('change', () => {
        if (c.checked) selUsers.add(c.dataset.u); else selUsers.delete(c.dataset.u);
        if (chkAll) {
          chkAll.checked = rows.length > 0 && rows.every(x => x.checked);
          chkAll.indeterminate = !chkAll.checked && rows.some(x => x.checked);
        }
        syncBulkBtn();
      });
    });
    function syncBulkBtn() {
      const btn = card.querySelector('[data-act=bulk-delete]');
      if (!btn) return;
      btn.disabled = selUsers.size === 0;
      btn.textContent = '批量删除' + (selUsers.size ? '（' + selUsers.size + '）' : '');
    }
    /* 导入：选文件后读进文本框 */
    const impFile = card.querySelector('#impFileInput');
    if (impFile) impFile.addEventListener('change', () => {
      const f = impFile.files && impFile.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const ta = el('impText'); if (ta) ta.value = String(rd.result || '');
        const lab = el('impFile'); if (lab) lab.textContent = '已读取：' + f.name;
      };
      rd.readAsText(f, 'UTF-8');
    });
    const dbFile = card.querySelector('#dbFileInput');
    if (dbFile) dbFile.addEventListener('change', () => {
      const f = dbFile.files && dbFile.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { const ta = el('dbText'); if (ta) ta.value = String(rd.result || ''); };
      rd.readAsText(f, 'UTF-8');
    });
    const imf = card.querySelector('#importForm');
    if (imf) imf.addEventListener('submit', ev => { ev.preventDefault(); onImportUsers(el('impText').value); });
    const dbf = card.querySelector('#dbImportForm');
    if (dbf) dbf.addEventListener('submit', ev => { ev.preventDefault(); onImportDB(el('dbText').value); });

    const lf = card.querySelector('#authLoginForm');
    if (lf) lf.addEventListener('submit', ev => { ev.preventDefault(); doLogin(); });
    const rf = card.querySelector('#authRegForm');
    if (rf) rf.addEventListener('submit', ev => { ev.preventDefault(); doRegister(); });
    const pf = card.querySelector('#authPwdForm');
    if (pf) pf.addEventListener('submit', ev => { ev.preventDefault(); doChangePwd('npwNew', 'npwNew2'); });
    const af = card.querySelector('#adminPwdForm');
    if (af) af.addEventListener('submit', ev => { ev.preventDefault(); doChangePwd('apwNew', 'apwNew2'); });
    const nf = card.querySelector('#newUserForm');
    if (nf) nf.addEventListener('submit', ev => { ev.preventDefault(); doNewUser(); });
    card.querySelectorAll('#clsBox .auth-check').forEach(lb => {
      lb.addEventListener('change', () => lb.classList.toggle('on', !!lb.querySelector('input').checked));
    });
    const sel = card.querySelector('#clsUser');
    if (sel) sel.addEventListener('change', () => { editUser = sel.value; renderCard(); });
  }

  /* ---------------- 业务动作 ---------------- */
  function doLogin() {
    const uu = (el('liUser').value || '').trim();
    const pp = el('liPwd').value || '';
    draft.u = uu;
    if (!uu || !pp) { msg = { type: 'err', text: '请输入账号和密码' }; return renderCard(); }
    const u = findUser(uu);
    if (!u) { msg = { type: 'err', text: '账号不存在，请先注册或联系审核员添加' }; return renderCard(); }
    if (u.role !== 'admin' && u.campus && u.campus !== CAMPUS) {
      msg = { type: 'err', text: '这个账号属于「' + u.campus + '」，请到对应的校区页面登录' };
      return renderCard();
    }
    if (u.status === 'pending') { msg = { type: 'warn', text: '账号正在等待审核员审核，通过后才能登录' }; return renderCard(); }
    if (u.status === 'disabled') { msg = { type: 'err', text: '账号已被停用，请联系审核员' }; return renderCard(); }
    if (u.pwd !== pp) { msg = { type: 'err', text: '密码错误' }; return renderCard(); }
    try { localStorage.setItem(LS_SESSION, u.u); } catch (e) {}
    if (window.__REP_MODE_SYNC) window.__REP_MODE_SYNC(u.mode || 'self');
    applyAll(true);
    msg = null;
    /* 审核员：登录后不进成绩分析，直接留在管理台 */
    if (u.role === 'admin') {
      /* 管理员：直接进入全屏「教师管理」，不弹小窗 */
      adminTab = 'users';
      view = 'admin';
      open_('admin');
      return;
    }
    if (u.pwd === DEFAULT_PWD || u.defaultPwd) { u.defaultPwd = true; saveDB(); view = 'change-pwd'; renderCard(); return; }
    /* 教师：登录后直接落在成绩分析页（弹窗关掉），个人资料从右上角头像进入 */
    view = 'profile';
    close_();
  }

  function doLogout() {
    try { localStorage.removeItem(LS_SESSION); } catch (e) {}
    window.__AUTH_LOCK_SIG = null;
    window.__AUTH_SUBJ_SIG = null;
    view = 'login'; msg = null;
    /* 退出后恢复原版样子：清掉班级锁定（含勾选），回到未登录的页签集合 */
    const box = el('globalClassWrap');
    if (box) box.querySelectorAll('.checkbox-item').forEach(it => { it.style.display = ''; });
    restoreAllClasses();
    const acts = box && box.parentElement && box.parentElement.querySelector('.group-actions');
    if (acts) acts.style.display = '';
    applyAll(true);
    close_();
  }

  function doRegister() {
    if (!SELF_REG) { msg = { type: 'err', text: '本校区不开放自助注册，请联系管理员创建账号' }; return renderCard(); }
    const name = (el('rgName').value || '').trim();
    const subject = el('rgSubject').value;
    const uu = (el('rgUser').value || '').trim();
    const pp = (el('rgPwd').value || '').trim();
    draft = { name: name, subject: subject, ru: uu, pwd: pp };
    if (!name) { msg = { type: 'err', text: '请填写姓名' }; return renderCard(); }
    if (!/^[A-Za-z][A-Za-z0-9]{2,19}$/.test(uu)) { msg = { type: 'err', text: '账号只能是 3-20 位英文或数字，且以字母开头（姓名全拼）' }; return renderCard(); }
    if (findUser(uu)) { msg = { type: 'err', text: '该账号已存在，请换一个' }; return renderCard(); }
    if (!pp || pp.length < 6) { msg = { type: 'err', text: '密码至少 6 位' }; return renderCard(); }
    db.users.push({
      u: uu, name: name, role: 'teacher', subject: subject, campus: CAMPUS, pwd: pp,
      defaultPwd: pp === DEFAULT_PWD, status: 'pending', classes: [], createdAt: nowStr()
    });
    saveDB();
    msg = { text: uu };
    draft = {};
    view = 'pending';
    renderCard();
  }

  function doChangePwd(f1, f2) {
    const n1 = (el(f1).value || '').trim();
    const n2 = (el(f2).value || '').trim();
    const u = currentUser();
    if (!u) { view = 'login'; return renderCard(); }
    if (!n1 || n1.length < 6) { msg = { type: 'err', text: '新密码至少 6 位' }; return renderCard(); }
    if (n1 !== n2) { msg = { type: 'err', text: '两次输入的密码不一致' }; return renderCard(); }
    u.pwd = n1; u.defaultPwd = false; saveDB();
    msg = { type: 'ok', text: '密码已修改，之后请用新密码登录' };
    view = 'profile';
    renderCard();
  }

  function onApprove(uu, ok) {
    const u = findUser(uu);
    if (!u) return;
    if (ok) {
      u.status = 'active';
      u.approvedAt = nowStr();
      msg = { type: 'ok', text: '已通过：' + u.name + '（' + u.u + '）可以登录了' };
    } else {
      db.users = db.users.filter(x => x !== u);
      msg = { type: 'ok', text: '已拒绝并删除申请：' + u.name };
    }
    saveDB(); renderCard();
  }
  function onToggle(uu) {
    const u = findUser(uu); if (!u) return;
    u.status = u.status === 'disabled' ? 'active' : 'disabled';
    saveDB(); msg = { type: 'ok', text: u.name + ' 已' + statusText(u) }; renderCard();
  }
  function onReset(uu) {
    const u = findUser(uu); if (!u) return;
    u.pwd = DEFAULT_PWD; u.defaultPwd = true; saveDB();
    msg = { type: 'ok', text: u.name + ' 的密码已重置为初始密码（登录后会自动提示改密）' };
    renderCard();
  }
  function onDelete(uu) {
    const u = findUser(uu); if (!u) return;
    if (!window.confirm('确定删除账号「' + u.name + '（' + u.u + '）」？此操作不可撤销。')) return;
    db.users = db.users.filter(x => x !== u);
    saveDB(); msg = { type: 'ok', text: '已删除 ' + u.name }; renderCard();
  }
  function onPickSubject(k) {
    editSubject = k;
    renderCard();
  }
  function onSaveClass() {
    const box = el('clsBox');
    const uu = box ? box.dataset.user : editTeacher;
    const u = findUser(uu);
    if (!box || !u) { msg = { type: 'err', text: '请先选择要分配的老师' }; return renderCard(); }
    const arr = Array.prototype.slice.call(box.querySelectorAll('input[type=checkbox]'))
      .filter(i => i.checked).map(i => i.value);
    u.classes = arr;
    u.clsSet = true;
    saveDB();
    logAct('设置 ' + u.name + ' 的默认班级：' + (arr.length ? arr.join('、') : '空'));
    msg = { type: 'ok', text: '已保存 ' + u.name + '（' + (u.subject || '未设科目') + '）的默认班级：' + (arr.length ? arr.join('、') : '（空）') };
    window.__AUTH_LOCK_SIG = null;
    const me = currentUser();
    if (me && me.role === 'teacher') applyAll(true);
    renderCard();
  }
  function onResetTeacherClass() {
    const u = findUser(editTeacher);
    if (!u) { msg = { type: 'err', text: '请先选择要分配的老师' }; return renderCard(); }
    delete u.clsSet;
    delete u.classes;
    saveDB();
    logAct('恢复 ' + u.name + ' 为本科目全部班级');
    msg = { type: 'ok', text: u.name + ' 已恢复「本科目全部班级」自动范围' };
    renderCard();
  }

  /* ---------------- 导入账号 / 批量删除 / 数据库备份 ---------------- */
  function parseImportRows(text) {
    const t = (text || '').trim();
    if (!t) return [];
    if (t.charAt(0) === '[' || t.charAt(0) === '{') {
      const o = JSON.parse(t);
      const arr = Array.isArray(o) ? o : (o.users || o.teachers || []);
      return arr.map(x => ({
        name: x.name || x['姓名'] || '',
        subject: x.subject || x['科目'] || '',
        u: x.u || x.account || x['账号'] || '',
        pwd: x.pwd || x.password || x['密码'] || '',
        campus: x.campus || x['校区'] || '',
        leader: !!(x.isLeader || x.leader || x['身份'] === '组长' || x.role === 'leader')
      }));
    }
    const lines = t.split(/\r?\n/).filter(s => s.trim());
    let start = 0;
    if (/姓名|账号|科目/.test(lines[0])) start = 1;
    return lines.slice(start).map(line => {
      const sep = line.indexOf('\t') >= 0 ? '\t' : (line.indexOf('，') >= 0 && line.indexOf(',') < 0 ? '，' : ',');
      const c = line.split(sep).map(s => s.trim());
      return { name: c[0] || '', subject: c[1] || '', u: c[2] || '', pwd: c[3] || '', campus: c[4] || '', leader: c[5] === '组长' || c[5] === '是' || c[4] === '组长' };
    });
  }
  function onImportUsers(text) {
    let rows;
    try { rows = parseImportRows(text); } catch (e) { msg = { type: 'err', text: '内容格式无法解析：' + e.message }; return renderCard(); }
    if (!rows.length) { msg = { type: 'err', text: '没有解析到可导入的行' }; return renderCard(); }
    const added = [], skipped = [];
    rows.forEach((r, i) => {
      const name = (r.name || '').trim();
      let uu = (r.u || '').trim();
      const sub = mapSubject((r.subject || '').trim());
      if (!name) { skipped.push('第 ' + (i + 1) + ' 行缺姓名'); return; }
      if (!SUBJECTS.includes(sub)) { skipped.push(name + '：科目「' + (r.subject || '空') + '」不认识'); return; }
      if (!uu) uu = PY[name] || '';
      if (!/^[A-Za-z][A-Za-z0-9]{2,19}$/.test(uu)) { skipped.push(name + '：账号「' + uu + '」不合格（3-20 位字母开头）'); return; }
      if (findUser(uu)) { skipped.push(name + '：账号 ' + uu + ' 已存在'); return; }
      const pp = (r.pwd || '').trim() || DEFAULT_PWD;
      const camp = CAMPUSES.indexOf((r.campus || '').replace('校区', '') + '校区') >= 0
        ? (r.campus || '').replace('校区', '') + '校区'
        : (CAMPUSES.indexOf(adminCampus) >= 0 ? adminCampus : CAMPUS);
      db.users.push({
        u: uu, name: name, role: 'teacher', subject: sub, campus: camp, pwd: pp,
        defaultPwd: pp === DEFAULT_PWD, status: 'active', classes: [],
        createdAt: '导入 ' + nowStr(), isLeader: !!r.leader, mode: 'self'
      });
      added.push(name + '（' + uu + '）');
    });
    saveDB();
    logAct('导入账号 ' + added.length + ' 个' + (skipped.length ? '，跳过 ' + skipped.length + ' 个' : ''));
    msg = added.length
      ? { type: skipped.length ? 'warn' : 'ok', text: '已导入 ' + added.length + ' 个账号：' + added.join('、') + (skipped.length ? '；跳过：' + skipped.join('；') : '') }
      : { type: 'err', text: '没有账号被导入：' + skipped.join('；') };
    adminTab = 'users';
    renderCard();
  }
  function onBulkDelete() {
    const targets = db.users.filter(u => u.role !== 'admin' && selUsers.has(u.u));
    if (!targets.length) { msg = { type: 'err', text: '请先勾选要删除的账号' }; return renderCard(); }
    const names = targets.map(u => u.name + '（' + u.u + '）').join('、');
    if (!window.confirm('确定删除以下 ' + targets.length + ' 个账号？此操作不可撤销。\n' + names)) return;
    db.users = db.users.filter(u => !(u.role !== 'admin' && selUsers.has(u.u)));
    const cur = sessionName();
    if (cur && !findUser(cur)) { try { localStorage.removeItem(LS_SESSION); } catch (e) {} }
    selUsers.clear();
    saveDB();
    logAct('批量删除账号 ' + targets.length + ' 个：' + targets.map(u => u.name).join('、'));
    msg = { type: 'ok', text: '已删除 ' + targets.length + ' 个账号' };
    applyAll(true);
    renderCard();
  }
  function downloadText(name, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function onExportDB() {
    downloadText('三校区账号数据库_' + nowStr().replace(/[-: ]/g, '').slice(0, 12) + '.json',
      JSON.stringify(db, null, 2));
    logAct('导出数据库（' + db.users.length + ' 个账号）');
    msg = { type: 'ok', text: '数据库已导出（包含 ' + db.users.length + ' 个账号）' };
    renderCard();
  }
  function onImportDB(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { msg = { type: 'err', text: 'JSON 解析失败：' + e.message }; return renderCard(); }
    if (!o || !Array.isArray(o.users) || !o.users.length) { msg = { type: 'err', text: '这不是有效的数据库文件（缺少 users 数组）' }; return renderCard(); }
    if (!o.users.some(u => u.role === 'admin')) { msg = { type: 'err', text: '数据库里没有审核员账号（role=admin），已拒绝导入' }; return renderCard(); }
    if (!window.confirm('导入会覆盖当前全部账号与默认班级设置，确定继续？')) return;
    migrate(o);
    saveDB(o);
    logAct('导入数据库，共 ' + o.users.length + ' 个账号');
    msg = { type: 'ok', text: '数据库已导入：' + o.users.length + ' 个账号（三校区）' };
    const cur = sessionName();
    if (cur && !findUser(cur)) { try { localStorage.removeItem(LS_SESSION); } catch (e) {} close_(); }
    applyAll(true);
    renderCard();
  }
  function onResetDB() {
    if (!window.confirm('恢复出厂会清空所有账号、审核记录和默认班级，只保留预置的 17 位教师和审核员。确定继续？')) return;
    saveDB(emptyDB());
    try { localStorage.removeItem(LS_SESSION); } catch (e) {}
    selUsers.clear();
    close_();
    applyAll(true);
  }
  function doNewUser() {
    const name = (el('nuName').value || '').trim();
    const subject = el('nuSubject').value;
    const camp = (el('nuCampus') && el('nuCampus').value) || CAMPUS;
    const uu = (el('nuUser').value || '').trim();
    const pp = (el('nuPwd').value || '').trim() || DEFAULT_PWD;
    if (!name) { msg = { type: 'err', text: '请填写姓名' }; return renderCard(); }
    if (!/^[A-Za-z][A-Za-z0-9]{2,19}$/.test(uu)) { msg = { type: 'err', text: '账号需为 3-20 位英文/数字，字母开头' }; return renderCard(); }
    if (findUser(uu)) { msg = { type: 'err', text: '账号已存在' }; return renderCard(); }
    db.users.push({
      u: uu, name: name, role: 'teacher', subject: subject, campus: camp, pwd: pp,
      defaultPwd: pp === DEFAULT_PWD, status: 'active', classes: [], createdAt: nowStr()
    });
    saveDB();
    logAct('新建账号 ' + name + '（' + camp + '）');
    adminCampus = camp;
    view = 'admin'; adminTab = 'users';
    msg = { type: 'ok', text: '已创建教师账号 ' + name + '（' + uu + '，' + camp + '）' };
    renderCard();
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    db = loadDB();
    /* 会话账号可能已被删除/停用 */
    const n = sessionName();
    if (n && !currentUser()) { try { localStorage.removeItem(LS_SESSION); } catch (e) {} }

    const mask = el('authMask');
    if (mask) {
      mask.addEventListener('click', ev => { if (ev.target === mask) close_(); });
      document.addEventListener('keydown', ev => { if (ev.key === 'Escape') close_(); });
    }
    const entry = el('authEntry');
    if (entry) entry.addEventListener('click', () => {
      const u = currentUser();
      msg = null;
      open_(u ? 'profile' : 'login');
    });
    renderEntry();
    applyAll(false);
    /* 数据可能在本模块加载前就已解析完毕（双击打开走内嵌数据） */
    setTimeout(function () {
      if (typeof state !== 'undefined' && state.classList && state.classList.length) {
        window.__AUTH_LOCK_SIG = null;
        applyAll(true);
      }
    }, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
