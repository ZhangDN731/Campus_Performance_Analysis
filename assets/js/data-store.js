/* ============================================================
   data-store.js — IndexedDB 持久化 + 工作簿读取
   上传的成绩表 / 目标院校表保存在浏览器本地，刷新不丢失；
   成绩表未上传时使用内置默认数据（27届龙泉周测成绩）。
   ============================================================ */

(function (global) {
  'use strict';

  var DB_NAME = 'learning-objectives-db';
  var DB_VER = 1;
  var STORE = 'files';
  var DEFAULT_GRADES_URL = '../data/27届龙泉周测成绩.xlsx';
  var DEFAULT_GRADES_NAME = '27届龙泉周测成绩.xlsx（内置数据）';

  var KEY_GRADES = 'grades';
  var KEY_TARGETS = 'targets';

  /* ---------- IndexedDB 基础 ---------- */
  var dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function txPut(key, blob, meta) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put({ blob: blob, name: meta.name, ts: meta.ts }, key);
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  function txGet(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, 'readonly');
        var req = t.objectStore(STORE).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function txDelete(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).delete(key);
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  /* ---------- 工作簿读取 ---------- */
  function readWorkbook(blob) {
    return blob.arrayBuffer().then(function (buf) {
      return XLSX.read(new Uint8Array(buf), { type: 'array' });
    });
  }

  /* ---------- 内置默认成绩：优先内嵌 base64（file:// 也可用），fetch 兜底 ---------- */
  function b64ToBlob(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  function loadDefaultGradesBlob() {
    if (global.DEFAULT_GRADES_B64) {
      return Promise.resolve(b64ToBlob(global.DEFAULT_GRADES_B64));
    }
    return fetch(DEFAULT_GRADES_URL).then(function (resp) {
      if (!resp.ok) throw new Error('默认成绩数据加载失败');
      return resp.blob();
    });
  }

  /* ---------- 对外接口 ---------- */

  /* 保存上传文件；key 为 grades / targets */
  function saveUpload(key, file) {
    var meta = { name: file.name, ts: Date.now() };
    return txPut(key, file, meta);
  }

  function resetGrades() { return txDelete(KEY_GRADES); }
  function clearTargets() { return txDelete(KEY_TARGETS); }

  /* 加载全部数据并解析 */
  function loadAll() {
    var result = {
      gradeData: null,
      targetData: null,
      gradesMeta: null,
      targetsMeta: null
    };

    return txGet(KEY_GRADES).then(function (rec) {
      if (rec) {
        result.gradesMeta = { name: rec.name, ts: rec.ts, isDefault: false };
        return readWorkbook(rec.blob);
      }
      /* 无上传 → 加载内置默认成绩（内嵌 base64，file:// 同样可用） */
      return loadDefaultGradesBlob().then(function (blob) {
        var name = global.DEFAULT_GRADES_NAME || DEFAULT_GRADES_NAME;
        result.gradesMeta = { name: name, ts: Date.now(), isDefault: true };
        return readWorkbook(blob);
      });
    }).then(function (wb) {
      result.gradeData = AppCore.parseGradeWorkbook(wb);
      return txGet(KEY_TARGETS);
    }).then(function (rec) {
      if (rec) {
        result.targetsMeta = { name: rec.name, ts: rec.ts, isDefault: false };
        return readWorkbook(rec.blob).then(function (wb) {
          result.targetData = AppCore.parseTargetWorkbook(wb);
        });
      }
      result.targetData = { classes: {}, sheetNames: [] };
      result.targetsMeta = null;
    }).then(function () { return result; });
  }

  function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    function p(x) { return String(x).padStart(2, '0'); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  global.DataStore = {
    KEY_GRADES: KEY_GRADES,
    KEY_TARGETS: KEY_TARGETS,
    saveUpload: saveUpload,
    resetGrades: resetGrades,
    clearTargets: clearTargets,
    loadAll: loadAll,
    fmtTime: fmtTime
  };

})(window);
