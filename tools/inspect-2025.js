const path = require('path');
const fs = require('fs');
const base = path.join(__dirname, '..', 'assets', 'data');
function load(name) {
  const code = fs.readFileSync(path.join(base, name), 'utf8');
  const m = code.match(/const\s+(\w+)\s*=/);
  return new Function(code + '; return ' + m[1] + ';')();
}
const d25 = load('data_2025.js');
let numeric = 0, dash = 0, other = 0;
const otherSamples = [];
for (const cat of Object.values(d25)) {
  for (const item of cat.scoreLines) {
    const s = item['录取投档分'];
    if (s === '—' || s === '—' || s === '') dash++;
    else if (!isNaN(parseFloat(s))) numeric++;
    else { other++; if (otherSamples.length < 5) otherSamples.push(s); }
  }
}
console.log('2025 分数线: 数字=' + numeric + ' 破折号/空=' + dash + ' 其他=' + other);
console.log('其他样例:', otherSamples);
// 打印前几条
let n = 0;
for (const cat of Object.values(d25)) {
  for (const item of cat.scoreLines) {
    if (n < 6) console.log(`  [${cat.id}] ${item['院校名称']} | ${item['专业名称']} | 分="${item['录取投档分']}"`);
    n++;
  }
}
