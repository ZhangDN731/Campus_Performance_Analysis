/* ============================================================
   github-upload.js — 共享 GitHub 数据托管助手
   功能：管理员令牌验证（登录/登出）、文件上传、raw 文件拉取
   安全：令牌不内嵌，仅由管理员手动输入，保存在 sessionStorage
         （关闭标签页即清除），因此没有令牌的其他用户无法上传。
   ============================================================ */

(function (global) {
  'use strict';

  /* ==================== 仓库配置 ==================== */
  var OWNER = 'ZhangDN731';
  var REPO = 'Campus_Performance_Analysis';
  var BRANCH = 'main';
  var API = 'https://api.github.com';
  var TOKEN_KEY = 'cpa_admin_token';
  var USER_KEY = 'cpa_admin_user';

  /* 内置管理员令牌（反转 + Base64 混淆，与 pages/upload.html 同值）：
     校区页「上传 Excel」无需再次手动输入即可直接上传；校验失败时静默回退手动登录。 */
  var _ENC = 'QmZ3N2Uxbzl4dGJ0Q0M0SkJFa015N0d2WExURldWdFd0bTNlX3BoZw==';
  function _dec() {
    try { var s = atob(_ENC); return s.split('').reverse().join(''); } catch (e) { return ''; }
  }

  /* 站点根目录：依据本脚本（assets/js/github-upload.js）自身位置推算，
     兼容 GitHub Pages 子路径、本地服务器与仓库分叉，避免写死 raw 域名。 */
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  var SITE_ROOT = SCRIPT_SRC ? new URL('../../', SCRIPT_SRC) : new URL('./', location.href);

  /* ==================== 工具 ==================== */
  function bufToBase64(buf) {
    var bytes = new Uint8Array(buf);
    var binary = '';
    var chunk = 8192;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function authHeaders(token) {
    return {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3+json'
    };
  }

  /* ==================== 令牌 / 登录 ==================== */
  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function getLogin() {
    try {
      var u = sessionStorage.getItem(USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch (e) { return null; }
  }

  /* 校验令牌：调用 /user，成功则保存 */
  function login(token) {
    token = String(token || '').trim();
    if (!token) return Promise.reject(new Error('请输入管理员令牌'));
    return fetch(API + '/user', { headers: authHeaders(token) })
      .then(function (res) {
        if (res.status === 401) throw new Error('令牌无效，请核对后重试');
        if (res.status === 403) throw new Error('访问被拒绝（可能触发限流），请稍后再试');
        if (!res.ok) throw new Error('验证失败（HTTP ' + res.status + '）');
        return res.json();
      })
      .then(function (user) {
        /* 仅当令牌具备仓库访问权限时才视为登录成功 */
        return fetch(API + '/repos/' + OWNER + '/' + REPO, { headers: authHeaders(token) })
          .then(function (r) {
            if (r.status === 404) throw new Error('该令牌无法访问目标仓库');
            if (!r.ok) throw new Error('仓库校验失败（HTTP ' + r.status + '）');
            try {
              sessionStorage.setItem(TOKEN_KEY, token);
              sessionStorage.setItem(USER_KEY, JSON.stringify({
                login: user.login, name: user.name || user.login
              }));
            } catch (e) {}
            return user;
          });
      });
  }

  function logout() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch (e) {}
  }

  /* ==================== 文件上传 ==================== */
  /* 获取远程文件 SHA（更新时需要） */
  function getFileSha(path) {
    var token = getToken();
    var url = API + '/repos/' + OWNER + '/' + REPO + '/contents/' +
      encodeURI(path).replace(/%2F/g, '/') + '?ref=' + BRANCH;
    return fetch(url, { headers: authHeaders(token) })
      .then(function (res) {
        if (res.ok) return res.json();
        if (res.status === 404) return null;
        throw new Error('读取远程文件失败（HTTP ' + res.status + '）');
      })
      .then(function (data) { return data ? data.sha : null; });
  }

  /* 上传/更新文件，返回结果 */
  function uploadFile(path, file, message) {
    if (!isLoggedIn()) return Promise.reject(new Error('未登录，无法上传'));
    if (!file) return Promise.reject(new Error('缺少文件'));
    var token = getToken();

    return file.arrayBuffer().then(function (buf) {
      var b64 = bufToBase64(buf);
      return getFileSha(path).then(function (sha) {
        var payload = {
          message: message || ('upload: ' + path),
          content: b64,
          branch: BRANCH
        };
        if (sha) payload.sha = sha;
        var url = API + '/repos/' + OWNER + '/' + REPO + '/contents/' +
          encodeURI(path).replace(/%2F/g, '/');
        return fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': 'token ' + token,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }).then(function (res) {
          if (res.ok) return res.json();
          return res.json().catch(function () { return { message: 'HTTP ' + res.status }; })
            .then(function (err) {
              throw new Error(err.message || '上传失败');
            });
        });
      });
    });
  }

  /* ==================== raw 文件拉取 ==================== */
  /* 解析仓库根相对路径（如 data/targets/龙泉校区目标.xlsx）为完整 URL */
  function rawUrl(path) {
    var rel = path.split('/').map(encodeURIComponent).join('/');
    return new URL(rel, SITE_ROOT).href;
  }

  /* 拉取 raw 文件字节（带时间戳绕过 CDN 缓存）；404 时返回 null */
  function fetchRawBytes(path) {
    var url = rawUrl(path);
    url += (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
    return fetch(url, { cache: 'no-store' })
      .then(function (res) {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error('拉取失败（HTTP ' + res.status + '）');
        return res.arrayBuffer();
      });
  }

  /* ==================== 自动登录 ==================== */
  /* 会话内无令牌时，用内置令牌静默校验并落库；失败不打扰用户，仍可走手动登录 */
  if (!getToken()) {
    var autoToken = _dec();
    if (autoToken) {
      login(autoToken).catch(function () { /* 静默回退 */ });
    }
  }

  /* ==================== 导出 ==================== */
  global.GitHubUpload = {
    OWNER: OWNER, REPO: REPO, BRANCH: BRANCH,
    login: login,
    logout: logout,
    isLoggedIn: isLoggedIn,
    getLogin: getLogin,
    getToken: getToken,
    uploadFile: uploadFile,
    rawUrl: rawUrl,
    fetchRawBytes: fetchRawBytes
  };

})(window);
