import csv

with open('data/all_exams_prelims.csv', 'r', encoding='utf-8', errors='ignore') as f:
    reader = csv.DictReader(f)
    subjects = {}
    for r in reader:
        s = r.get('Subject', '').strip()
        subjects[s] = subjects.get(s, 0) + 1

print("All distinct Subject column values in all_exams_prelims.csv:")
for k, v in sorted(subjects.items(), key=lambda x: -x[1]):
    print(f"  '{k}': {v}")
