"""
Validation script for UPSC Prelims Battle Arena data and structure.
"""
import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUESTIONS_PATH = os.path.join(BASE_DIR, "data", "questions.json")
SYLLABUS_PATH = os.path.join(BASE_DIR, "data", "syllabus.json")

def test_questions():
    with open(QUESTIONS_PATH, "r", encoding="utf-8") as f:
        questions = json.load(f)
    
    assert len(questions) >= 6000, f"Expected >=6000 questions, got {len(questions)}"
    
    # Check fields
    required_keys = ["id", "subject", "microtheme", "question", "option_a", "option_b", "option_c", "option_d", "correct_answer"]
    for q in questions:
        for k in required_keys:
            assert k in q, f"Missing key {k} in question {q.get('id')}"
            assert q[k] is not None, f"Key {k} is None in question {q.get('id')}"
        assert q["correct_answer"] in ["A", "B", "C", "D"], f"Invalid correct_answer {q['correct_answer']} in question {q.get('id')}"
        
    print(f"✅ Questions check PASSED: {len(questions)} verified clean MCQs.")

def test_syllabus():
    with open(SYLLABUS_PATH, "r", encoding="utf-8") as f:
        syllabus = json.load(f)
    
    assert "subjects" in syllabus
    assert len(syllabus["subjects"]) == 11, f"Expected 11 subjects, got {len(syllabus['subjects'])}"
    total_mts = sum(len(s["microthemes"]) for s in syllabus["subjects"])
    assert total_mts >= 183, f"Expected >=183 microthemes, got {total_mts}"
    
    print(f"✅ Syllabus check PASSED: 11 subjects, {total_mts} microthemes verified.")

def test_files():
    required_files = [
        "index.html",
        "css/style.css",
        "js/app.js",
        "js/auth.js",
        "js/battle-engine.js",
        "js/daily.js",
        "js/firebase-service.js",
        "js/leaderboard.js",
        "js/router.js",
        "js/storage.js",
        "js/streaks.js",
        "js/syllabus.js",
        "js/utils.js"
    ]
    for rf in required_files:
        p = os.path.join(BASE_DIR, rf)
        assert os.path.exists(p), f"Missing required file {rf}"
        assert os.path.getsize(p) > 0, f"File {rf} is empty"
    print(f"✅ All {len(required_files)} application source files verified.")

if __name__ == "__main__":
    test_questions()
    test_syllabus()
    test_files()
    print("\n🎉 ALL TESTS PASSED SUCCESSFULLY!")
