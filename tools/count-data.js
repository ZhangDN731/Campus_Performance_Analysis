const path = require('path');
const fs = require('fs');
const base = path.join(__dirname, '..', 'assets', 'data');
function load(name) {
  const code = fs.readFileSync(path.join(base, name), 'utf8');
  const m = code.match(/const\s+(\w+)\s*=/);
  return new Function(code + '; return ' + m[1] + ';')();
}
const MAP = { '2024': load('data_2024.js'), '2025': load('data_2025.js'), '2026': load('data_2026.js') };
for (const [y, d] of Object.entries(MAP)) {
  let score = 0, yf = 0, schools = 0, plans = 0;
  for (const c of Object.values(d)) {
    score += c.scoreLines.length; yf += c.yifenyidang.length;
    schools += c.schools.length; plans += c.plans.length;
  }
  console.log(y + ' 分数线=' + score + ' 一分一档=' + yf + ' 院校=' + schools + ' 计划=' + plans);
}
