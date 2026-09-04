/**
 * UPSC Prelims Battle Arena — Daily Challenge Module
 * 10 questions rotating at midnight IST, results hidden until all 3 friends complete
 */

import { loadQuestions, LocalDB } from './storage.js';
import { getISTDateString, seededRandom, showToast } from './utils.js';
import { peerBus } from './firebase-service.js';

export const DailyChallenge = {
  /**
   * Get 10 deterministic questions for today's IST date
   */
  async getDailyQuestions() {
    const allQuestions = await loadQuestions();
    const dateStr = getISTDateString();
    const rng = seededRandom("upsc_daily_" + dateStr);

    // Filter questions by major subjects to ensure balanced daily challenge
    const pool = allQuestions.slice();
    // Deterministic shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool.slice(0, 10);
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
      totalRequiredPlayers: 3,
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

    // Check if all 3 friends have submitted
    const registeredUsers = LocalDB.getRegisteredUsers();
    const expectedCount = Math.min(3, Math.max(1, registeredUsers.length));
    const submittedCount = Object.keys(state.submissions).length;

    if (submittedCount >= expectedCount) {
      state.isRevealed = true;
    }

    const path = `daily/${dateStr}`;
    peerBus.set(path, state);
    return state;
  }
};
