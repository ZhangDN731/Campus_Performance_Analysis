// 打开三年对比视图，验证对比表
await new Promise(r => setTimeout(r, 800));
document.getElementById('compareViewBtn').click();
await new Promise(r => setTimeout(r, 1500));
const compareVisible = document.getElementById('compareView').style.display !== 'none';
const stats = [...document.querySelectorAll('#compareStats .compare-stat')].map(s => s.querySelector('.num')?.textContent.trim());
const head = document.getElementById('compareTableHead');
const body = document.getElementById('compareTableBody');
const firstRow = [...body.querySelector('tr')?.querySelectorAll('td') || []].map(td => td.textContent.trim());
return {
  compareVisible,
  compareStats: stats,
  headerCount: head.querySelectorAll('th').length,
  rowCount: body.querySelectorAll('tr').length,
  firstRow
};
