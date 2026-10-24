# -*- coding: utf-8 -*-
"""
通过GitHub API批量上传文件（修复中文路径编码）
"""
import os
import base64
import json
import urllib.request
import urllib.parse
import urllib.error
import time

# 从环境变量读取 GitHub Token，请勿在代码中硬编码密钥
# Windows PowerShell 设置：$env:GITHUB_TOKEN="你的token"
TOKEN = os.environ.get("GITHUB_TOKEN", "")
OWNER = "ZhangDN731"
REPO = "Admission_Info"
BRANCH = "main"
LOCAL_DIR = r"C:\Users\XIAO\Desktop\大类信息\Admission_Info"
API_BASE = f"https://api.github.com/repos/{OWNER}/{REPO}"

HEADERS = {
    "Authorization": f"token {TOKEN}",
    "User-Agent": "Doubao-Uploader",
    "Accept": "application/vnd.github.v3+json",
}

EXCLUDE_DIRS = {'_shots', '.git'}
EXCLUDE_FILES = {'.gitignore'}


def get_sha(path):
    encoded_path = urllib.parse.quote(path)
    url = f"{API_BASE}/contents/{encoded_path}?ref={BRANCH}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            return data.get('sha')
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def upload_file(path, content_bytes, retries=3):
    encoded_path = urllib.parse.quote(path)
    url = f"{API_BASE}/contents/{encoded_path}"
    encoded = base64.b64encode(content_bytes).decode('utf-8')
    for attempt in range(retries):
        try:
            sha = get_sha(path)
            body = {
                "message": f"上传 {os.path.basename(path)}",
                "content": encoded,
                "branch": BRANCH,
            }
            if sha:
                body["sha"] = sha
                body["message"] = f"更新 {os.path.basename(path)}"
            data = json.dumps(body).encode('utf-8')
            req = urllib.request.Request(url, data=data, headers={**HEADERS, "Content-Type": "application/json"}, method='PUT')
            with urllib.request.urlopen(req, timeout=120) as resp:
                return resp.status in (200, 201)
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
                continue
            print(f"\n  错误: {e}")
            return False
    return False


def collect_files():
    files = []
    for root, dirs, filenames in os.walk(LOCAL_DIR):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for fname in filenames:
            if fname in EXCLUDE_FILES:
                continue
            full_path = os.path.join(root, fname)
            rel_path = os.path.relpath(full_path, LOCAL_DIR).replace('\\', '/')
            files.append((rel_path, full_path))
    return files


def main():
    files = collect_files()
    print(f"共收集 {len(files)} 个文件")
    success = 0
    failed = []
    for i, (rel_path, full_path) in enumerate(files, 1):
        size_kb = os.path.getsize(full_path) / 1024
        print(f"[{i}/{len(files)}] {rel_path} ({size_kb:.1f}KB) ...", end=' ', flush=True)
        try:
            with open(full_path, 'rb') as f:
                content = f.read()
            if upload_file(rel_path, content):
                print("OK")
                success += 1
            else:
                print("FAIL")
                failed.append(rel_path)
        except Exception as e:
            print(f"ERROR: {e}")
            failed.append(rel_path)
    print(f"\n===== 上传完成 =====")
    print(f"成功: {success}/{len(files)}")
    if failed:
        print(f"失败: {len(failed)} 个")
        for f in failed:
            print(f"  - {f}")


if __name__ == '__main__':
    main()
