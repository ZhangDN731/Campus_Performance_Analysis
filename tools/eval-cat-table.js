// 点击「一类」大类，验证综合信息数据表
await new Promise(r => setTimeout(r, 800));
const btns = [...document.querySelectorAll('#catButtons .cat-btn')];
const target = btns.find(b => b.textContent.trim() === '一类');
if (!target) return { error: '未找到一类按钮', have: btns.map(b => b.textContent) };
target.click();
await new Promise(r => setTimeout(r, 1200));
const head = document.getElementById('tableHead');
const body = document.getElementById('tableBody');
const detailVisible = document.getElementById('detailSection').style.display !== 'none';
return {
  clicked: '一类',
  detailVisible,
  headerCount: head.querySelectorAll('th').length,
  rowCount: body.querySelectorAll('tr').length,
  firstRow: [...body.querySelector('tr')?.querySelectorAll('td') || []].slice(0, 5).map(td => td.textContent.trim())
};
