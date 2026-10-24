const path = require('path');
const fs = require('fs');
const base = path.join(__dirname, '..', 'assets', 'data');
function load(name) {
  const code = fs.readFileSync(path.join(base, name), 'utf8');
  const m = code.match(/const\s+(\w+)\s*=/);
  return new Function(code + '; return ' + m[1] + ';')();
}
const d24 = load('data_2024.js');
for (const cat of Object.values(d24)) {
  cat.scoreLines.forEach((item, i) => {
    console.log(`[${cat.id}] 院校="${item['院校名称']}" 专业="${item['专业名称']}" 投档分="${item['录取投档分']}"`);
  });
}
