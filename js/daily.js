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

    cachedDailyQuestionsMap[dateStr] = chosen;
    return chosen;
  },

  /**
   * Get daily challenge state for today
   */
  getDailyState(dateStr = getISTDateString()) {
    const path = `daily/${dateStr}`;
    const state = peerBus.get(path);
    return state || {
      date: dateStr,
      submissions: {}, // { userId: { score, answers, completedAt, name, avatar } }
      totalRequiredPlayers: 10,
      isRevealed: false
    };
  },

  /**
   * Save user submission for today's daily challenge
   */
  submitDaily(user, answers, totalScore) {
    const dateStr = getISTDateString();
    const state = this.getDailyState(dateStr);

    state.submissions[user.id] = {
      userId: user.id,
      name: user.name,
      avatar: user.avatar,
      score: totalScore,
      answers,
      completedAt: Date.now()
    };

    // Auto-reveal if all registered players have submitted
    const registeredUsers = LocalDB.getRegisteredUsers();
    const expectedCount = Math.max(1, registeredUsers.length);
    const submittedCount = Object.keys(state.submissions).length;

    if (submittedCount >= expectedCount) {
      state.isRevealed = true;
    }

    const path = `daily/${dateStr}`;
    peerBus.set(path, state);
    return state;
  }
};

