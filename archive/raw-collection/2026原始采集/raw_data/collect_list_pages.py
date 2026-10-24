#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""采集2025年河北单招十大类列表页数据：分数线、招生计划、一分一档"""

import requests
from bs4 import BeautifulSoup
import json
import re
import time
import os

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
BASE = 'http://www.hbdzxx.com'
OUT_DIR = r'C:\Users\XIAO\Desktop\大类信息\raw_data'

CATEGORIES = [
    (1, '考试一类', '土木建筑、资源环境与安全、水利'),
    (2, '考试二类', '交通运输、能源动力与材料'),
    (3, '考试三类', '装备制造'),
    (4, '考试四类', '农林牧渔、轻工纺织、生物与化工、食品药品与粮食'),
    (5, '考试五类', '公共管理与服务、旅游、公安与司法'),
    (6, '考试六类', '教育与体育、新闻传播'),
    (7, '考试七类', '医药卫生（临床医学类专业除外）'),
    (24, '考试八类-美术设计类', '文化艺术'),
    (9, '考试九类', '财经商贸'),
    (10, '考试十类', '电子信息、计算机'),
]

def fetch(url, retries=3):
    for i in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            r.encoding = 'utf-8'
            if r.status_code == 200:
                return r.text
            print(f'  Status {r.status_code}, retry {i+1}')
        except Exception as e:
            print(f'  Error: {e}, retry {i+1}')
        time.sleep(2)
    return None

def parse_table(html):
    """解析表格，返回表头和数据行"""
    soup = BeautifulSoup(html, 'lxml')
    table = soup.find('table')
    if not table:
        return [], []
    rows = table.find_all('tr')
    if not rows:
        return [], []
    header = [th.get_text(strip=True) for th in rows[0].find_all(['th', 'td'])]
    data = []
    for row in rows[1:]:
        cells = row.find_all('td')
        data.append([cell.get_text(strip=True) for cell in cells])
    return header, data

def get_control_line(html, cat_name):
    """从页面提取省控制线"""
    text = BeautifulSoup(html, 'lxml').get_text()
    # Try multiple patterns
    patterns = [
        rf'2025年{re.escape(cat_name)}控制线[：:]\s*(\d+)',
        rf'2025年{re.escape(cat_name.split("-")[0])}控制线[：:]\s*(\d+)',
        r'控制线[：:]\s*(\d+)',
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            return m.group(1)
    return '未公布'

def get_school_links(html):
    """从招生计划页面提取院校名称和详情页URL"""
    soup = BeautifulSoup(html, 'lxml')
    table = soup.find('table')
    if not table:
        return {}
    links = {}
    for row in table.find_all('tr')[1:]:
        cells = row.find_all('td')
        if cells:
            a = cells[0].find('a', href=True)
            if a:
                name = a.get_text(strip=True)
                url = a['href']
                if url.startswith('/'):
                    url = BASE + url
                links[name] = url
    return links

def collect_score_lines():
    """采集分数线"""
    print('=== 采集分数线 ===')
    result = {}
    for cid, cname, cdesc in CATEGORIES:
        url = f'{BASE}/score/line/2025/{cid}/'
        print(f'  {cname} ({url})')
        html = fetch(url)
        if not html:
            print(f'  FAILED: {cname}')
            continue
        header, data = parse_table(html)
        control = get_control_line(html, cname)
        result[cid] = {
            'name': cname,
            'desc': cdesc,
            'control_line': control,
            'header': header,
            'data': data,
            'source_url': url,
            'count': len(data)
        }
        print(f'    {len(data)} 条, 控制线={control}')
        time.sleep(0.5)
    with open(os.path.join(OUT_DIR, 'score_lines.json'), 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f'  保存到 score_lines.json, 共 {len(result)} 个大类')
    return result

def collect_plans():
    """采集招生计划，同时提取院校链接"""
    print('=== 采集招生计划 ===')
    result = {}
    all_schools = {}
    for cid, cname, cdesc in CATEGORIES:
        url = f'{BASE}/school/plan/2025/{cid}/'
        print(f'  {cname} ({url})')
        html = fetch(url)
        if not html:
            print(f'  FAILED: {cname}')
            continue
        header, data = parse_table(html)
        control = get_control_line(html, cname)
        school_links = get_school_links(html)
        # Merge school links
        for name, surl in school_links.items():
            if name not in all_schools:
                all_schools[name] = surl
        result[cid] = {
            'name': cname,
            'desc': cdesc,
            'control_line': control,
            'header': header,
            'data': data,
            'source_url': url,
            'count': len(data)
        }
        print(f'    {len(data)} 条, 控制线={control}, 院校链接={len(school_links)}')
        time.sleep(0.5)
    with open(os.path.join(OUT_DIR, 'plans.json'), 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT_DIR, 'school_links.json'), 'w', encoding='utf-8') as f:
        json.dump(all_schools, f, ensure_ascii=False, indent=2)
    print(f'  保存到 plans.json, 共 {len(result)} 个大类')
    print(f'  保存到 school_links.json, 共 {len(all_schools)} 所院校')
    return result, all_schools

def collect_yifenyidang():
    """采集一分一档"""
    print('=== 采集一分一档 ===')
    result = {}
    for cid, cname, cdesc in CATEGORIES:
        url = f'{BASE}/score/yifenyidang/2025/{cid}/'
        print(f'  {cname} ({url})')
        html = fetch(url)
        if not html:
            print(f'  FAILED: {cname}')
            continue
        header, data = parse_table(html)
        result[cid] = {
            'name': cname,
            'desc': cdesc,
            'header': header,
            'data': data,
            'source_url': url,
            'count': len(data)
        }
        print(f'    {len(data)} 条')
        time.sleep(0.5)
    with open(os.path.join(OUT_DIR, 'yifenyidang.json'), 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f'  保存到 yifenyidang.json, 共 {len(result)} 个大类')
    return result

if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    score = collect_score_lines()
    plans, schools = collect_plans()
    yfyd = collect_yifenyidang()
    print('\n=== 采集完成 ===')
    print(f'分数线: {sum(v["count"] for v in score.values())} 条')
    print(f'招生计划: {sum(v["count"] for v in plans.values())} 条')
    print(f'一分一档: {sum(v["count"] for v in yfyd.values())} 条')
    print(f'独特院校: {len(schools)} 所')
