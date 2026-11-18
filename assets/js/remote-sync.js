/* ============================================================
   remote-sync.js — 账号与 AI 配置的仓库共享同步

   说明：
   · 纯前端站点无后端，账号 / AI 配置统一以仓库内
     `assets/config/accounts.json` 作为“线上共享源”。
   · 每个设备打开页面时拉取该文件合并进本地浏览器库；
     管理台新增 / 改老师、改密码、改默认班级、改 AI 配置后，
     自动把当前库序列化回写该文件（GitHub Contents API）。
   · 令牌与 pages/upload.html 同值（反转 + Base64 混淆），运行时解码。
   ============================================================ */
(function (global) {
  'use strict';

  var OWNER = 'ZhangDN731';
  var REPO = 'Campus_Performance_Analysis';
  var BRANCH = 'main';
  var API = 'https://api.github.com';
  var PATH = 'assets/config/accounts.json';

  /* 与 pages/upload.html 同一份内置令牌 */
  var _ENC = 'QmZ3N2Uxbzl4dGJ0Q0M0SkJFa015N0d2WExURldWdFd0bTNlX3BoZw==';
  function token() {
    try { return atob(_ENC).split('').reverse().join(''); } catch (e) { return ''; }
  }

  /* 由本脚本位置（assets/js/）推算站点根，兼容 Pages 子路径 / 本地服务器 */
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  var SITE_ROOT = SCRIPT_SRC ? new URL('../../', SCRIPT_SRC) : new URL('../', location.href);

  function rawUrl() {
    return new URL(PATH, SITE_ROOT).href;
  }

  function contentsUrl() {
    var rel = PATH.split('/').map(encodeURIComponent).join('/');
    return API + '/repos/' + OWNER + '/' + REPO + '/contents/' + rel;
  }

  function strToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '', chunk = 8192;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  /* 拉取远程共享文件；404 / 解析失败返回 null，不打断本地使用 */
  async function pull() {
    try {
      var url = rawUrl() + (rawUrl().indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
      var resp = await fetch(url, { cache: 'no-store' });
      if (resp.status === 404) return null;
      if (!resp.ok) throw new Error('拉取失败 HTTP ' + resp.status);
      var text = await resp.text();
      if (!text || !text.trim()) return null;
      return JSON.parse(text);
    } catch (e) {
      console.warn('[remote-sync] 拉取共享账号失败', e);
      return null;
    }
  }

  /* 把序列化好的 { users, ai } 写回仓库；返回 { ok, sha, message } */
  async function push(payload, message) {
    var tk = token();
    if (!tk) throw new Error('缺少同步令牌');
    var body = JSON.stringify(payload, null, 2);
    var content = strToBase64(body);

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    /* 读取当前文件 sha；404 视为新文件返回 null；网络抖动重试 3 次 */
    async function currentSha() {
      var lastErr = null;
      for (var i = 0; i < 3; i++) {
        try {
          var head = await fetch(contentsUrl() + '?ref=' + BRANCH + '&_t=' + Date.now(), {
            cache: 'no-store',
            headers: { 'Authorization': 'token ' + tk, 'Accept': 'application/vnd.github.v3+json' }
          });
          if (head.status === 404) return null;
          if (head.ok) { var data = await head.json(); return data.sha || null; }
          lastErr = new Error('HTTP ' + head.status);
        } catch (e) { lastErr = e; }
        await sleep(600 * (i + 1));
      }
      throw lastErr || new Error('获取文件版本失败');
    }

    async function attempt(sha) {
      var put = {
        message: message || ('sync: 账号 / AI 配置更新'),
        content: content,
        branch: BRANCH
      };
      if (sha) put.sha = sha;
      var resp = await fetch(contentsUrl(), {
        method: 'PUT',
        headers: {
          'Authorization': 'token ' + tk,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(put)
      });
      if (resp.status === 409 || resp.status === 422) throw new Error('sha-mismatch');
      if (!resp.ok) {
        var err = await resp.json().catch(function () { return { message: 'HTTP ' + resp.status }; });
        throw new Error(err.message || '同步失败');
      }
      var out = await resp.json();
      return { ok: true, sha: out && out.commit && out.commit.sha, message: message };
    }

    var sha = await currentSha();
    try {
      return await attempt(sha);
    } catch (e) {
      if (String(e.message) === 'sha-mismatch') {
        /* sha 过期 / 缺失：重新取最新 sha 再推一次 */
        sha = await currentSha();
        return await attempt(sha);
      }
      throw e;
    }
  }

  global.RemoteSync = {
    PATH: PATH,
    pull: pull,
    push: push,
    rawUrl: rawUrl
  };
})(window);
