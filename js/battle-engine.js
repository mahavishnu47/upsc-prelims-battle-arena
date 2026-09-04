/**
 * UPSC Prelims Battle Arena — Battle Engine
 * Question selection, Lobby overlap filtering, Scoring system, Negative Marking (-33 pts)
 */

import { loadQuestions, LocalDB } from './storage.js';
import { BattleService } from './firebase-service.js';
import { sounds, BitfieldTracker } from './utils.js';

export const BattleEngine = {
  /**
   * Filter and pick questions for a battle
   * @param {Object} config - { subject, microthemes, count, timePerQuestion, prioritizeUnattempted, lobbyPlayerIds }
   */
  async selectQuestions(config) {
    const allQuestions = await loadQuestions();
    let pool = allQuestions.slice();

    // 1. Filter by subject
    if (config.subject && config.subject !== 'all') {
      pool = pool.filter(q => q.subject.toLowerCase() === config.subject.toLowerCase());
    }

    // 2. Filter by microthemes
    if (config.microthemes && config.microthemes.length > 0) {
      const mtSet = new Set(config.microthemes);
      pool = pool.filter(q => mtSet.has(q.microtheme_id) || mtSet.has(q.microtheme));
    }

    // 3. Prioritize unattempted questions by ALL players in the lobby
    if (config.prioritizeUnattempted && config.lobbyPlayerIds && config.lobbyPlayerIds.length > 0) {
      const playersProgress = config.lobbyPlayerIds.map(pid => LocalDB.getUserSyllabusProgress(pid));
      
      const unattemptedByAll = pool.filter(q => {
        return playersProgress.every(prog => !prog.attempted || !prog.attempted[q.id]);
      });

      if (unattemptedByAll.length >= config.count) {
        pool = unattemptedByAll;
      } else {
        // Shuffle unattempted first, then fill rest
        const rest = pool.filter(q => !unattemptedByAll.includes(q));
        pool = [...this.shuffle(unattemptedByAll), ...this.shuffle(rest)];
      }
    }

    // Shuffle pool
    const shuffled = this.shuffle(pool);
    return shuffled.slice(0, Math.min(config.count || 10, shuffled.length));
  },

  shuffle(array) {
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  /**
   * Calculate score for an answered question
   * @param {boolean} isCorrect - whether option matched
   * @param {number} timeLeftSec - seconds remaining on timer
   * @param {number} totalTimeSec - total seconds allocated
   * @param {number} currentStreak - consecutive correct answers in this battle
   */
  calculateScore(isCorrect, timeLeftSec, totalTimeSec, currentStreak = 0) {
    if (!isCorrect) {
      return {
        points: -33, // Always-on negative marking
        base: 0,
        speedBonus: 0,
        streakBonus: 0,
        penalty: -33
      };
    }

    const base = 100;
    // Speed bonus: up to +50 points
    const timeFraction = Math.max(0, Math.min(1, timeLeftSec / totalTimeSec));
    const speedBonus = Math.round(50 * timeFraction);

    // Streak multiplier: +10% per consecutive correct answer, up to +50%
    const streakMultiplier = Math.min(0.5, currentStreak * 0.10);
    const streakBonus = Math.round(base * streakMultiplier);

    const total = base + speedBonus + streakBonus;
    return {
      points: total,
      base,
      speedBonus,
      streakBonus,
      penalty: 0
    };
  }
};
