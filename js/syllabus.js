/**
 * UPSC Prelims Battle Arena — Syllabus Tracker & Microtheme Matrix
 * Calculates overall syllabus coverage percentage, subject completion, and friend comparative matrix
 */

import { loadSyllabus, LocalDB } from './storage.js';
import { peerBus } from './firebase-service.js';

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
    const grandAttempted = Object.keys(attemptedMap).length;
    const grandCorrect = Object.keys(correctMap).length;

    const subjectsSummary = (syllabus.subjects || []).map(sub => {
      const subTotal = sub.total_questions || 0;
      grandTotal += subTotal;

      // Count all questions attempted in this subject
      let subAttempted = 0;
      let subCorrect = 0;

      for (const qId in attemptedMap) {
        const item = attemptedMap[qId];
        const isSubjectMatch = (item.subject && sub.name && item.subject.trim().toLowerCase() === sub.name.trim().toLowerCase()) ||
          (sub.microthemes && sub.microthemes.some(mt => mt.id === item.microtheme_id || (mt.name && item.microtheme && mt.name.trim().toLowerCase() === item.microtheme.trim().toLowerCase())));

        if (isSubjectMatch) {
          subAttempted++;
          if (correctMap[qId]) {
            subCorrect++;
          }
        }
      }

      const microthemes = (sub.microthemes || []).map(mt => {
        const mtTotal = mt.total || 0;
        let mtAttempted = 0;
        let mtCorrect = 0;

        for (const qId in attemptedMap) {
          const item = attemptedMap[qId];
          if (item && (item.microtheme_id === mt.id || (item.microtheme && mt.name && item.microtheme.trim().toLowerCase() === mt.name.trim().toLowerCase()))) {
            mtAttempted++;
            if (correctMap[qId]) {
              mtCorrect++;
            }
          }
        }

        return {
          id: mt.id,
          name: mt.name,
          yield: mt.yield,
          total: mtTotal,
          attempted: mtAttempted,
          correct: mtCorrect,
          pct: mtTotal > 0 ? Math.round((Math.min(mtTotal, mtAttempted) / mtTotal) * 100) : (mtAttempted > 0 ? 100 : 0)
        };
      });

      return {
        name: sub.name,
        icon: sub.icon || '📚',
        color: sub.color || '#6366f1',
        total: subTotal,
        attempted: subAttempted,
        correct: subCorrect,
        pct: subTotal > 0 ? Math.round((Math.min(subTotal, subAttempted) / subTotal) * 100) : (subAttempted > 0 ? 100 : 0),
        accuracy: subAttempted > 0 ? Math.round((subCorrect / subAttempted) * 100) : 0,
        microthemes
      };
    });

    return {
      totalQuestions: grandTotal || 6215,
      attemptedQuestions: grandAttempted,
      correctQuestions: grandCorrect,
      overallPct: grandTotal > 0 ? Math.round((grandAttempted / grandTotal) * 100) : (grandAttempted > 0 ? 1 : 0),
      overallAccuracy: grandAttempted > 0 ? Math.round((grandCorrect / grandAttempted) * 100) : 0,
      subjects: subjectsSummary
    };
  },

  /**
   * Get comparative syllabus coverage among all friends
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
    if (!userId || !questionList) return;
    const userProgress = LocalDB.getUserSyllabusProgress(userId);
    if (!userProgress.attempted) userProgress.attempted = {};
    if (!userProgress.correct) userProgress.correct = {};

    questionList.forEach((q, idx) => {
      const ans = answersMap[idx];
      if (ans) {
        const qId = q.id || `q_${q.microtheme_id || q.microtheme || 'gen'}_${idx}`;
        userProgress.attempted[qId] = {
          id: qId,
          subject: q.subject || 'Polity',
          microtheme: q.microtheme || '',
          microtheme_id: q.microtheme_id || '',
          attemptedAt: Date.now()
        };
        if (ans.isCorrect) {
          userProgress.correct[qId] = true;
        }
      }
    });

    LocalDB.saveUserSyllabusProgress(userId, userProgress);

    try {
      peerBus.set(`syllabus_progress/${userId}`, userProgress);
    } catch (e) {
      console.warn("Cloud syllabus sync error:", e);
    }
  }
};
