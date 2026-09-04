"""
UPSC Prelims Battle Arena - Data Preprocessing Script
Downloads portal_data.js from GitHub, cleans and flattens question data,
and generates questions.json + syllabus.json for the app.
"""
import json
import re
import urllib.request
import sys
import os

RAW_URL = "https://raw.githubusercontent.com/mahavishnu47/upsc-prelims-microthemes/main/docs/portal_data.js"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

def download_portal_data():
    """Download portal_data.js from GitHub or use cached file."""
    cache_path = os.path.join(OUTPUT_DIR, "portal_data.raw.js")
    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 1000000:
        print(f"Using locally cached {cache_path} ({os.path.getsize(cache_path):,} bytes)")
        with open(cache_path, "r", encoding="utf-8") as f:
            return f.read()

    print("Downloading portal_data.js from GitHub...")
    req = urllib.request.Request(RAW_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as response:
        raw = response.read().decode("utf-8")
    print(f"Downloaded {len(raw):,} bytes")
    with open(cache_path, "w", encoding="utf-8") as f:
        f.write(raw)
    return raw

def parse_portal_data(raw_js):
    """Extract JSON from the JS variable assignment."""
    match = re.search(r'const\s+PORTAL_DATA\s*=\s*(\{.*\})\s*;?\s*$', raw_js, re.DOTALL)
    if not match:
        match = re.search(r'const\s+PORTAL_DATA\s*=\s*(\{.*\})', raw_js, re.DOTALL)
    if not match:
        raise ValueError("Could not extract PORTAL_DATA JSON from portal_data.js")
    
    json_str = match.group(1)
    print(f"Extracted JSON: {len(json_str):,} chars")
    data = json.loads(json_str)
    print(f"Parsed successfully: {data['metadata']['total_microthemes']} microthemes, {data['metadata']['total_cse_questions_cataloged']} CSE questions")
    return data

skip_reasons = {}

def clean_question(q, subject_name, microtheme_name, microtheme_id, yield_badge):
    """Clean a single question and add metadata."""
    if not q.get("question", "").strip():
        skip_reasons["empty_question"] = skip_reasons.get("empty_question", 0) + 1
        return None
    if not q.get("correct_answer", "").strip():
        skip_reasons["empty_answer"] = skip_reasons.get("empty_answer", 0) + 1
        return None
    opts = [q.get("option_a", ""), q.get("option_b", ""), q.get("option_c", ""), q.get("option_d", "")]
    if all(not o.strip() for o in opts):
        skip_reasons["all_empty_options"] = skip_reasons.get("all_empty_options", 0) + 1
        return None
    non_empty_opts = sum(1 for o in opts if o.strip())
    if non_empty_opts < 2:
        skip_reasons["fewer_than_2_options"] = skip_reasons.get("fewer_than_2_options", 0) + 1
        return None
    
    correct = q.get("correct_answer", "").strip().upper()
    if correct not in ("A", "B", "C", "D"):
        # Check if correct answer is in format 'Option A' or 'a' or something
        if correct.startswith("OPTION"):
            correct = correct.replace("OPTION", "").strip()
        if len(correct) > 0 and correct[0] in ("A", "B", "C", "D"):
            correct = correct[0]
        else:
            skip_reasons[f"invalid_correct_answer: {q.get('correct_answer')}"] = skip_reasons.get(f"invalid_correct_answer: {q.get('correct_answer')}", 0) + 1
            return None
    
    # Clean theme name (strip \b and other control chars)
    clean_theme = re.sub(r'[\x00-\x1f]', '', microtheme_name).strip()
    
    return {
        "id": q.get("id", ""),
        "subject": subject_name,
        "microtheme": clean_theme,
        "microtheme_id": microtheme_id,
        "yield_badge": yield_badge,
        "year": q.get("year", ""),
        "exam": q.get("exam", ""),
        "question": q.get("question", "").strip(),
        "option_a": q.get("option_a", "").strip(),
        "option_b": q.get("option_b", "").strip(),
        "option_c": q.get("option_c", "").strip(),
        "option_d": q.get("option_d", "").strip(),
        "correct_answer": correct,
        "explanation": q.get("explanation", "").strip(),
        "tags": q.get("tags", "").strip(),
        "source": q.get("source", "")
    }

def process_data(data):
    """Flatten and clean all questions, generate syllabus manifest."""
    questions = []
    syllabus = {"subjects": []}
    
    skipped = 0
    duplicate_ids = set()
    seen_ids = set()
    
    for subject in data.get("subjects", []):
        subject_name = subject.get("subject_name", "")
        subject_info = {
            "name": subject_name,
            "icon": subject.get("icon", "📚"),
            "color": subject.get("color", "#888"),
            "total_questions": 0,
            "microthemes": []
        }
        
        for mt in subject.get("microthemes", []):
            mt_id = mt.get("id", "")
            mt_name = re.sub(r'[\x00-\x1f]', '', mt.get("theme_name", "")).strip()
            yield_badge = mt.get("yield_badge", "")
            
            mt_question_count = 0
            
            # Process CSE questions
            for q in mt.get("cse_questions", []):
                cleaned = clean_question(q, subject_name, mt_name, mt_id, yield_badge)
                if cleaned:
                    if cleaned["id"] not in seen_ids:
                        questions.append(cleaned)
                        seen_ids.add(cleaned["id"])
                        mt_question_count += 1
                    else:
                        duplicate_ids.add(cleaned["id"])
                else:
                    skipped += 1
            
            # Process cross-exam questions
            for q in mt.get("cross_exam_questions", []):
                cleaned = clean_question(q, subject_name, mt_name, mt_id, yield_badge)
                if cleaned:
                    if cleaned["id"] not in seen_ids:
                        questions.append(cleaned)
                        seen_ids.add(cleaned["id"])
                        mt_question_count += 1
                    else:
                        duplicate_ids.add(cleaned["id"])
                else:
                    skipped += 1
            
            subject_info["microthemes"].append({
                "id": mt_id,
                "name": mt_name,
                "total": mt_question_count,
                "yield": "high" if "High Yield" in yield_badge else ("medium" if "Medium" in yield_badge else "standard")
            })
            subject_info["total_questions"] += mt_question_count
        
        syllabus["subjects"].append(subject_info)
    
    # Assign sequential index to each question for bitfield mapping
    for i, q in enumerate(questions):
        q["index"] = i
    
    print(f"\n📊 Processing Results:")
    print(f"   Total valid questions: {len(questions)}")
    print(f"   Skipped (invalid): {skipped}")
    print(f"   Duplicates removed: {len(duplicate_ids)}")
    print(f"   Subjects: {len(syllabus['subjects'])}")
    print(f"   Microthemes: {sum(len(s['microthemes']) for s in syllabus['subjects'])}")
    
    # Print subject breakdown
    print(f"\n📋 Subject Breakdown:")
    for s in syllabus["subjects"]:
        print(f"   {s['icon']} {s['name']}: {s['total_questions']} questions, {len(s['microthemes'])} microthemes")
    
    # Add metadata to syllabus
    syllabus["metadata"] = {
        "total_questions": len(questions),
        "total_subjects": len(syllabus["subjects"]),
        "total_microthemes": sum(len(s["microthemes"]) for s in syllabus["subjects"]),
        "generated_at": "auto"
    }
    
    return questions, syllabus

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Download
    raw_js = download_portal_data()
    
    # Parse
    data = parse_portal_data(raw_js)
    
    # Process
    questions, syllabus = process_data(data)
    
    # Write questions.json
    questions_path = os.path.join(OUTPUT_DIR, "questions.json")
    with open(questions_path, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False)
    file_size = os.path.getsize(questions_path)
    print(f"\n💾 Written: questions.json ({file_size:,} bytes / {file_size/1024/1024:.1f}MB)")
    
    # Write syllabus.json
    syllabus_path = os.path.join(OUTPUT_DIR, "syllabus.json")
    with open(syllabus_path, "w", encoding="utf-8") as f:
        json.dump(syllabus, f, ensure_ascii=False, indent=2)
    file_size = os.path.getsize(syllabus_path)
    print(f"Written: syllabus.json ({file_size:,} bytes)")
    
    # Quick validation
    print(f"\n✅ Validation:")
    empty_q = sum(1 for q in questions if not q["question"])
    empty_ans = sum(1 for q in questions if not q["correct_answer"])
    print(f"   Questions with empty text: {empty_q}")
    print(f"   Questions with empty answer: {empty_ans}")
    
    exams = {}
    for q in questions:
        exam = q["exam"]
        exams[exam] = exams.get(exam, 0) + 1
    print(f"\n📊 Exam Distribution:")
    for exam, count in sorted(exams.items(), key=lambda x: -x[1]):
        print(f"   {exam}: {count}")

if __name__ == "__main__":
    main()
