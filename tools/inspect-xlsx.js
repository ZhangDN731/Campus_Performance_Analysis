const path = require('path');
const XLSX = require(path.join(__dirname, '..', 'node_modules', 'xlsx'));
const files = [
  'C:\\Users\\XIAO\\Desktop\\成绩分析完整版\\大类信息\\Admission_Info\\data\\2025\\分数线\\2025年河北单招_一类_分数线.xlsx',
  'C:\\Users\\XIAO\\Desktop\\成绩分析完整版\\大类信息\\Admission_Info\\data\\2024\\分数线\\2024年河北单招_一类_分数线.xlsx'
];
for (const f of files) {
  console.log('===== ' + path.basename(f) + ' =====');
  const wb = XLSX.readFile(f);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  rows.slice(0, 6).forEach(r => console.log('  ' + JSON.stringify(r)));
  console.log('  总行数: ' + rows.length);
}
