// 稳态后：点击表格第一个学生姓名，验证学生详情弹窗
await new Promise(r => setTimeout(r, 1200));
const cell = document.querySelector('#tableWrap .name-cell');
if (!cell) return { error: '未找到姓名单元格' };
const name = cell.getAttribute('data-name');
cell.click();
await new Promise(r => setTimeout(r, 900));
const mask = document.getElementById('studentMask');
const modal = document.getElementById('studentModal');
return {
  clicked: name,
  shown: mask.classList.contains('show'),
  hasContent: modal.innerHTML.length > 500,
  blocks: modal.querySelectorAll('.modal-block').length
};
