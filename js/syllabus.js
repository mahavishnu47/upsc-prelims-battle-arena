/**
 * UPSC Prelims Battle Arena — Syllabus Tracker & Microtheme Matrix
 * Calculates overall syllabus coverage percentage, subject completion, and friend comparative matrix
 */

import { loadSyllabus, LocalDB } from './storage.js';

export const SyllabusTracker = {
  /**
   * Get user progress across all subjects and microthemes
   */
  async getSubjectProgress(userId) {
    const syllabus = await loadSyllabus();
    const userProgress = LocalDB.getUserSyllabusProgress(userId);
    const attemptedMap = userProgress.attempted || {};
    const correctMap = userProgress.correct || {};

    let grandTotal = 0;
    let grandAttempted = 0;
    let grandCorrect = 0;

    const subjectsSummary = syllabus.subjects.map(sub => {
      let subTotal = sub.total_questions || 0;
      let subAttempted = 0;
      let subCorrect = 0;

      const microthemes = sub.microthemes.map(mt => {
        const mtTotal = mt.total || 0;
        let mtAttempted = 0;
        let mtCorrect = 0;

        // Count questions attempted in this microtheme
        for (const qId in attemptedMap) {
          const item = attemptedMap[qId];
          if (item && (item.microtheme_id === mt.id || item.microtheme === mt.name)) {
            mtAttempted++;
            if (correctMap[qId]) {
              mtCorrect++;
            }
          }
        }

        subAttempted += mtAttempted;
        subCorrect += mtCorrect;

        return {
          id: mt.id,
          name: mt.name,
          yield: mt.yield,
          total: mtTotal,
          attempted: Math.min(mtTotal, mtAttempted),
          correct: mtCorrect,
          pct: mtTotal > 0 ? Math.round((Math.min(mtTotal, mtAttempted) / mtTotal) * 100) : 0
        };
      });

      grandTotal += subTotal;
      grandAttempted += subAttempted;
      grandCorrect += subCorrect;

      return {
        name: sub.name,
        icon: sub.icon || '📚',
        color: sub.color || '#6366f1',
        total: subTotal,
        attempted: Math.min(subTotal, subAttempted),
        correct: subCorrect,
        pct: subTotal > 0 ? Math.round((Math.min(subTotal, subAttempted) / subTotal) * 100) : 0,
        accuracy: subAttempted > 0 ? Math.round((subCorrect / subAttempted) * 100) : 0,
        microthemes
      };
    });

    return {
      totalQuestions: grandTotal,
      attemptedQuestions: Math.min(grandTotal, grandAttempted),
      correctQuestions: grandCorrect,
      overallPct: grandTotal > 0 ? Math.round((Math.min(grandTotal, grandAttempted) / grandTotal) * 100) : 0,
      overallAccuracy: grandAttempted > 0 ? Math.round((grandCorrect / grandAttempted) * 100) : 0,
      subjects: subjectsSummary
    };
  },

  /**
   * Get comparative syllabus coverage among all 3 friends
   */
  async getFriendsComparison() {
    const users = LocalDB.getRegisteredUsers();
    const results = [];
    for (const u of users) {
      const prog = await this.getSubjectProgress(u.id);
      results.push({
        user: u,
        progress: prog
      });
    }
    return results;
  },

  /**
   * Mark questions as attempted after a battle or daily quiz
   */
  recordQuestionAttempts(userId, questionList, answersMap) {
    const userProgress = LocalDB.getUserSyllabusProgress(userId);
    if (!userProgress.attempted) userProgress.attempted = {};
    if (!userProgress.correct) userProgress.correct = {};

    questionList.forEach((q, idx) => {
      const ans = answersMap[idx];
      if (ans) {
        userProgress.attempted[q.id] = {
          subject: q.subject,
          microtheme: q.microtheme,
          microtheme_id: q.microtheme_id,
          attemptedAt: Date.now()
        };
        if (ans.isCorrect) {
          userProgress.correct[q.id] = true;
        }
      }
    });

    LocalDB.saveUserSyllabusProgress(userId, userProgress);
  }
};
