import urllib.request
import json
import os

url = "https://api.github.com/repos/mahavishnu47/upsc-prelims-microthemes/git/trees/main?recursive=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
    print("Files in GitHub repository:")
    for item in data.get("tree", []):
        p = item["path"]
        sz = item.get("size", 0)
        if sz > 1000 or p.endswith(".json") or p.endswith(".js") or p.endswith(".py") or p.endswith(".csv"):
            print(f"  {p} ({sz:,} bytes)")
except Exception as e:
    print("Error fetching repo tree:", e)
