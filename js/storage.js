/**
 * UPSC Prelims Battle Arena — Storage & Data Loader
 * IndexedDB question caching, syllabus cache, local mock DB for instant offline play
 */

const DB_NAME = 'upsc_battle_arena_db';
const DB_VERSION = 1;
const STORE_QUESTIONS = 'questions';
const STORE_META = 'metadata';

let dbInstance = null;

export async function initIndexedDB() {
  if (dbInstance) return dbInstance;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_QUESTIONS)) {
        db.createObjectStore(STORE_QUESTIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    request.onerror = (e) => {
      console.warn("IndexedDB error:", e);
      resolve(null);
    };
  });
}

let cachedQuestions = null;
let cachedSyllabus = null;

export async function loadQuestions() {
  if (cachedQuestions && cachedQuestions.length > 0) return cachedQuestions;

  // 1. Try reading from IndexedDB first for instant local speed (avoid re-downloading 8.2MB)
  try {
    const db = await initIndexedDB();
    if (db) {
      const tx = db.transaction(STORE_QUESTIONS, 'readonly');
      const store = tx.objectStore(STORE_QUESTIONS);
      const req = store.getAll();
      const all = await new Promise(r => { req.onsuccess = () => r(req.result); req.onerror = () => r([]); });
      if (all && all.length > 0) {
        cachedQuestions = all;
        return cachedQuestions;
      }
    }
  } catch (err) {
    console.warn("IndexedDB read note:", err);
  }

  // 2. Fallback to network fetch if not yet in IndexedDB
  try {
    const response = await fetch('./data/questions.json');
    if (response.ok) {
      cachedQuestions = await response.json();
      // Cache questions asynchronously in IndexedDB for instant future loads
      initIndexedDB().then(db => {
        if (db && cachedQuestions && cachedQuestions.length > 0) {
          try {
            const tx = db.transaction(STORE_QUESTIONS, 'readwrite');
            const store = tx.objectStore(STORE_QUESTIONS);
            cachedQuestions.forEach(q => store.put(q));
          } catch (e) {}
        }
      }).catch(() => {});
      return cachedQuestions;
    }
  } catch (err) {
    console.warn("Could not fetch ./data/questions.json directly:", err);
  }

  return [];
}

export async function loadSyllabus() {
  if (cachedSyllabus) return cachedSyllabus;

  try {
    const response = await fetch('./data/syllabus.json');
    if (response.ok) {
      cachedSyllabus = await response.json();
      return cachedSyllabus;
    }
  } catch (err) {
    console.warn("Could not fetch ./data/syllabus.json:", err);
  }

  return { subjects: [] };
}

// Local Player State Management (Local storage sync for PIN auth, streaks, and bookmarks)
export const LocalDB = {
  getUser() {
    const u = localStorage.getItem('upsc_arena_current_user');
    return u ? JSON.parse(u) : null;
  },

  setUser(user) {
    if (!user) {
      localStorage.removeItem('upsc_arena_current_user');
    } else {
      localStorage.setItem('upsc_arena_current_user', JSON.stringify(user));
    }
  },

  getRegisteredUsers() {
    const list = localStorage.getItem('upsc_arena_registered_users');
    return list ? JSON.parse(list) : [];
  },

  saveRegisteredUsers(list) {
    localStorage.setItem('upsc_arena_registered_users', JSON.stringify(list));
  },

  getUserSyllabusProgress(userId) {
    const key = `upsc_arena_syllabus_${userId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : { attempted: {}, correct: {} };
  },

  saveUserSyllabusProgress(userId, progress) {
    const key = `upsc_arena_syllabus_${userId}`;
    localStorage.setItem(key, JSON.stringify(progress));
  },

  getUserBookmarks(userId) {
    const key = `upsc_arena_bookmarks_${userId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  },

  saveUserBookmarks(userId, bookmarks) {
    const key = `upsc_arena_bookmarks_${userId}`;
    localStorage.setItem(key, JSON.stringify(bookmarks));
  },

  getUserMarksHistory(userId) {
    const key = `upsc_arena_marks_history_${userId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  },

  addMarksHistoryRecord(userId, record) {
    const history = this.getUserMarksHistory(userId);
    history.unshift({
      id: 'score_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      timestamp: Date.now(),
      ...record
    });
    if (history.length > 200) history.pop();
    localStorage.setItem(`upsc_arena_marks_history_${userId}`, JSON.stringify(history));
    return history;
  },

  getUserMistakes(userId) {
    const key = `upsc_arena_mistakes_${userId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  },

  addMistake(userId, mistake) {
    const mistakes = this.getUserMistakes(userId);
    // Avoid duplicates for same question id
    const existingIdx = mistakes.findIndex(m => m.questionId === mistake.questionId);
    if (existingIdx !== -1) {
      mistakes[existingIdx] = { ...mistake, timestamp: Date.now() };
    } else {
      mistakes.unshift({
        id: 'mistake_' + Date.now(),
        timestamp: Date.now(),
        ...mistake
      });
    }
    if (mistakes.length > 300) mistakes.pop();
    localStorage.setItem(`upsc_arena_mistakes_${userId}`, JSON.stringify(mistakes));
    return mistakes;
  },

  removeMistake(userId, questionId) {
    let mistakes = this.getUserMistakes(userId);
    mistakes = mistakes.filter(m => m.questionId !== questionId && m.id !== questionId);
    localStorage.setItem(`upsc_arena_mistakes_${userId}`, JSON.stringify(mistakes));
    return mistakes;
  },

  getRecentBattles(userId) {
    const key = `upsc_arena_battles_${userId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  },

  addRecentBattle(userId, battleRecord) {
    const battles = this.getRecentBattles(userId);
    battles.unshift(battleRecord);
    if (battles.length > 50) battles.pop();
    const key = `upsc_arena_battles_${userId}`;
    localStorage.setItem(key, JSON.stringify(battles));
  },

  getLockoutInfo(userId) {
    const key = `upsc_lockout_${userId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : { attempts: 0, lockedUntil: 0 };
  },

  setLockoutInfo(userId, info) {
    const key = `upsc_lockout_${userId}`;
    localStorage.setItem(key, JSON.stringify(info));
  }
};
