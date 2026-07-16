import urllib.request, json, re

with open('.env') as f:
    c = f.read()
m = re.search(r'SONAR_TOKEN=(\S+)', c)
t = m.group(1).strip().strip("'\"'").strip() if m else ''

base = 'http://127.0.0.1:9002'
headers = {'Authorization': f'Bearer {t}'}

# Get all component tree with qualifiers
params = urllib.parse.urlencode({
    'baseComponentKey': 'sgi',
    'metricKeys': 'coverage,ncloc,uncovered_lines',
    'qualifiers': 'DIR',
    'ps': 500
})
req = urllib.request.Request(f'{base}/api/measures/component_tree?{params}', headers=headers)
try:
    d = json.loads(urllib.request.urlopen(req).read())
    print("Directories:")
    for comp in d.get('components', []):
        m = {mm['metric']: mm.get('value','?') for mm in comp.get('measures',[])}
        path = comp.get('path','?')
        cov = m.get('coverage','?')
        ncloc = m.get('ncloc','?')
        unco = m.get('uncovered_lines','?')
        print(f"  {path:55s} cov={str(cov):>6s}%  ncloc={str(ncloc):>6s}  uncovered={str(unco):>6s}")
except Exception as e:
    print(f"Error: {e}")

# Check PHP frontend app coverage by directory
print()
# Try to get PHP-specific measures from the API
req2 = urllib.request.Request(f'{base}/api/measures/component?component=sgi&metricKeys=coverage,ncloc,lines_to_cover,uncovered_lines', headers=headers)
try:
    d2 = json.loads(urllib.request.urlopen(req2).read())
    print("Measures:")
    for m in d2.get('component',{}).get('measures',[]):
        print(f"  {m['metric']:20s} = {m.get('value','?')}")
except Exception as e:
    print(f"Error: {e}")
