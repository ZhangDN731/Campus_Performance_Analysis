import requests
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': 'http://www.hbdzxx.com/',
}
url = 'http://www.hbdzxx.com/school/caofeidian.html'
r = requests.get(url, headers=headers, timeout=15)
print('Status:', r.status_code)
print('Len:', len(r.text))
if r.status_code == 200:
    print('Access restored!')
else:
    print('Still blocked')
    print(r.text[:300])
