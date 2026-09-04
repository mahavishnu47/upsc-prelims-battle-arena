/**
 * UPSC Prelims Battle Arena — Daily Challenge Module
 * 10 questions rotating at midnight IST, results hidden until all 3 friends complete
 */

import { loadQuestions, LocalDB } from './storage.js';
import { getISTDateString, seededRandom } from './utils.js';
import { peerBus } from './firebase-service.js';

let cachedDailyQuestionsMap = {};

export const DailyChallenge = {
  /**
   * Get 10 deterministic questions for today's IST date instantly
   */
  async getDailyQuestions() {
    const dateStr = getISTDateString();
    if (cachedDailyQuestionsMap[dateStr] && cachedDailyQuestionsMap[dateStr].length === 10) {
      return cachedDailyQuestionsMap[dateStr];
    }

    // Check localStorage cache for today's 10 questions for instant 0ms return
    const localKey = `upsc_daily_q_${dateStr}`;
    const stored = localStorage.getItem(localKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length === 10) {
          cachedDailyQuestionsMap[dateStr] = parsed;
          return parsed;
        }
      } catch (e) {}
    }

    const allQuestions = await loadQuestions();
    if (!allQuestions || allQuestions.length === 0) return [];

    const rng = seededRandom("upsc_daily_" + dateStr);
    const chosen = [];
    const usedIndices = new Set();
    const total = allQuestions.length;

    // Pick 10 unique deterministic questions without cloning or shuffling the entire 8MB array
    let attempts = 0;
    while (chosen.length < 10 && usedIndices.size < total && attempts < 200) {
      attempts++;
      const idx = Math.floor(rng() * total);
      if (!usedIndices.has(idx)) {
        usedIndices.add(idx);
        const q = allQuestions[idx];
        if (q && q.question) {
          chosen.push(q);
        }
      }
    }

    try {
      localStorage.setItem(localKey, JSON.stringify(chosen));
    } catch (e) {}

    cachedDailyQuestionsMap[dateStr] = chosen;
    return chosen;
  },

  /**
   * Get daily challenge state for today (sync cached)
   */
  getDailyState(dateStr = getISTDateString()) {
    const path = `daily/${dateStr}`;
    const state = peerBus.get(path);
    return state || {
      date: dateStr,
      submissions: {}, // { userId: { score, answers, completedAt, name, avatar, correctCount, wrongCount, accuracy } }
      totalRequiredPlayers: 10,
      isRevealed: true
    };
  },

  /**
   * Get daily challenge state for today asynchronously from Firebase
   */
  async getDailyStateAsync(dateStr = getISTDateString()) {
    const path = `daily/${dateStr}`;
    try {
      const state = await peerBus.getAsync(path);
      if (state) return state;
    } catch (e) {
      console.warn("getDailyStateAsync note:", e);
    }
    return this.getDailyState(dateStr);
  },

  /**
   * Check if specific user has already completed today's daily challenge
   */
  hasUserCompletedToday(userId, dateStr = getISTDateString()) {
    if (!userId) return { completed: false, submission: null };
    const state = this.getDailyState(dateStr);
    const sub = state.submissions?.[userId];
    if (sub) {
      return { completed: true, submission: sub };
    }
    // Check marks history fallback
    const history = LocalDB.getUserMarksHistory(userId);
    const todayRecord = history.find(h => {
      if (h.mode === 'Daily 10' && h.timestamp) {
        const d = new Date(h.timestamp).toISOString().split('T')[0];
        return d === dateStr;
      }
      return false;
    });
    if (todayRecord) {
      return { completed: true, submission: todayRecord };
    }
    return { completed: false, submission: null };
  },

  /**
   * Subscribe to live daily room updates
   */
  subscribeDaily(dateStr = getISTDateString(), callback) {
    const path = `daily/${dateStr}`;
    return peerBus.on(path, callback);
  },

  /**
   * Save user submission for today's daily challenge
   */
  submitDaily(user, answers, totalScore, details = {}) {
    const dateStr = getISTDateString();
    const state = this.getDailyState(dateStr);

    state.submissions = state.submissions || {};
    state.submissions[user.id] = {
      userId: user.id,
      name: user.name,
      avatar: user.avatar,
      score: totalScore,
      answers,
      completedAt: Date.now(),
      correctCount: details.correctCount || 0,
      wrongCount: details.wrongCount || 0,
      accuracy: details.accuracy || 0,
      positiveMarks: details.positiveMarks || 0,
      negativePenalty: details.negativePenalty || 0
    };

    state.isRevealed = true;

    const path = `daily/${dateStr}`;
    peerBus.set(path, state);
    return state;
  }
};

