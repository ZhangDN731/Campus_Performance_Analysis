import json
import os
from openpyxl import load_workbook

base_dir = r"C:\Users\XIAO\Desktop\大类信息\2026单招数据"

print("=" * 70)
print("数据验证报告")
print("=" * 70)

# 1. 文件完整性检查
print("\n【1. 文件完整性检查】")
data_types = ["分数线", "招生计划", "院校详情", "一分一档"]
categories = ["一类", "二类", "三类", "四类", "五类", "六类", "七类", "八类美术", "九类", "十类"]

all_files_ok = True
for dt in data_types:
    dir_path = os.path.join(base_dir, dt)
    xlsx_files = [f for f in os.listdir(dir_path) if f.endswith('.xlsx')]
    json_files = [f for f in os.listdir(dir_path) if f.endswith('.json')]
    print(f"  {dt}: Excel {len(xlsx_files)} 个, JSON {len(json_files)} 个", end="")
    if len(xlsx_files) == 10 and len(json_files) == 10:
        print(" ✓")
    else:
        print(" ✗ 数量不符!")
        all_files_ok = False

# 2. Excel内容验证 - 抽查每个类型的第一个和最后一个文件
print("\n【2. Excel内容抽样验证】")

def verify_excel(filepath, expected_headers):
    wb = load_workbook(filepath)
    ws = wb.active
    
    # 检查标题行
    title = ws.cell(row=1, column=1).value
    
    # 检查表头（第3行）
    actual_headers = []
    for col in range(1, len(expected_headers) + 1):
        actual_headers.append(ws.cell(row=3, column=col).value)
    
    # 统计数据行数
    data_rows = 0
    for row in range(4, ws.max_row + 1):
        if ws.cell(row=row, column=1).value:
            data_rows += 1
    
    # 获取首行和末行数据
    first_row = [ws.cell(row=4, column=col).value for col in range(1, len(expected_headers) + 1)]
    last_row = [ws.cell(row=3 + data_rows, column=col).value for col in range(1, len(expected_headers) + 1)]
    
    return {
        'title': title,
        'headers_match': actual_headers == expected_headers,
        'actual_headers': actual_headers,
        'data_rows': data_rows,
        'first_row': first_row,
        'last_row': last_row,
        'freeze_panes': ws.freeze_panes,
        'auto_filter': ws.auto_filter.ref
    }

# 分数线验证
print("\n  --- 分数线（一类）---")
result = verify_excel(
    os.path.join(base_dir, "分数线", "2026年河北单招_一类_分数线.xlsx"),
    ['院校名称', '专业名称', '考试类', '录取投档分']
)
print(f"  标题: {result['title']}")
print(f"  表头匹配: {'✓' if result['headers_match'] else '✗'} {result['actual_headers']}")
print(f"  数据行数: {result['data_rows']}")
print(f"  首行: {result['first_row']}")
print(f"  末行: {result['last_row']}")
print(f"  冻结窗格: {result['freeze_panes']}")
print(f"  自动筛选: {result['auto_filter']}")

# 招生计划验证
print("\n  --- 招生计划（三类）---")
result = verify_excel(
    os.path.join(base_dir, "招生计划", "2026年河北单招_三类_招生计划.xlsx"),
    ['院校名称', '专业名称', '考试类', '计划数', '学制', '学费(元/年)']
)
print(f"  标题: {result['title']}")
print(f"  表头匹配: {'✓' if result['headers_match'] else '✗'} {result['actual_headers']}")
print(f"  数据行数: {result['data_rows']}")
print(f"  首行: {result['first_row']}")
print(f"  末行: {result['last_row']}")

# 院校详情验证
print("\n  --- 院校详情（十类）---")
result = verify_excel(
    os.path.join(base_dir, "院校详情", "2026年河北单招_十类_院校详情.xlsx"),
    ['序号', '院校名称', '所在地区', '办学性质', '操作']
)
print(f"  标题: {result['title']}")
print(f"  表头匹配: {'✓' if result['headers_match'] else '✗'} {result['actual_headers']}")
print(f"  数据行数: {result['data_rows']}")
print(f"  首行: {result['first_row']}")
print(f"  末行: {result['last_row']}")

# 一分一档验证
print("\n  --- 一分一档（七类）---")
result = verify_excel(
    os.path.join(base_dir, "一分一档", "2026年河北单招_七类_一分一档.xlsx"),
    ['分数', '本段人数', '累计人数', '累计占比']
)
print(f"  标题: {result['title']}")
print(f"  表头匹配: {'✓' if result['headers_match'] else '✗'} {result['actual_headers']}")
print(f"  数据行数: {result['data_rows']}")
print(f"  首行: {result['first_row']}")
print(f"  末行: {result['last_row']}")

# 3. 数据一致性检查 - JSON与Excel行数对比
print("\n【3. JSON与Excel数据一致性检查】")
all_consistent = True
for dt in data_types:
    dir_path = os.path.join(base_dir, dt)
    for cat in categories:
        json_path = os.path.join(dir_path, f"2026年河北单招_{cat}_{dt}.json")
        xlsx_path = os.path.join(dir_path, f"2026年河北单招_{cat}_{dt}.xlsx")
        
        with open(json_path, 'r', encoding='utf-8') as f:
            json_data = json.load(f)
        json_count = len(json_data['data'])
        
        wb = load_workbook(xlsx_path)
        ws = wb.active
        xlsx_count = 0
        for row in range(4, ws.max_row + 1):
            if ws.cell(row=row, column=1).value:
                xlsx_count += 1
        
        status = "✓" if json_count == xlsx_count else "✗"
        if json_count != xlsx_count:
            all_consistent = False
            print(f"  {dt}_{cat}: JSON={json_count}, Excel={xlsx_count} {status}")

if all_consistent:
    print("  全部40个文件JSON与Excel数据行数一致 ✓")

# 4. 一分一档数据逻辑验证
print("\n【4. 一分一档数据逻辑验证】")
for cat in categories:
    filepath = os.path.join(base_dir, "一分一档", f"2026年河北单招_{cat}_一分一档.json")
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)['data']
    
    # 验证累计人数逻辑
    errors = []
    prev_cumulative = 0
    for i, row in enumerate(data):
        try:
            score = int(row['分数'])
            segment = int(row['本段人数'])
            cumulative = int(row['累计人数'])
            
            if i == 0:
                if cumulative != segment:
                    errors.append(f"第{i+1}行: 首行累计({cumulative}) != 本段({segment})")
            else:
                if cumulative != prev_cumulative + segment:
                    errors.append(f"第{i+1}行(分数{score}): 累计({cumulative}) != 上一行累计({prev_cumulative}) + 本段({segment})")
            
            prev_cumulative = cumulative
        except (ValueError, KeyError) as e:
            errors.append(f"第{i+1}行: 数据解析错误 - {e}")
    
    if errors:
        print(f"  {cat}: ✗ 发现 {len(errors)} 个逻辑错误")
        for e in errors[:3]:
            print(f"    - {e}")
    else:
        total = data[-1]['累计人数'] if data else 0
        max_score = data[0]['分数'] if data else 0
        min_score = data[-1]['分数'] if data else 0
        print(f"  {cat}: ✓ 逻辑正确 (最高分{max_score}, 最低分{min_score}, 总人数{total})")

# 5. 分数线与招生计划专业对应性检查
print("\n【5. 分数线与招生计划专业对应性检查】")
for cat in categories:
    score_path = os.path.join(base_dir, "分数线", f"2026年河北单招_{cat}_分数线.json")
    plan_path = os.path.join(base_dir, "招生计划", f"2026年河北单招_{cat}_招生计划.json")
    
    with open(score_path, 'r', encoding='utf-8') as f:
        score_data = json.load(f)['data']
    with open(plan_path, 'r', encoding='utf-8') as f:
        plan_data = json.load(f)['data']
    
    score_pairs = set((r['院校名称'], r['专业名称']) for r in score_data)
    plan_pairs = set((r['院校名称'], r['专业名称']) for r in plan_data)
    
    if score_pairs == plan_pairs:
        print(f"  {cat}: ✓ 专业完全对应 ({len(score_pairs)} 个专业)")
    else:
        only_score = score_pairs - plan_pairs
        only_plan = plan_pairs - score_pairs
        print(f"  {cat}: ⚠ 存在差异 (仅分数线:{len(only_score)}, 仅招生计划:{len(only_plan)})")
        if only_score:
            for s in list(only_score)[:2]:
                print(f"    仅分数线: {s}")

print("\n" + "=" * 70)
print("验证完成")
print("=" * 70)
