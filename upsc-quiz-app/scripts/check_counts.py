import urllib.request
import csv
import io
import json

print("Checking portal_data.json vs all_exams_prelims.csv...")

# 1. Check portal_data.json
url_json = "https://raw.githubusercontent.com/mahavishnu47/upsc-prelims-microthemes/main/docs/data/portal_data.json"
try:
    req = urllib.request.Request(url_json, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    
    total_cse = sum(len(mt.get('cse_questions', [])) for s in data.get('subjects', []) for mt in s.get('microthemes', []))
    total_cross = sum(len(mt.get('cross_exam_questions', [])) for s in data.get('subjects', []) for mt in s.get('microthemes', []))
    print(f"portal_data.json: {total_cse} CSE, {total_cross} Cross-exam, Total = {total_cse + total_cross}")
except Exception as e:
    print("Error with portal_data.json:", e)

# 2. Check all_exams_prelims.csv
url_csv = "https://raw.githubusercontent.com/mahavishnu47/upsc-prelims-microthemes/main/output/all_exams_prelims.csv"
try:
    req = urllib.request.Request(url_csv, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        content = resp.read().decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    print(f"all_exams_prelims.csv total rows: {len(rows)}")
    if rows:
        print("Sample columns:", list(rows[0].keys()))
except Exception as e:
    print("Error with all_exams_prelims.csv:", e)
