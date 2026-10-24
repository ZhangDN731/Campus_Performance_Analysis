import json
import os

base_dir = r"C:\Users\XIAO\Desktop\大类信息\2026单招数据"

special_schools = [
    "沧州职业技术学院(渤海校区，就读于沧州渤海新区中捷产业园区)",
    "保定电力职业技术学院（送变电订单班）",
    "唐山职业技术学院（中外合作办学）"
]

categories = ["二类","三类","七类","九类","十类"]
for cat in categories:
    plan_path = os.path.join(base_dir, "招生计划", f"2026年河北单招_{cat}_招生计划.json")
    with open(plan_path, "r", encoding="utf-8") as f:
        plan_data = json.load(f)
    
    print(f"=== {cat} ===")
    for school in special_schools:
        majors = [row for row in plan_data["data"] if row.get("院校名称","") == school]
        if majors:
            print(f"  {school}:")
            for m in majors:
                xuefei = m.get("学费(元/年)", "")
                print(f"    - {m['专业名称']} (计划{m['计划数']}人, 学费{xuefei}元)")
    print()
