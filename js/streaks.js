/**
 * UPSC Prelims Battle Arena — Streaks & Badges Engine
 * Daily streak with Midnight IST reset, win streaks, answer streaks, and streak freezes
 */

import { LocalDB } from './storage.js';
import { getISTDateString, showToast } from './utils.js';

export const BADGES = [
  { id: 'first_blood', name: 'First Blood', icon: '⚔️', desc: 'Complete your first live battle' },
  { id: 'daily_3', name: 'Ignited', icon: '🔥', desc: '3-day daily challenge streak' },
  { id: 'daily_7', name: 'On Fire', icon: '⚡', desc: '7-day daily challenge streak' },
  { id: 'daily_30', name: 'Prelims Titan', icon: '👑', desc: '30-day daily challenge streak' },
  { id: 'sharpshooter', name: 'Sharpshooter', icon: '🎯', desc: '100% accuracy in a 10+ question battle' },
  { id: 'streak_5', name: 'Unstoppable', icon: '🚀', desc: 'Answer 5 questions correct in a row' },
  { id: 'polity_master', name: 'Constitution Guru', icon: '🏛️', desc: 'Attempt 50+ Polity questions' },
  { id: 'econ_bull', name: 'Economic Bull', icon: '📈', desc: 'Attempt 50+ Economics questions' },
  { id: 'env_guardian', name: 'Green Sentinel', icon: '🌿', desc: 'Attempt 50+ Environment questions' }
];

export const StreakSystem = {
  /**
   * Check and update daily streak on user action
   */
  updateDailyStreak(user) {
    if (!user) return;
    const today = getISTDateString();
    const stats = user.stats || {};
    const lastActive = stats.lastActiveDate;

    if (!lastActive) {
      stats.dailyStreak = 1;
      stats.lastActiveDate = today;
    } else if (lastActive === today) {
      // Already active today
    } else {
      const yesterday = new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      if (lastActive === yesterday) {
        stats.dailyStreak = (stats.dailyStreak || 0) + 1;
        stats.lastActiveDate = today;
        showToast(`Streak Increased! 🔥 ${stats.dailyStreak} Days in a row!`, 'success');
      } else {
        // Streak broken unless freeze is available
        if (stats.streakFreezes && stats.streakFreezes > 0) {
          stats.streakFreezes--;
          stats.lastActiveDate = today;
          showToast(`Streak Freeze Used! 🛡️ Kept your ${stats.dailyStreak}-day streak alive!`, 'warning');
        } else {
          stats.dailyStreak = 1;
          stats.lastActiveDate = today;
        }
      }
    }

    if (stats.dailyStreak > (stats.maxStreak || 1)) {
      stats.maxStreak = stats.dailyStreak;
    }

    user.stats = stats;
    this.saveUserUpdate(user);
    return stats.dailyStreak;
  },

  saveUserUpdate(user) {
    LocalDB.setUser(user);
    const users = LocalDB.getRegisteredUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      users[idx] = user;
      LocalDB.saveRegisteredUsers(users);
    }
  },

  /**
   * Check which badges user has unlocked
   */
  getUserBadges(user) {
    if (!user || !user.stats) return [];
    const stats = user.stats;
    const unlocked = [];

    if (stats.totalBattles > 0) unlocked.push('first_blood');
    if (stats.dailyStreak >= 3) unlocked.push('daily_3');
    if (stats.dailyStreak >= 7) unlocked.push('daily_7');
    if (stats.dailyStreak >= 30) unlocked.push('daily_30');
    if (stats.maxAnswerStreak >= 5) unlocked.push('streak_5');

    return BADGES.map(b => ({
      ...b,
      unlocked: unlocked.includes(b.id)
    }));
  }
};
