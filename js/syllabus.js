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
    let userProgress = LocalDB.getUserSyllabusProgress(userId);

    // Sync in background without blocking UI rendering
    peerBus.getAsync(`syllabus_progress/${userId}`).then(cloudProgress => {
      if (cloudProgress && typeof cloudProgress === 'object') {
        const currentLocal = LocalDB.getUserSyllabusProgress(userId);
        const cloudAttempted = Object.keys(cloudProgress.attempted || {}).length;
        const localAttempted = Object.keys(currentLocal.attempted || {}).length;
        if (cloudAttempted >= localAttempted) {
          const merged = {
            attempted: { ...(currentLocal.attempted || {}), ...(cloudProgress.attempted || {}) },
            correct: { ...(currentLocal.correct || {}), ...(cloudProgress.correct || {}) }
          };
          LocalDB.saveUserSyllabusProgress(userId, merged);
        }
      }
    }).catch(() => {});

    const attemptedMap = userProgress.attempted || {};
    const correctMap = userProgress.correct || {};

    let grandTotal = 0;
    let grandAttempted = Object.keys(attemptedMap).length;
    let grandCorrect = Object.keys(correctMap).length;

    // Check user stats for any additional attempts from battles/daily
    const registeredUser = LocalDB.getRegisteredUsers().find(u => u.id === userId);
    const stats = registeredUser?.stats || {};
    if ((stats.questionsAttempted || 0) > grandAttempted) {
      grandAttempted = Number(stats.questionsAttempted);
    }
    if ((stats.questionsCorrect || 0) > grandCorrect) {
      grandCorrect = Number(stats.questionsCorrect);
    }

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

        const rawMtPct = mtTotal > 0 ? ((Math.min(mtTotal, mtAttempted) / mtTotal) * 100) : (mtAttempted > 0 ? 100 : 0);
        const mtPct = rawMtPct > 0 && rawMtPct < 1 ? Number(rawMtPct.toFixed(1)) : Math.round(rawMtPct);

        return {
          id: mt.id,
          name: mt.name,
          yield: mt.yield,
          total: mtTotal,
          attempted: mtAttempted,
          correct: mtCorrect,
          pct: mtPct
        };
      });

      const rawSubPct = subTotal > 0 ? ((Math.min(subTotal, subAttempted) / subTotal) * 100) : (subAttempted > 0 ? 100 : 0);
      const subPct = rawSubPct > 0 && rawSubPct < 1 ? Number(rawSubPct.toFixed(1)) : Math.round(rawSubPct);

      return {
        name: sub.name,
        icon: sub.icon || '📚',
        color: sub.color || '#6366f1',
        total: subTotal,
        attempted: subAttempted,
        correct: subCorrect,
        pct: subPct,
        accuracy: subAttempted > 0 ? Math.round((subCorrect / subAttempted) * 100) : 0,
        microthemes
      };
    });

    const totalQuestions = grandTotal || 6215;
    let overallPct = 0;
    if (totalQuestions > 0 && grandAttempted > 0) {
      const rawPct = (grandAttempted / totalQuestions) * 100;
      overallPct = rawPct < 1 ? Number(rawPct.toFixed(1)) : Math.round(rawPct);
    }

    const overallAccuracy = grandAttempted > 0 
      ? Math.round((grandCorrect / grandAttempted) * 100) 
      : 0;

    return {
      totalQuestions,
      attemptedQuestions: grandAttempted,
      correctQuestions: grandCorrect,
      overallPct,
      overallAccuracy,
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
