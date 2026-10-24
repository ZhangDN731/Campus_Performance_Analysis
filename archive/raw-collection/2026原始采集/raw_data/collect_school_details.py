#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""采集院校详情页数据：办学性质、城市、层次、地址等"""

import requests
from bs4 import BeautifulSoup
import json
import re
import time
import os
import sys

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
BASE = 'http://www.hbdzxx.com'
OUT_DIR = r'C:\Users\XIAO\Desktop\大类信息\raw_data'

def fetch(url, retries=3):
    for i in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            r.encoding = 'utf-8'
            if r.status_code == 200:
                return r.text
        except Exception as e:
            print(f'  Error: {e}, retry {i+1}')
        time.sleep(2)
    return None

def parse_school_detail(html, school_name, detail_url):
    """解析院校详情页"""
    soup = BeautifulSoup(html, 'lxml')
    result = {
        '院校名称': school_name,
        '详情页URL': detail_url,
        '办学性质': '',
        '所在城市': '',
        '院校层次': '',
        '详细地址': '',
        '院校代码': '',
        '招生大类数': '',
    }
    
    # 从 page-hero 提取基本信息: "民办 · 保定 · 本科"
    hero = soup.find('div', class_='page-hero')
    if hero:
        hero_text = hero.get_text(strip=True)
        # 移除院校名称
        hero_text = hero_text.replace(school_name, '').strip()
        # 分割 ·
        parts = [p.strip() for p in hero_text.split('·') if p.strip()]
        if len(parts) >= 1:
            result['办学性质'] = parts[0]
        if len(parts) >= 2:
            result['所在城市'] = parts[1]
        if len(parts) >= 3:
            result['院校层次'] = parts[2]
    
    # 从第一个表格提取院校代码
    table = soup.find('table')
    if table:
        rows = table.find_all('tr')
        if len(rows) > 1:
            first_data_row = rows[1]
            cells = first_data_row.find_all('td')
            if cells:
                result['院校代码'] = cells[0].get_text(strip=True)
    
    # 提取招生大类数
    text = soup.get_text()
    m = re.search(r'该校在以下\s*(\d+)\s*个大类招生', text)
    if m:
        result['招生大类数'] = m.group(1)
    
    # 尝试查找详细地址 - 搜索页面中所有包含地址关键词的文本
    # 院校详情页通常没有详细地址，尝试从meta或其他位置
    for keyword in ['学校地址', '学院地址', '校址', '地址：', '地址:']:
        idx = text.find(keyword)
        if idx >= 0:
            # 提取后面的地址文本
            snippet = text[idx:idx+100]
            # 尝试匹配地址模式
            addr_match = re.search(r'[：:]\s*(.+?)(?:\n|电话|联系|$)', snippet)
            if addr_match:
                result['详细地址'] = addr_match.group(1).strip()
                break
    
    # 如果没有找到详细地址，标注
    if not result['详细地址']:
        result['详细地址'] = '详见院校官网'
    
    return result

def main():
    # 读取院校链接
    links_file = os.path.join(OUT_DIR, 'school_links.json')
    if not os.path.exists(links_file):
        print(f'错误: 找不到 {links_file}，请先运行列表页采集')
        sys.exit(1)
    
    with open(links_file, 'r', encoding='utf-8') as f:
        school_links = json.load(f)
    
    print(f'共 {len(school_links)} 所院校需要采集详情')
    
    # 检查是否已有部分结果
    result_file = os.path.join(OUT_DIR, 'school_details.json')
    existing = {}
    if os.path.exists(result_file):
        with open(result_file, 'r', encoding='utf-8') as f:
            existing = json.load(f)
        print(f'已有 {len(existing)} 所院校的详情数据，将跳过已采集的')
    
    results = existing
    total = len(school_links)
    done = 0
    failed = []
    
    for name, url in school_links.items():
        done += 1
        if name in results:
            print(f'  [{done}/{total}] 跳过: {name} (已采集)')
            continue
        
        print(f'  [{done}/{total}] 采集: {name}')
        html = fetch(url)
        if not html:
            print(f'    FAILED: {name}')
            failed.append(name)
            continue
        
        try:
            detail = parse_school_detail(html, name, url)
            results[name] = detail
            print(f'    性质={detail["办学性质"]}, 城市={detail["所在城市"]}, 层次={detail["院校层次"]}')
        except Exception as e:
            print(f'    解析失败: {e}')
            failed.append(name)
        
        # 每采集10所保存一次
        if done % 10 == 0:
            with open(result_file, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            print(f'    (已保存 {len(results)} 所)')
        
        time.sleep(0.3)
    
    # 最终保存
    with open(result_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f'\n=== 院校详情采集完成 ===')
    print(f'成功: {len(results)} 所')
    print(f'失败: {len(failed)} 所')
    if failed:
        print(f'失败列表: {failed}')

if __name__ == '__main__':
    main()
