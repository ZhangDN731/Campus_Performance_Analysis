// 在 node 中加载真实数据，复刻优化后的 buildCompareData，验证正确性与耗时
const path = require('path');
const fs = require('fs');
const base = path.join(__dirname, '..', 'assets', 'data');
function load(name) {
  const code = fs.readFileSync(path.join(base, name), 'utf8');
  const m = code.match(/const\s+(\w+)\s*=/);
  return new Function(code + '; return ' + m[1] + ';')();
}
const DATA_MAP = { '2024': load('data_2024.js'), '2025': load('data_2025.js'), '2026': load('data_2026.js') };
const YEARS = ['2024', '2025', '2026'];

function normalizeMajorName(name) {
  if (!name) return '';
  return String(name).replace(/\s*\[.*?\]\s*/g, '').replace(/\s*（.*?）\s*/g, '').replace(/\s*\(.*?\)\s*/g, '').trim();
}

// 二分查找（优化版）
function getRankFromYifenyidang(year, catId, score) {
  if (!score || isNaN(parseFloat(score))) return null;
  const s = parseFloat(score);
  const cat = DATA_MAP[year][catId];
  if (!cat || !cat.yifenyidang || cat.yifenyidang.length === 0) return null;
  const arr = cat.yifenyidang;
  let lo = 0, hi = arr.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const itemScore = parseFloat(arr[mid]['分数']);
    if (!isNaN(itemScore) && itemScore <= s) { ans = mid; hi = mid - 1; }
    else lo = mid + 1;
  }
  return parseInt(arr[ans]['累计人数']);
}

// 院校索引（优化版）
const SCHOOL_INFO_INDEX = (() => {
  const m = new Map();
  for (const year of ['2026', '2025', '2024']) {
    for (const cat of Object.values(DATA_MAP[year])) {
      for (const s of cat.schools) {
        const name = s['院校名称'];
        if (name && !m.has(name)) m.set(name, s);
      }
    }
  }
  return m;
})();
function findSchoolInfo(schoolName) {
  return SCHOOL_INFO_INDEX.has(schoolName) ? SCHOOL_INFO_INDEX.get(schoolName) : null;
}

let compareDataCache = null;
function buildCompareData() {
  const map = {};
  YEARS.forEach(year => {
    Object.values(DATA_MAP[year]).forEach(cat => {
      cat.scoreLines.forEach(item => {
        const school = item['院校名称'] || '';
        const majorRaw = item['专业名称'] || '';
        const majorNorm = normalizeMajorName(majorRaw);
        const examCat = item['考试类'] || cat.name;
        const score = item['录取投档分'] || '';
        if (!school || !majorNorm || school === '—' || majorNorm === '—') return;
        const key = school + '||' + majorNorm + '||' + examCat;
        if (!map[key]) {
          const si = findSchoolInfo(school);
          map[key] = {
            '院校名称': school, '专业名称': majorRaw, '专业名称_标准': majorNorm,
            '考试类': examCat,
            '办学性质': si ? (si['办学性质'] || '—') : '—',
            '所在地区': si ? (si['所在地区'] || '—') : '—',
            score2024: null, score2025: null, score2026: null,
            rank2024: null, rank2025: null, rank2026: null,
          };
        }
        const scoreNum = parseFloat(score);
        if (!isNaN(scoreNum)) {
          map[key]['score' + year] = scoreNum;
          map[key]['rank' + year] = getRankFromYifenyidang(year, cat.id, scoreNum);
        } else {
          map[key]['score' + year] = score;
        }
      });
    });
  });
  compareDataCache = Object.values(map).map(item => {
    const s24 = parseFloat(item.score2024), s26 = parseFloat(item.score2026);
    const r24 = parseInt(item.rank2024), r26 = parseInt(item.rank2026);
    item.scoreDiff = (!isNaN(s24) && !isNaN(s26)) ? (s26 - s24) : null;
    item.rankDiff = (!isNaN(r24) && !isNaN(r26)) ? (r26 - r24) : null;
    return item;
  });
}

const t0 = process.hrtime.bigint();
buildCompareData();
const t1 = process.hrtime.bigint();
console.log('buildCompareData 耗时: ' + Number(t1 - t0) / 1e6 + ' ms');
const d = compareDataCache;
const total = d.length;
const hasAllThree = d.filter(x => x.score2024 !== null && x.score2025 !== null && x.score2026 !== null).length;
const scoreUp = d.filter(x => x.scoreDiff !== null && x.scoreDiff > 0).length;
const scoreDown = d.filter(x => x.scoreDiff !== null && x.scoreDiff < 0).length;
const schools = new Set(d.map(x => x['院校名称'])).size;
const has25and26 = d.filter(x => !isNaN(parseFloat(x.score2025)) && !isNaN(parseFloat(x.score2026))).length;
const up25 = d.filter(x => { const a = parseFloat(x.score2025), b = parseFloat(x.score2026); return !isNaN(a) && !isNaN(b) && b > a; }).length;
const down25 = d.filter(x => { const a = parseFloat(x.score2025), b = parseFloat(x.score2026); return !isNaN(a) && !isNaN(b) && b < a; }).length;
console.log('对比条目总数=' + total + ' 覆盖院校=' + schools + ' 三年均有=' + hasAllThree + ' 上涨=' + scoreUp + ' 下降=' + scoreDown);
console.log('2025&2026均有分数=' + has25and26 + ' 其中26上涨=' + up25 + ' 26下降=' + down25);
console.log('样例（前3条）:');
d.slice(0, 3).forEach(x => console.log('  ' + x['院校名称'] + ' | ' + x['专业名称'] + ' | ' + x['办学性质'] + ' | ' + x['所在地区'] + ' | 24:' + x.score2024 + ' 25:' + x.score2025 + ' 26:' + x.score2026 + ' | 位次26:' + x.rank2026));
