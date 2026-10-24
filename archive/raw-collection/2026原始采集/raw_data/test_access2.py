import requests
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': 'http://www.hbdzxx.com/',
}

# Test list page
url1 = 'http://www.hbdzxx.com/school/plan/2025/1/'
r1 = requests.get(url1, headers=headers, timeout=15)
print('List page status:', r1.status_code, 'len:', len(r1.text))

# Test school detail page
url2 = 'http://www.hbdzxx.com/school/caofeidian.html'
r2 = requests.get(url2, headers=headers, timeout=15)
print('Detail page status:', r2.status_code, 'len:', len(r2.text))

# Test homepage
url3 = 'http://www.hbdzxx.com/'
r3 = requests.get(url3, headers=headers, timeout=15)
print('Homepage status:', r3.status_code, 'len:', len(r3.text))
