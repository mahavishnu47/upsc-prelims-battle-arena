import { LocalDB } from './storage.js';
import { UserService } from './firebase-service.js';

export const Leaderboard = {
  async getRankings(timeframe = 'all') {
    let users = [];
    try {
      const cloudUsers = await UserService.getAllUsers();
      if (Array.isArray(cloudUsers) && cloudUsers.length > 0) {
        users = cloudUsers;
        LocalDB.saveRegisteredUsers(cloudUsers);
      } else {
        users = LocalDB.getRegisteredUsers();
      }
    } catch (e) {
      users = LocalDB.getRegisteredUsers();
    }

    // Map and enrich player statistics
    const ranked = users.map(user => {
      const stats = user.stats || {};
      const totalBattles = stats.totalBattles || 0;
      const battlesWon = stats.battlesWon || 0;
      const totalPoints = Math.round((Number(stats.totalPoints) || 0) * 100) / 100;
      const qAttempted = stats.questionsAttempted || 0;
      const qCorrect = stats.questionsCorrect || 0;

      const winRate = totalBattles > 0 ? Math.round((battlesWon / totalBattles) * 100) : 0;
      const accuracy = qAttempted > 0 ? Math.round((qCorrect / qAttempted) * 100) : 0;
      const streak = stats.dailyStreak || 1;

      return {
        id: user.id,
        name: user.name,
        avatar: user.avatar || '🎯',
        totalPoints,
        totalBattles,
        battlesWon,
        winRate,
        qAttempted,
        qCorrect,
        accuracy,
        streak
      };
    });

    // Sort primarily by points, then win rate, then accuracy
    ranked.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.accuracy - a.accuracy;
    });

    return ranked;
  }
};
