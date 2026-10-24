// 计时验证三年对比构建
await new Promise(r => setTimeout(r, 600));
const t0 = performance.now();
document.getElementById('compareViewBtn').click();
const t1 = performance.now();
await new Promise(r => setTimeout(r, 600));
const compareVisible = document.getElementById('compareView').style.display !== 'none';
const stats = [...document.querySelectorAll('#compareStats .compare-stat')].map(s => ({
  num: s.querySelector('.num')?.textContent.trim(),
  label: s.querySelector('.label')?.textContent.trim()
}));
const body = document.getElementById('compareTableBody');
const head = document.getElementById('compareTableHead');
const rows = body.querySelectorAll('tr');
const firstRow = [...rows[0]?.querySelectorAll('td') || []].map(td => td.textContent.trim());
return {
  compareVisible,
  buildToggleMs: Math.round(t1 - t0),
  stats,
  headerCount: head.querySelectorAll('th').length,
  rowCount: rows.length,
  firstRow
};
