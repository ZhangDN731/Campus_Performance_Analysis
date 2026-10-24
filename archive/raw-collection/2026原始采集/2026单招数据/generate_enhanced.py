import json
import os
import re
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

base_dir = r"C:\Users\XIAO\Desktop\大类信息\2026单招数据"

# 院校地址字典（从搜索结果整理）
school_addresses = {
    "保定幼儿师范高等专科学校": "河北省涿州市光明路303号（涿州校区）、定兴县兴华东路45号（定兴校区）",
    "保定理工学院": "河北省保定市莲池区南二环路1689号",
    "保定电力职业技术学院": "河北省保定市竞秀区乐凯南大街1278号",
    "保定职业技术学院": "河北省保定市朝阳南大街613号",
    "冀中职业学院": "河北省定州市刀枪街3号（南校区）、定州市北门街北口（北校区）",
    "北京工业职业技术学院": "北京市石景山区石门路368号",
    "北京汇佳职业学院": "北京市昌平区中关村科技园区昌平园创新路20号",
    "北京财贸职业学院": "北京市通州区北关大街88号（校本部）、河北省涿州市双塔区大石桥团结路8号（涿州校区）",
    "华北理工大学轻工学院": "河北省唐山市路北区高新技术产业园区大学西道11号（北校区）、唐山市丰润区林荫路1号南端（丰润校区）",
    "唐山工业职业技术大学": "河北省唐山市曹妃甸新城渤海大道25号",
    "唐山幼儿师范高等专科学校": "河北省唐山市高新技术开发区京唐智慧港",
    "唐山海运职业学院": "河北省唐山市曹妃甸区曹妃甸新城行知路27号",
    "唐山科技职业技术学院": "河北省唐山市路南区警钢路68号",
    "唐山职业技术学院": "河北省唐山市丰南区正泰街29号（南湖校区）",
    "图木舒克职业技术学院": "新疆图木舒克市锦江东街23号",
    "塔里木职业技术学院": "新疆阿拉尔市昆岗大道西2001号",
    "天津体育职业学院": "天津市静海区团泊新城西区团泊大道西侧",
    "天津国土资源和房屋职业学院": "天津市河北区雁门路与古北道交叉口东南",
    "天津滨海汽车工程职业学院": "天津市津南区葛沽镇创新二路36号（津南校区）、天津市武清区崔黄口镇兴广路1号（武清校区）",
    "天津石油职业技术学院": "天津市静海区团泊洼",
    "天津轻工职业技术学院": "天津市津南区海棠街雅观路1号",
    "宣化科技职业学院": "河北省张家口市宣化区皇城桥北77号（西校区）、宣化区师范街37号（东校区）",
    "廊坊卫生职业学院": "河北省廊坊市经济技术开发区东方大学城李四光道245号",
    "廊坊燕京职业技术学院": "河北省廊坊市三河市京哈公路",
    "廊坊职业技术学院": "河北省廊坊市开发区东方大学城二期",
    "张家口职业技术学院": "河北省张家口市",
    "承德应用技术职业学院": "河北省承德市高新技术开发区（南校区）、承德市双桥区（北校区）",
    "承德护理职业学院": "河北省承德市双桥区下二道河子",
    "新疆生产建设兵团兴新职业技术学院": "新疆铁门关市敬业大街2号",
    "昆玉职业技术学院": "新疆昆玉市长安街269号",
    "曹妃甸职业技术学院": "河北省唐山市曹妃甸区曹妃甸新城行知路25号",
    "沧州医学高等专科学校": "河北省沧州市",
    "沧州幼儿师范高等专科学校": "河北省泊头市",
    "沧州职业技术学院": "河北省沧州市新华区文昌路23号",
    "沧州航空职业学院": "河北省沧州市黄骅市芳林街与富春路交叉口东",
    "河北交通职业技术学院": "河北省石家庄市高新区槐安东路339号（主校区）、石家庄市桥西区友谊南大街258号（西校区）",
    "河北劳动关系职业学院": "河北省石家庄市红旗南大街学院路6号（主校区）、石家庄市新华区友谊北大街565号（康养校区）",
    "河北化工医药职业技术学院": "河北省石家庄市裕华区方兴路88号",
    "河北司法警官职业学院": "河北省石家庄市工农路587号（石家庄校区）",
    "河北外国语学院": "河北省石家庄市元氏县红旗北大街1218号",
    "河北女子职业技术学院": "河北省石家庄市桥西区汇文街16号",
    "河北对外经贸职业学院": "河北省秦皇岛市北戴河新区戴河大街6号",
    "河北工艺美术职业学院": "河北省保定市",
    "河北建材职业技术学院": "河北省秦皇岛市",
    "河北政法职业学院": "河北省石家庄市新华区友谊北大街569号（校本部）、学府路77号（学府校区）、滨河街1号（滨河校区）",
    "河北旅游职业学院": "河北省承德市高新技术产业开发区",
    "河北机电职业技术学院": "河北省邢台市信都区泉北西大街1169号",
    "河北正定师范高等专科学校": "河北省石家庄市正定县华安西路29号、石家庄市裕华区太行大街202号（南校区）",
    "河北科技学院": "河北省唐山市曹妃甸区新城东海路209号",
    "河北美术学院": "河北省石家庄市新乐市",
    "河北能源职业技术学院": "河北省唐山市路北区北新西道88号",
    "河北艺术职业学院": "河北省石家庄市长安区青园街149号",
    "河北资源环境职业技术学院": "河北省石家庄市中山西路901号（西王校区）、石家庄市元氏县装院路68号（蟠龙湖校区）",
    "河北轨道运输职业技术学院": "河北省石家庄市经济技术开发区赣江路9号（开发区校区）、石家庄市新华区宁安路43号（宁安路校区）",
    "河北软件职业技术学院": "河北省保定市莲池区东风东路999号",
    "河北青年管理干部学院": "河北省石家庄市",
    "渤海理工职业学院": "河北省黄骅市北海路1777号",
    "燕京理工学院": "河北省廊坊市三河市迎宾路808号",
    "石家庄人民医学高等专科学校": "河北省石家庄市桥西区红旗大街汇丰路18号、石家庄市正定县树林北路189号",
    "石家庄信息工程职业学院": "河北省石家庄市藁城区天祥大街81号（东校区）、天祥大街82号（西校区）",
    "石家庄农林职业学院": "河北省石家庄市",
    "石家庄医学高等专科学校": "河北省石家庄市灵寿县同新路1号",
    "石家庄城市经济职业学院": "河北省石家庄市经济技术开发区岗上文明路12号（主校区）、石家庄市经济技术开发区鼎盛街3号（东校区）",
    "石家庄工商职业学院": "河北省石家庄市桥西区滨河街3号",
    "石家庄工程职业学院": "河北省石家庄市新华区学府路169号",
    "石家庄幼儿师范高等专科学校": "河北省石家庄市鹿泉开发区御园路88号",
    "石家庄理工职业学院": "河北省石家庄市鹿泉区石柏南大街178号（鹿泉校区）、石家庄市高邑县万城镇府前街（高邑校区）",
    "石家庄科技信息职业学院": "河北省石家庄市红旗大街南端汇学路2号（石家庄校区）、石家庄灵寿经济开发区人民东路（灵寿校区）",
    "石家庄科技职业学院": "河北省石家庄市",
    "石家庄经济职业学院": "河北省石家庄市灵寿县三圣院乡同下村正南路33号",
    "石家庄职业技术学院": "河北省石家庄市正定新区天宁路226号、227号（正定校区）、石家庄市中山西路长兴街12号（长兴校区）",
    "石家庄财经职业学院": "河北省石家庄市鹿泉区卧龙路99号（卧龙校区）、石家庄市新华区学府路236号（学府校区）",
    "石家庄邮电职业技术学院": "河北省石家庄市裕华区体育南大街318号（西校区）、裕华区翟营大街51号（东校区）",
    "石家庄金融职业学院": "河北省石家庄市",
    "石家庄铁路职业技术学院": "河北省石家庄市四水厂路18号（长安校区）、石家庄市学府路41号（学府校区）",
    "秦皇岛工业职业技术学院": "河北省秦皇岛市海港区西港北路58号",
    "秦皇岛职业技术学院": "河北省秦皇岛市北戴河区联峰北路90号",
    "衡水健康科技职业学院": "河北省衡水市滨湖新区红旗大街2199号",
    "衡水职业技术学院": "河北省衡水市桃城区红旗大街2373号",
    "邢台医学院": "河北省邢台市信都区钢铁北路618号（钢铁路校区）、邢台市信都区邢昔路9号（皇寺校区）",
    "邢台应用技术职业学院": "河北省邢台市威县高新技术开发区开放东路",
    "邢台新能源职业学院": "河北省邢台市",
    "邯郸幼儿师范高等专科学校": "河北省武安市恩元路66号（主校区）、河北省大名县育才路43号（大名校区）",
    "邯郸应用技术职业学院": "河北省邯郸市广平县青莲街南556号",
    "邯郸科技职业学院": "河北省邯郸市冀南新区滏阳路1号",
    "邯郸职业技术学院": "河北省邯郸市邯山区渚河路768号",
    "重庆城市管理职业学院": "重庆市沙坪坝区虎溪大学城南二路151号",
    "铁门关职业技术学院": "新疆铁门关市将军西路",
    "河北工业职业技术大学": "河北省石家庄市红旗大街626号（红旗校区）、红旗大街333号（新石校区）、平山县东回舍镇（西柏坡校区）",
    "河北工业职业技术大学(宣钢分院)": "河北省张家口市宣化区清远路149号",
    "河北科技工程职业技术大学": "河北省邢台市信都区泉南西大街473号",
    "河北石油职业技术大学": "河北省承德市高新技术产业开发区学院路2号",
}

# 类别列表
categories = [
    ("一类", "1", "考试一类（土木建筑、资源环境与安全、水利等）"),
    ("二类", "2", "考试二类（交通运输、能源动力与材料等）"),
    ("三类", "3", "考试三类（装备制造等）"),
    ("四类", "4", "考试四类（农林牧渔、轻工纺织、生物与化工等）"),
    ("五类", "5", "考试五类（公共管理与服务、旅游、公安与司法等）"),
    ("六类", "6", "考试六类（教育与体育等）"),
    ("七类", "7", "考试七类（医药卫生等）"),
    ("八类美术", "24", "考试八类-美术设计类"),
    ("九类", "9", "考试九类（财经商贸等）"),
    ("十类", "10", "考试十类（电子与信息等）"),
]

# 样式
header_font = Font(name='微软雅黑', size=11, bold=True, color='FFFFFF')
header_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
header_alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
title_font = Font(name='微软雅黑', size=14, bold=True)
title_alignment = Alignment(horizontal='center', vertical='center')
data_font = Font(name='微软雅黑', size=10)
data_alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
center_alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
thin_border = Border(
    left=Side(style='thin', color='B4B4B4'),
    right=Side(style='thin', color='B4B4B4'),
    top=Side(style='thin', color='B4B4B4'),
    bottom=Side(style='thin', color='B4B4B4')
)
even_fill = PatternFill(start_color='D9E2F3', end_color='D9E2F3', fill_type='solid')

def get_school_address(school_name):
    """获取院校地址，处理校区/中外合作等后缀"""
    # 直接匹配
    if school_name in school_addresses:
        return school_addresses[school_name]
    
    # 去掉括号内容后匹配
    main_name = re.sub(r'[（(].*?[）)]', '', school_name).strip()
    if main_name in school_addresses:
        base_addr = school_addresses[main_name]
        # 如果是校区，提取校区信息
        match = re.search(r'[（(](.*?)[）)]', school_name)
        if match:
            campus_info = match.group(1)
            # 如果地址中已经包含多个校区，就直接返回
            return base_addr
        return base_addr
    
    return "待补充"

def generate_enhanced_school_details():
    """生成增强版院校详情工作簿（含地址）"""
    output_dir = os.path.join(base_dir, "院校详情_增强版")
    os.makedirs(output_dir, exist_ok=True)
    
    for cat_name, cat_id, cat_full in categories:
        # 读取原始院校详情数据
        json_path = os.path.join(base_dir, "院校详情", f"2026年河北单招_{cat_name}_院校详情.json")
        with open(json_path, 'r', encoding='utf-8') as f:
            original = json.load(f)
        
        # 读取该类别的招生计划数据，用于统计每个院校的专业数和计划总数
        plan_path = os.path.join(base_dir, "招生计划", f"2026年河北单招_{cat_name}_招生计划.json")
        with open(plan_path, 'r', encoding='utf-8') as f:
            plan_data = json.load(f)
        
        # 按院校统计专业数和计划总数
        school_plan_stats = {}
        for row in plan_data['data']:
            school = row.get('院校名称', '')
            if school not in school_plan_stats:
                school_plan_stats[school] = {'major_count': 0, 'total_plan': 0, 'majors': []}
            school_plan_stats[school]['major_count'] += 1
            try:
                school_plan_stats[school]['total_plan'] += int(row.get('计划数', 0))
            except:
                pass
            school_plan_stats[school]['majors'].append(f"{row.get('专业名称','')}({row.get('计划数','')}人,{row.get('学费(元/年)','')}元/年)")
        
        # 创建工作簿
        wb = Workbook()
        ws = wb.active
        ws.title = "招生院校详情"
        
        headers = ['序号', '院校名称', '所在地区', '办学性质', '院校地址', '招生专业数', '计划总数', '专业及计划学费明细']
        
        # 标题行
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
        title_cell = ws.cell(row=1, column=1, value=f"2026年河北高职单招招生院校详情 - {cat_full}")
        title_cell.font = title_font
        title_cell.alignment = title_alignment
        ws.row_dimensions[1].height = 30
        
        # 说明行
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(headers))
        source_cell = ws.cell(row=2, column=1, value=f"数据来源：河北省教育考试院 | 共 {len(original['data'])} 所院校 | 地址信息综合各院校官网及公开资料")
        source_cell.font = Font(name='微软雅黑', size=9, italic=True, color='666666')
        source_cell.alignment = Alignment(horizontal='center', vertical='center')
        ws.row_dimensions[2].height = 20
        
        # 表头
        header_row = 3
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=header_row, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
            cell.border = thin_border
        ws.row_dimensions[header_row].height = 25
        
        # 数据行
        for row_idx, row_data in enumerate(original['data'], header_row + 1):
            school_name = row_data.get('院校名称', '')
            address = get_school_address(school_name)
            stats = school_plan_stats.get(school_name, {'major_count': 0, 'total_plan': 0, 'majors': []})
            
            values = [
                row_data.get('序号', ''),
                school_name,
                row_data.get('所在地区', ''),
                row_data.get('办学性质', ''),
                address,
                stats['major_count'],
                stats['total_plan'],
                '；'.join(stats['majors'][:10]) + ('...' if len(stats['majors']) > 10 else '')
            ]
            
            for col_idx, value in enumerate(values, 1):
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                cell.font = data_font
                cell.border = thin_border
                if col_idx in [1, 3, 4, 6, 7]:
                    cell.alignment = center_alignment
                else:
                    cell.alignment = data_alignment
                if (row_idx - header_row) % 2 == 0:
                    cell.fill = even_fill
        
        # 列宽
        col_widths = [8, 32, 12, 12, 45, 12, 12, 60]
        for col_idx, width in enumerate(col_widths, 1):
            ws.column_dimensions[get_column_letter(col_idx)].width = width
        
        ws.freeze_panes = f'A{header_row + 1}'
        ws.auto_filter.ref = f'A{header_row}:{get_column_letter(len(headers))}{header_row + len(original["data"])}'
        
        output_path = os.path.join(output_dir, f"2026年河北单招_{cat_name}_院校详情_含地址.xlsx")
        wb.save(output_path)
        print(f"✓ {cat_name}: {len(original['data'])} 所院校")

def generate_major_plan_summary():
    """生成按大类的专业计划及学费汇总工作簿"""
    output_dir = os.path.join(base_dir, "专业计划及学费")
    os.makedirs(output_dir, exist_ok=True)
    
    for cat_name, cat_id, cat_full in categories:
        # 读取招生计划数据
        plan_path = os.path.join(base_dir, "招生计划", f"2026年河北单招_{cat_name}_招生计划.json")
        with open(plan_path, 'r', encoding='utf-8') as f:
            plan_data = json.load(f)
        
        # 读取分数线数据
        score_path = os.path.join(base_dir, "分数线", f"2026年河北单招_{cat_name}_分数线.json")
        with open(score_path, 'r', encoding='utf-8') as f:
            score_data = json.load(f)
        
        # 建立分数线映射
        score_map = {}
        for row in score_data['data']:
            key = (row.get('院校名称', ''), row.get('专业名称', ''))
            score_map[key] = row.get('录取投档分', '')
        
        # 创建工作簿
        wb = Workbook()
        ws = wb.active
        ws.title = "专业计划及学费"
        
        headers = ['序号', '院校名称', '院校地址', '专业名称', '计划数', '学制', '学费(元/年)', '2026投档最低分']
        
        # 标题行
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
        title_cell = ws.cell(row=1, column=1, value=f"2026年河北高职单招专业计划及学费 - {cat_full}")
        title_cell.font = title_font
        title_cell.alignment = title_alignment
        ws.row_dimensions[1].height = 30
        
        # 说明行
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(headers))
        total_plan = sum(int(r.get('计划数', 0)) for r in plan_data['data'] if r.get('计划数', '').isdigit())
        source_cell = ws.cell(row=2, column=1, value=f"数据来源：河北省教育考试院 | 共 {len(plan_data['data'])} 个专业 | 总计划数: {total_plan} 人")
        source_cell.font = Font(name='微软雅黑', size=9, italic=True, color='666666')
        source_cell.alignment = Alignment(horizontal='center', vertical='center')
        ws.row_dimensions[2].height = 20
        
        # 表头
        header_row = 3
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=header_row, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
            cell.border = thin_border
        ws.row_dimensions[header_row].height = 25
        
        # 数据行
        for row_idx, row_data in enumerate(plan_data['data'], header_row + 1):
            school_name = row_data.get('院校名称', '')
            major_name = row_data.get('专业名称', '')
            address = get_school_address(school_name)
            score = score_map.get((school_name, major_name), '')
            
            values = [
                row_idx - header_row,
                school_name,
                address,
                major_name,
                row_data.get('计划数', ''),
                row_data.get('学制', ''),
                row_data.get('学费(元/年)', ''),
                score
            ]
            
            for col_idx, value in enumerate(values, 1):
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                cell.font = data_font
                cell.border = thin_border
                if col_idx in [1, 5, 6, 7, 8]:
                    cell.alignment = center_alignment
                else:
                    cell.alignment = data_alignment
                if (row_idx - header_row) % 2 == 0:
                    cell.fill = even_fill
        
        # 列宽
        col_widths = [8, 30, 40, 40, 10, 8, 14, 14]
        for col_idx, width in enumerate(col_widths, 1):
            ws.column_dimensions[get_column_letter(col_idx)].width = width
        
        ws.freeze_panes = f'A{header_row + 1}'
        ws.auto_filter.ref = f'A{header_row}:{get_column_letter(len(headers))}{header_row + len(plan_data["data"])}'
        
        output_path = os.path.join(output_dir, f"2026年河北单招_{cat_name}_专业计划及学费.xlsx")
        wb.save(output_path)
        print(f"✓ {cat_name}: {len(plan_data['data'])} 个专业, 总计划 {total_plan} 人")

# 执行
print("=" * 60)
print("生成增强版院校详情（含地址）")
print("=" * 60)
generate_enhanced_school_details()

print("\n" + "=" * 60)
print("生成专业计划及学费汇总（含地址和分数线）")
print("=" * 60)
generate_major_plan_summary()

print("\n" + "=" * 60)
print("全部生成完成！")
print("=" * 60)
