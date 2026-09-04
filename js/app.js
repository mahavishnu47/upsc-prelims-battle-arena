/**
 * UPSC Prelims Battle Arena — Master Application Controller
 * Connects Auth, Battle Engine, Firebase Sync, Syllabus Tracker, Streaks, Leaderboard, and UI
 */

import { Auth, AVATARS } from './auth.js';
import { router } from './router.js';
import { loadQuestions, loadSyllabus, LocalDB } from './storage.js';
import { BattleEngine } from './battle-engine.js';
import { BattleService, peerBus, getSavedFirebaseConfig, saveFirebaseConfig } from './firebase-service.js';
import { DailyChallenge } from './daily.js';
import { SyllabusTracker } from './syllabus.js';
import { StreakSystem, BADGES } from './streaks.js';
import { Leaderboard } from './leaderboard.js';
import { formatQuestionHTML } from './question-formatter.js';
import {
  sounds,
  showToast,
  launchConfetti,
  copyToClipboard,
  shareViaWhatsApp,
  getISTDateString,
  getSecondsUntilMidnightIST
} from './utils.js';

// DOM Elements
const mainView = document.getElementById('main-view');
const headerUserWidget = document.getElementById('header-user-widget');
const navLinks = document.querySelectorAll('#main-nav .nav-btn');

// ==========================================
// 1. Navigation & Header Updates
// ==========================================
function updateNavigation(activeRoute) {
  document.querySelectorAll('#main-nav .nav-btn').forEach(link => {
    if (link.getAttribute('data-route') === activeRoute) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  document.querySelectorAll('#mobile-nav .mobile-nav-item').forEach(link => {
    if (link.getAttribute('data-route') === activeRoute) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  const currentUser = Auth.getCurrentUser();
  const isCloudConnected = !!getSavedFirebaseConfig();

  if (currentUser) {
    StreakSystem.updateDailyStreak(currentUser);
    const stats = currentUser.stats || {};
    headerUserWidget.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
        <button id="btn-cloud-setup" class="btn btn-glass btn-sm" title="Cloud Database Sync Settings" style="font-size: 0.8rem; padding: 6px 8px;">
          <span>${isCloudConnected ? '🟢' : '☁️'}</span><span class="desktop-only-text" style="margin-left: 4px;">${isCloudConnected ? 'Cloud Active' : 'Cloud Sync'}</span>
        </button>
        <div class="streak-badge" title="Daily Streak">
          <span class="flame-icon">🔥</span>
          <span>${stats.dailyStreak || 1}d</span>
        </div>
        <div class="user-badge" id="user-profile-toggle" title="View Profile" style="cursor: pointer; flex-shrink: 0;">
          <div class="avatar-circle">${currentUser.avatar || '🎯'}</div>
          <span class="desktop-only-text" style="font-weight: 600; font-size: 0.88rem; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${currentUser.name}</span>
        </div>
      </div>
    `;

    document.getElementById('user-profile-toggle')?.addEventListener('click', () => {
      sounds.click();
      window.location.hash = '#profile';
    });

    document.getElementById('btn-cloud-setup')?.addEventListener('click', () => {
      sounds.click();
      openCloudSetupModal();
    });
  } else {
    headerUserWidget.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
        <button id="btn-cloud-setup" class="btn btn-glass btn-sm" title="Cloud Database Sync Settings">☁️</button>
        <a href="#auth" class="btn btn-primary btn-sm">Sign In</a>
      </div>
    `;

    document.getElementById('btn-cloud-setup')?.addEventListener('click', () => {
      sounds.click();
      openCloudSetupModal();
    });
  }
}

function openCloudSetupModal() {
  const currentConfig = getSavedFirebaseConfig();
  let modal = document.getElementById('cloud-setup-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cloud-setup-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 520px;">
      <div class="flex-between mb-2">
        <h3 style="font-size: 1.25rem; display: flex; align-items: center; gap: 8px;">
          <span>🔥</span> Firebase Realtime Sync Setup
        </h3>
        <button id="close-cloud-modal" class="btn btn-glass btn-icon" style="border: none; font-size: 1.2rem;">✕</button>
      </div>
      <p style="color: var(--text-secondary); font-size: 0.88rem; margin-bottom: 16px;">
        Connect your free Firebase Realtime Database so all 3 friends can battle live across mobile phones and internet from anywhere.
      </p>

      <div class="form-group">
        <label class="form-label">Firebase Config JSON / JS Object</label>
        <textarea id="firebase-config-input" class="form-input" rows="6" placeholder='{\n  "apiKey": "AIzaSy...",\n  "databaseURL": "https://your-app-rtdb.firebaseio.com",\n  "projectId": "your-app"\n}' style="font-family: var(--font-mono); font-size: 0.8rem;">${currentConfig ? JSON.stringify(currentConfig, null, 2) : ''}</textarea>
        <small style="color: var(--text-muted); font-size: 0.75rem; margin-top: 4px;">
          Copy from Firebase Console ➔ Project Settings ➔ General ➔ "Your apps" ➔ Web SDK snippet
        </small>
      </div>

      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <button id="btn-save-firebase" class="btn btn-primary w-full">Save & Connect Cloud 🚀</button>
        ${currentConfig ? '<button id="btn-clear-firebase" class="btn btn-glass" style="color: #ef4444;">Disconnect</button>' : ''}
      </div>
    </div>
  `;

  modal.classList.add('active');

  document.getElementById('close-cloud-modal')?.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  document.getElementById('btn-save-firebase')?.addEventListener('click', () => {
    const raw = document.getElementById('firebase-config-input')?.value.trim();
    if (!raw) return showToast("Please paste your Firebase config", "error");
    try {
      // Clean possible JS object format (e.g. const firebaseConfig = { ... };)
      let cleaned = raw;
      if (cleaned.includes('{') && cleaned.includes('}')) {
        cleaned = cleaned.substring(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1);
      }
      // Replace unquoted keys
      const jsonStr = cleaned.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":').replace(/'/g, '"');
      const parsed = JSON.parse(cleaned.startsWith('{') ? cleaned : jsonStr);

      saveFirebaseConfig(parsed);
      sounds.fanfare();
      showToast("Connected to Firebase Realtime Database! 🔥", "success");
      modal.classList.remove('active');
      updateNavigation(router.currentRoute);
    } catch (err) {
      // Fallback eval for pure JS snippet
      try {
        const fn = new Function(`return (${raw});`);
        const parsed = fn();
        saveFirebaseConfig(parsed);
        sounds.fanfare();
        showToast("Connected to Firebase Realtime Database! 🔥", "success");
        modal.classList.remove('active');
        updateNavigation(router.currentRoute);
      } catch (e2) {
        showToast("Invalid Firebase config format. Please check JSON syntax.", "error");
      }
    }
  });

  document.getElementById('btn-clear-firebase')?.addEventListener('click', () => {
    localStorage.removeItem('upsc_custom_firebase_config');
    sounds.click();
    showToast("Disconnected custom Firebase config", "info");
    modal.classList.remove('active');
    updateNavigation(router.currentRoute);
  });
}

// ==========================================
// 2. View: Auth (PIN Login / Register)
// ==========================================
// ==========================================
// 2. View: Auth (Searchable PIN Login / Register)
// ==========================================
function renderAuthView() {
  let users = Auth.getRegisteredUsers();
  let selectedUserId = users[0]?.id || '';
  let activeTab = users.length > 0 ? 'login' : 'register';

  function buildUserListHTML(userList, query = '') {
    const q = query.toLowerCase().trim();
    const filtered = q ? userList.filter(u => u.name.toLowerCase().includes(q)) : userList;

    if (filtered.length === 0) {
      return `
        <div style="text-align: center; padding: 18px; color: var(--text-muted); font-size: 0.85rem; border: 1px dashed var(--border-subtle); border-radius: var(--radius-md);">
          ${q ? `No friend found matching "<strong>${query}</strong>"` : 'No registered friends found yet.'}
          <div style="margin-top: 8px;">
            <button type="button" id="btn-switch-to-register-inline" class="btn btn-gold btn-sm" style="font-size: 0.8rem; padding: 4px 10px;">
              + Register "${query || 'New User'}"
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 8px; max-height: 180px; overflow-y: auto; padding-right: 4px;" id="user-select-list">
        ${filtered.map(u => {
          const isSel = u.id === selectedUserId || (!selectedUserId && filtered[0].id === u.id);
          if (isSel && !selectedUserId) selectedUserId = u.id;
          return `
            <div class="user-card-item ${isSel ? 'selected' : ''}" data-user-id="${u.id}" data-user-name="${u.name}" style="cursor: pointer; padding: 10px 14px; border-radius: var(--radius-md); background: ${isSel ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.04)'}; border: 1px solid ${isSel ? 'var(--primary)' : 'var(--border-subtle)'}; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s ease;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="font-size: 1.4rem;">${u.avatar || '🎯'}</div>
                <div>
                  <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary);">${u.name}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">${(u.stats?.battlesWon || 0)} Wins • 🔥 ${u.stats?.dailyStreak || 1}d Streak</div>
                </div>
              </div>
              <div>
                ${isSel ? '<span style="color: var(--primary); font-size: 1.1rem; font-weight: 900;">✓</span>' : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderFullUI() {
    mainView.innerHTML = `
      <div style="max-width: 440px; margin: 30px auto;" class="glass-card">
        <div style="padding: 28px 24px;">
          <div class="text-center mb-4">
            <div style="font-size: 3rem; margin-bottom: 8px; animation: pulse-fire 2s infinite alternate;">⚔️</div>
            <h2 class="gradient-text" style="font-size: 1.8rem; margin-bottom: 4px;">UPSC Battle Arena</h2>
            <p style="color: var(--text-secondary); font-size: 0.9rem;">
              6,215 Curated MCQs • Live 3-Player Clashes
            </p>
          </div>

          <div style="display: flex; gap: 8px; margin-bottom: 22px; background: rgba(0,0,0,0.25); padding: 4px; border-radius: var(--radius-md);">
            <button id="tab-login" class="btn ${activeTab === 'login' ? 'btn-primary' : 'btn-glass'} w-full" style="padding: 8px; font-weight: 700;">Sign In</button>
            <button id="tab-register" class="btn ${activeTab === 'register' ? 'btn-primary' : 'btn-glass'} w-full" style="padding: 8px; font-weight: 700;">Register</button>
          </div>

          <!-- Sign In Form -->
          <div id="form-login" style="display: ${activeTab === 'login' ? 'block' : 'none'};">
            <!-- Search / Select Friend -->
            <div class="form-group mb-2">
              <label class="form-label" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Select or Search Friend</span>
                <span id="cloud-sync-status" style="font-size: 0.72rem; color: #34d399;">● Cloud Synced</span>
              </label>
              <div style="position: relative; margin-bottom: 8px;">
                <input type="text" id="login-search-input" class="form-input" placeholder="🔍 Type friend name to search..." style="padding-left: 14px; font-size: 0.9rem;" autocomplete="off" />
              </div>
            </div>

            <!-- Friend Cards List -->
            <div class="form-group mb-4" id="user-cards-container">
              ${buildUserListHTML(users)}
            </div>

            <!-- Also include standard dropdown for convenience -->
            <div class="form-group" style="display: none;">
              <select id="login-user-select" class="form-select">
                ${users.map(u => `<option value="${u.id}" ${u.id === selectedUserId ? 'selected' : ''}>${u.avatar} ${u.name}</option>`).join('')}
              </select>
            </div>

            <!-- PIN Input -->
            <div class="form-group mb-4">
              <label class="form-label">4-Digit Secret PIN</label>
              <input type="password" id="login-pin" class="form-input text-center" maxlength="4" inputmode="numeric" pattern="[0-9]*" placeholder="••••" style="font-size: 1.8rem; letter-spacing: 8px; font-family: var(--font-mono);" />
            </div>

            <button id="btn-submit-login" class="btn btn-primary w-full btn-lg">
              Enter Battle Arena 🚀
            </button>
          </div>

          <!-- Register Form -->
          <div id="form-register" style="display: ${activeTab === 'register' ? 'block' : 'none'};">
            <div class="form-group mb-3">
              <label class="form-label">Your Name</label>
              <input type="text" id="reg-name" class="form-input" placeholder="e.g. Vishnu, Priya, Amit" maxlength="25" />
            </div>

            <div class="form-group mb-3">
              <label class="form-label">Choose Avatar</label>
              <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;" id="avatar-picker">
                ${AVATARS.map((av, idx) => `
                  <button type="button" class="btn btn-glass btn-icon avatar-btn ${idx === 0 ? 'selected-avatar' : ''}" data-avatar="${av}" style="font-size: 1.3rem; border: ${idx === 0 ? '2px solid var(--primary)' : '1px solid var(--border-subtle)'};">
                    ${av}
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="form-group mb-4">
              <label class="form-label">Set 4-Digit Secret PIN</label>
              <input type="password" id="reg-pin" class="form-input text-center" maxlength="4" inputmode="numeric" pattern="[0-9]*" placeholder="••••" style="font-size: 1.8rem; letter-spacing: 8px; font-family: var(--font-mono);" />
              <small style="color: var(--text-muted); font-size: 0.75rem; margin-top: 4px; display: block;">Used for fast, passwordless login across all devices</small>
            </div>

            <button id="btn-submit-register" class="btn btn-gold w-full btn-lg">
              Create Profile & Start 👑
            </button>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function attachUserCardClickListeners() {
    document.querySelectorAll('.user-card-item').forEach(card => {
      card.addEventListener('click', () => {
        sounds.click();
        selectedUserId = card.getAttribute('data-user-id');
        const userName = card.getAttribute('data-user-name');
        
        const searchInput = document.getElementById('login-search-input');
        if (searchInput) searchInput.value = userName;

        const selectEl = document.getElementById('login-user-select');
        if (selectEl) selectEl.value = selectedUserId;

        // Re-render user cards list to show selected checkmark
        const container = document.getElementById('user-cards-container');
        if (container) {
          container.innerHTML = buildUserListHTML(users, searchInput?.value || '');
          attachUserCardClickListeners();
        }

        // Focus PIN input automatically
        document.getElementById('login-pin')?.focus();
      });
    });

    document.getElementById('btn-switch-to-register-inline')?.addEventListener('click', () => {
      sounds.click();
      activeTab = 'register';
      const searchVal = document.getElementById('login-search-input')?.value || '';
      renderFullUI();
      const nameInput = document.getElementById('reg-name');
      if (nameInput) {
        nameInput.value = searchVal;
        nameInput.focus();
      }
    });
  }

  function bindEvents() {
    // Avatar picker
    let selectedAvatar = AVATARS[0];
    document.querySelectorAll('.avatar-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sounds.click();
        document.querySelectorAll('.avatar-btn').forEach(b => b.style.border = '1px solid var(--border-subtle)');
        btn.style.border = '2px solid var(--primary)';
        selectedAvatar = btn.getAttribute('data-avatar');
      });
    });

    // Tab switching
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');

    tabLogin?.addEventListener('click', () => {
      sounds.click();
      activeTab = 'login';
      tabLogin.className = 'btn btn-primary w-full';
      tabRegister.className = 'btn btn-glass w-full';
      formLogin.style.display = 'block';
      formRegister.style.display = 'none';
    });

    tabRegister?.addEventListener('click', () => {
      sounds.click();
      activeTab = 'register';
      tabRegister.className = 'btn btn-primary w-full';
      tabLogin.className = 'btn btn-glass w-full';
      formRegister.style.display = 'block';
      formLogin.style.display = 'none';
    });

    // Search filter input listener
    const searchInput = document.getElementById('login-search-input');
    searchInput?.addEventListener('input', (e) => {
      const q = e.target.value;
      const container = document.getElementById('user-cards-container');
      if (container) {
        container.innerHTML = buildUserListHTML(users, q);
        attachUserCardClickListeners();
      }
    });

    // Login submit
    document.getElementById('btn-submit-login')?.addEventListener('click', async () => {
      sounds.click();
      const searchVal = document.getElementById('login-search-input')?.value?.trim() || '';
      const selectedId = selectedUserId || document.getElementById('login-user-select')?.value;
      const pin = document.getElementById('login-pin')?.value;
      
      const targetUserIdentifier = selectedId || searchVal;

      try {
        await Auth.login(targetUserIdentifier, pin);
        window.location.hash = '#dashboard';
      } catch (err) {
        sounds.wrong();
        showToast(err.message, 'error');
      }
    });

    // Auto submit on 4th digit in PIN
    document.getElementById('login-pin')?.addEventListener('input', (e) => {
      if (e.target.value.length === 4) {
        document.getElementById('btn-submit-login')?.click();
      }
    });

    // Register submit
    document.getElementById('btn-submit-register')?.addEventListener('click', async () => {
      sounds.click();
      const name = document.getElementById('reg-name')?.value;
      const pin = document.getElementById('reg-pin')?.value;
      try {
        await Auth.register(name, pin, selectedAvatar);
        window.location.hash = '#dashboard';
      } catch (err) {
        sounds.wrong();
        showToast(err.message, 'error');
      }
    });

    attachUserCardClickListeners();
  }

  // Initial render
  renderFullUI();

  const updateUsersListUI = (cloudUsers) => {
    if (Array.isArray(cloudUsers)) {
      users = cloudUsers;
      if (selectedUserId && !users.some(u => u.id === selectedUserId)) {
        selectedUserId = users[0]?.id || '';
      }
      const container = document.getElementById('user-cards-container');
      const searchInput = document.getElementById('login-search-input');
      if (container) {
        container.innerHTML = buildUserListHTML(users, searchInput?.value || '');
        attachUserCardClickListeners();
      }
    }
  };

  // Background cloud sync to immediately populate or prune users
  Auth.syncCloudUsers().then(updateUsersListUI);

  // Subscribe to real-time cloud user changes (additions / deletions)
  UserService.subscribeToUsers(updateUsersListUI);
}

// ==========================================
// 3. View: Dashboard
// ==========================================
async function renderDashboardView() {
  const user = Auth.getCurrentUser();
  if (!user) return router.navigate('#auth');

  const stats = user.stats || {};
  const progress = await SyllabusTracker.getSubjectProgress(user.id);
  const recentBattles = LocalDB.getRecentBattles(user.id);
  const mistakes = LocalDB.getUserMistakes(user.id);
  const todayStr = getISTDateString();
  const dailyStatus = DailyChallenge.hasUserCompletedToday(user.id, todayStr);

  const dailyBtnHTML = dailyStatus.completed
    ? `
      <a href="#daily" class="btn btn-emerald btn-lg" style="background: rgba(16, 185, 129, 0.18); border: 1px solid rgba(16, 185, 129, 0.45); color: #34d399;">
        <span>✅</span> Daily 10 (Completed • ${dailyStatus.submission?.score !== undefined ? formatMarks(dailyStatus.submission.score) : 'Done'})
      </a>
    `
    : `
      <a href="#daily" class="btn btn-gold btn-lg">
        <span>🔥</span> Daily 10
      </a>
    `;

  mainView.innerHTML = `
    <!-- Top Welcome Banner with Quick Actions -->
    <div class="glass-card" style="padding: 28px; margin-bottom: 24px; position: relative; overflow: hidden;">
      <div style="position: absolute; right: -20px; top: -20px; font-size: 8rem; opacity: 0.05; pointer-events: none;">🏛️</div>
      <div class="flex-between" style="flex-wrap: wrap; gap: 16px;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
            <span style="font-size: 1.8rem;">${user.avatar || '🎯'}</span>
            <h1 style="font-size: 1.8rem;">Ready for Prelims, ${user.name}?</h1>
          </div>
          <p style="color: var(--text-secondary); max-width: 600px;">
            Challenge your friends in real-time MCQs, master 186 microthemes, and climb the battle ranks.
          </p>
        </div>

        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <a href="#create-battle" class="btn btn-primary btn-lg">
            <span>⚔️</span> Host Battle
          </a>
          ${dailyBtnHTML}
          ${mistakes.length > 0 ? `
            <a href="#practice-mistakes" class="btn btn-glass btn-lg" style="border-color: rgba(239,68,68,0.4); color: #fca5a5;">
              <span>📕</span> Practice Mistakes (${mistakes.length})
            </a>
          ` : ''}
        </div>
      </div>
    </div>

    <!-- 4 Stats Summary Cards -->
    <div class="grid-4 mb-4">
      <div class="glass-card" style="padding: 20px;">
        <div style="color: var(--text-muted); font-size: 0.8rem; font-weight: 700; text-transform: uppercase;">Daily Streak</div>
        <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 6px;">
          <span style="font-size: 2.2rem; font-weight: 800; color: #fbbf24;">${stats.dailyStreak || 1}</span>
          <span style="color: var(--text-secondary); font-size: 0.9rem;">Days 🔥</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Max streak: ${stats.maxStreak || 1} days</div>
      </div>

      <div class="glass-card" style="padding: 20px;">
        <div style="color: var(--text-muted); font-size: 0.8rem; font-weight: 700; text-transform: uppercase;">Total Marks</div>
        <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 6px;">
          <span style="font-size: 2.2rem; font-weight: 800; color: #818cf8;">${Number(stats.totalPoints || 0).toFixed(2)}</span>
          <span style="color: var(--text-secondary); font-size: 0.9rem;">marks 🏆</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">${stats.battlesWon || 0} Battles Won</div>
      </div>

      <div class="glass-card" style="padding: 20px;">
        <div style="color: var(--text-muted); font-size: 0.8rem; font-weight: 700; text-transform: uppercase;">Syllabus Coverage</div>
        <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 6px;">
          <span style="font-size: 2.2rem; font-weight: 800; color: #34d399;">${progress.overallPct}%</span>
          <span style="color: var(--text-secondary); font-size: 0.9rem;">Done 📚</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">${progress.attemptedQuestions} / ${progress.totalQuestions} questions</div>
      </div>

      <div class="glass-card" style="padding: 20px;">
        <div style="color: var(--text-muted); font-size: 0.8rem; font-weight: 700; text-transform: uppercase;">Accuracy (Net)</div>
        <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 6px;">
          <span style="font-size: 2.2rem; font-weight: 800; color: #f472b6;">${progress.overallAccuracy}%</span>
          <span style="color: var(--text-secondary); font-size: 0.9rem;">🎯</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">-0.66 penalty applied</div>
      </div>
    </div>

    <!-- Syllabus Progress Overview & Recent Battles Grid -->
    <div class="grid-2">
      <!-- Syllabus Subject Bars -->
      <div class="glass-card" style="padding: 24px;">
        <div class="flex-between mb-4">
          <h3 style="font-size: 1.15rem; display: flex; align-items: center; gap: 8px;">
            <span>📚</span> Subject Mastery
          </h3>
          <a href="#syllabus" style="color: var(--primary); font-size: 0.85rem; font-weight: 600; text-decoration: none;">View All 183 Themes →</a>
        </div>

        <div style="display: flex; flex-direction: column; gap: 14px;">
          ${progress.subjects.slice(0, 5).map(sub => `
            <div>
              <div class="flex-between" style="font-size: 0.88rem; margin-bottom: 4px;">
                <span style="font-weight: 600;">${sub.icon} ${sub.name}</span>
                <span style="color: var(--text-secondary);">${sub.attempted} / ${sub.total} (${sub.pct}%)</span>
              </div>
              <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden;">
                <div style="width: ${sub.pct}%; height: 100%; background: ${sub.color || 'var(--primary)'}; transition: width 0.5s ease;"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Recent Battles List -->
      <div class="glass-card" style="padding: 24px;">
        <div class="flex-between mb-4">
          <h3 style="font-size: 1.15rem; display: flex; align-items: center; gap: 8px;">
            <span>⚔️</span> Recent Battles
          </h3>
          <a href="#leaderboard" style="color: var(--primary); font-size: 0.85rem; font-weight: 600; text-decoration: none;">Leaderboard →</a>
        </div>

        ${recentBattles.length === 0 ? `
          <div class="text-center" style="padding: 40px 20px; color: var(--text-muted);">
            <div style="font-size: 2.5rem; margin-bottom: 8px;">🛡️</div>
            <p>No battles fought yet. Host one and invite your friends!</p>
            <a href="#create-battle" class="btn btn-primary btn-sm mt-4">Start First Battle</a>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${recentBattles.slice(0, 4).map(b => `
              <div class="glass-panel" style="padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;">
                <div>
                  <div style="font-weight: 600; font-size: 0.95rem;">${b.subject || 'All Subjects'} Battle</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">${new Date(b.date).toLocaleDateString()} • ${b.questionCount} Questions</div>
                </div>
                <div class="text-right">
                  <div style="font-weight: 700; color: ${b.won ? '#34d399' : '#fcd34d'}; font-size: 0.95rem;">
                    ${b.won ? '🏆 1st Place' : `Rank #${b.rank || 2}`}
                  </div>
                  <div style="font-size: 0.8rem; color: var(--text-secondary);">${Number(b.score || 0).toFixed(2)} marks</div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

// ==========================================
// 4. View: Create Battle Form
// ==========================================
async function renderCreateBattleView() {
  const user = Auth.getCurrentUser();
  if (!user) return router.navigate('#auth');

  const syllabus = await loadSyllabus();
  const userProgress = LocalDB.getUserSyllabusProgress(user.id);

  mainView.innerHTML = `
    <div style="max-width: 680px; margin: 0 auto;">
      <div class="glass-card" style="padding: 32px;">
        <div style="margin-bottom: 24px;">
          <h2 class="gradient-primary" style="font-size: 1.6rem; margin-bottom: 6px;">⚔️ Host a UPSC Battle</h2>
          <p style="color: var(--text-secondary); font-size: 0.95rem;">
            Configure question scope, time limits, and generate an instant lobby link for your friends.
          </p>
        </div>

        <form id="create-battle-form">
          <!-- Subject Select with attempt indicator -->
          <div class="form-group">
            <label class="form-label">Subject Scope</label>
            <select id="battle-subject-select" class="form-select">
              <option value="all">🌟 All Subjects (Mixed UPSC CSE/CDS/CAPF)</option>
              ${syllabus.subjects.map(s => `
                <option value="${s.name}">${s.icon} ${s.name} (${s.total_questions} MCQs)</option>
              `).join('')}
            </select>
          </div>

          <!-- Microthemes Sub-Selector (Populated dynamically when a subject is picked) -->
          <div class="form-group" id="microtheme-selector-group" style="display: none;">
            <label class="form-label">Filter Specific Microthemes (Optional)</label>
            <div id="microtheme-checkbox-list" style="max-height: 160px; overflow-y: auto; background: rgba(0,0,0,0.25); padding: 10px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 6px;">
              <!-- Populated dynamically -->
            </div>
          </div>

          <div class="grid-2 gap-2">
            <div class="form-group">
              <label class="form-label">Number of Questions</label>
              <select id="battle-count-select" class="form-select">
                <option value="5">5 Questions (Quick Clash)</option>
                <option value="10" selected>10 Questions (Standard Battle)</option>
                <option value="15">15 Questions (Deep Drill)</option>
                <option value="25">25 Questions (Prelims Mini-Mock)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Player Limit (Up to 10)</label>
              <select id="battle-players-count-select" class="form-select">
                <option value="2">2 Players (1v1 Duel)</option>
                <option value="3">3 Players</option>
                <option value="4">4 Players</option>
                <option value="5">5 Players</option>
                <option value="10" selected>10 Players (Battle Royale Max)</option>
              </select>
            </div>
          </div>

          <!-- UPSC Simulation Rules Banner -->
          <div class="glass-panel" style="padding: 14px 18px; margin: 16px 0; border-left: 4px solid var(--accent-gold);">
            <div style="font-weight: 700; color: #fcd34d; font-size: 0.9rem; margin-bottom: 2px;">⚡ Official UPSC Prelims Marking Scheme:</div>
            <ul style="font-size: 0.82rem; color: var(--text-secondary); margin-left: 18px; line-height: 1.5;">
              <li><strong>+2.0 Marks</strong> for each Correct Answer</li>
              <li><strong>-0.66 Marks (-1/3rd penalty)</strong> for Wrong Answers</li>
              <li>Questions advance <strong>independently</strong> for each friend at their own speed (untimed)</li>
            </ul>
          </div>

          <!-- Lobby Unattempted Filter Toggle -->
          <div class="glass-panel" style="padding: 14px 18px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="font-weight: 600; font-size: 0.95rem;">Prioritize Unattempted MCQs</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">Selects questions unattempted by all players in the lobby</div>
            </div>
            <input type="checkbox" id="battle-unattempted-toggle" checked style="width: 20px; height: 20px; accent-color: var(--primary);" />
          </div>

          <button type="submit" class="btn btn-primary w-full btn-lg">
            Create Battle Room & Invite Link 🚀
          </button>
        </form>
      </div>
    </div>
  `;

  const subjectSelect = document.getElementById('battle-subject-select');
  const mtGroup = document.getElementById('microtheme-selector-group');
  const mtList = document.getElementById('microtheme-checkbox-list');

  subjectSelect.addEventListener('change', () => {
    const chosen = subjectSelect.value;
    if (chosen === 'all') {
      mtGroup.style.display = 'none';
      mtList.innerHTML = '';
    } else {
      const sub = syllabus.subjects.find(s => s.name === chosen);
      if (sub && sub.microthemes) {
        mtGroup.style.display = 'block';
        mtList.innerHTML = sub.microthemes.map(mt => `
          <label style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem; cursor: pointer;">
            <input type="checkbox" class="mt-checkbox" value="${mt.id}" />
            <span>${mt.name} <strong style="color: var(--text-muted);">(${mt.total} Qs)</strong></span>
          </label>
        `).join('');
      }
    }
  });

  document.getElementById('create-battle-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    sounds.click();

    const subject = subjectSelect.value;
    const count = parseInt(document.getElementById('battle-count-select').value, 10);
    const maxPlayers = parseInt(document.getElementById('battle-players-count-select')?.value || '10', 10);
    const prioritizeUnattempted = document.getElementById('battle-unattempted-toggle').checked;

    const selectedMts = Array.from(document.querySelectorAll('.mt-checkbox:checked')).map(cb => cb.value);

    // Pick questions
    const questions = await BattleEngine.selectQuestions({
      subject,
      microthemes: selectedMts,
      count,
      prioritizeUnattempted,
      lobbyPlayerIds: [user.id]
    });

    if (!questions || questions.length === 0) {
      return showToast("No questions found matching your filter criteria!", "error");
    }

    const battleId = 'battle_' + Math.random().toString(36).substring(2, 9);
    const roomData = {
      id: battleId,
      hostId: user.id,
      hostName: user.name,
      subject: subject === 'all' ? 'All Subjects' : subject,
      questionCount: questions.length,
      maxPlayers,
      status: 'waiting', // waiting -> starting -> active -> finished
      createdAt: Date.now(),
      questions,
      players: {
        [user.id]: {
          id: user.id,
          name: user.name,
          avatar: user.avatar || '🎯',
          score: 0,
          currentQuestionIndex: 0,
          answers: {},
          isReady: true,
          finished: false,
          streak: 0,
          joinedAt: Date.now()
        }
      }
    };

    await BattleService.createRoom(battleId, roomData);
    router.navigate(`#lobby/${battleId}`);
  });
}

// ==========================================
// 5. View: Battle Lobby
// ==========================================
let lobbyUnsub = null;

function renderLobbyView(params) {
  const battleId = params.id;
  const user = Auth.getCurrentUser();
  if (!user) return router.navigate('#auth');

  if (lobbyUnsub) lobbyUnsub();

  // Ensure current user is joined to this battle room
  BattleService.joinRoom(battleId, user).catch(err => {
    console.warn("Could not join room:", err);
  });

  lobbyUnsub = BattleService.subscribeToRoom(battleId, (room) => {
    if (!room) {
      mainView.innerHTML = `
        <div class="text-center glass-card" style="padding: 40px; max-width: 480px; margin: 40px auto;">
          <h2>Battle Room Not Found</h2>
          <p style="color: var(--text-secondary); margin-12px 0;">This room may have expired or been closed.</p>
          <a href="#dashboard" class="btn btn-primary">Return to Dashboard</a>
        </div>
      `;
      return;
    }

    // If battle already finished or current player has already finished, send directly to results
    const myPlayerState = room.players?.[user.id];
    if (room.status === 'finished' || (myPlayerState && myPlayerState.finished)) {
      if (lobbyUnsub) { lobbyUnsub(); lobbyUnsub = null; }
      router.navigate(`#results/${battleId}`);
      return;
    }

    // Auto navigate if battle started
    if (room.status === 'starting' || room.status === 'active') {
      if (lobbyUnsub) { lobbyUnsub(); lobbyUnsub = null; }
      router.navigate(`#battle/${battleId}`);
      return;
    }

    const playersList = Object.values(room.players || {});
    const maxCapacity = room.maxPlayers || 10;
    const isHost = room.hostId === user.id;
    const shareUrl = `${window.location.origin}${window.location.pathname}#lobby/${battleId}`;

    mainView.innerHTML = `
      <div style="max-width: 600px; margin: 0 auto;">
        <div class="glass-card" style="padding: 30px;">
          <div class="flex-between mb-4">
            <div>
              <span class="badge badge-gold">Battle Lobby</span>
              <h2 style="font-size: 1.6rem; margin-top: 6px;">${room.subject} Clash</h2>
            </div>
            <div class="text-right">
              <div style="font-weight: 700; color: var(--primary);">${room.questionCount} Questions</div>
              <div style="font-size: 0.8rem; color: #34d399; font-weight: 600;">+2.0 / -0.66 Marking</div>
            </div>
          </div>

          <!-- Share Link Box -->
          <div class="glass-panel" style="padding: 16px; margin-bottom: 24px;">
            <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">
              🔗 Share link with your friends to join (Up to ${maxCapacity} players):
            </div>
            <div style="display: flex; gap: 8px;">
              <input type="text" readonly value="${shareUrl}" class="form-input" style="font-size: 0.85rem;" id="lobby-share-input" />
              <button class="btn btn-glass" id="btn-copy-link" title="Copy Link">📋 Copy</button>
              <button class="btn btn-emerald" id="btn-wa-share" style="background: #25D366; color: #fff;" title="Share on WhatsApp">💬 WhatsApp</button>
            </div>
          </div>

          <!-- Players in Lobby -->
          <div style="margin-bottom: 24px;">
            <h4 style="font-size: 0.95rem; color: var(--text-secondary); margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
              <span>Players Joined (${playersList.length}/${maxCapacity})</span>
              <span style="font-size: 0.75rem; color: #34d399;">● Live Sync</span>
            </h4>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${playersList.map((p, idx) => `
                <div class="glass-panel" style="padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; border-left: 3px solid ${p.id === room.hostId ? '#fbbf24' : '#6366f1'};">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="font-size: 1.5rem;">${p.avatar || '🎯'}</div>
                    <div>
                      <div style="font-weight: 700;">${p.name} ${p.id === user.id ? '<span style="color: var(--primary); font-size: 0.8rem;">(You)</span>' : ''}</div>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">${p.id === room.hostId ? '👑 Battle Host' : 'Challenger'}</div>
                    </div>
                  </div>
                  <div class="badge badge-emerald">Ready ⚔️</div>
                </div>
              `).join('')}

              ${playersList.length < maxCapacity ? `
                <div style="border: 2px dashed var(--border-subtle); border-radius: var(--radius-md); padding: 14px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
                  Waiting for up to ${maxCapacity - playersList.length} more friend(s) to join...
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Start Action -->
          ${isHost ? `
            <button id="btn-start-battle" class="btn btn-gold w-full btn-lg">
              Start Battle Countdown ⚔️ (${playersList.length} Players Ready)
            </button>
          ` : `
            <div class="text-center" style="padding: 12px; color: var(--text-secondary); font-size: 0.9rem;">
              Waiting for host <strong>${room.hostName}</strong> to launch the battle...
            </div>
          `}
        </div>
      </div>
    `;

    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      sounds.click();
      copyToClipboard(shareUrl);
    });

    document.getElementById('btn-wa-share')?.addEventListener('click', () => {
      sounds.click();
      shareViaWhatsApp(`Join our UPSC Prelims live MCQ Battle on "${room.subject}"! Click here to play: ${shareUrl}`);
    });

    document.getElementById('btn-start-battle')?.addEventListener('click', async () => {
      sounds.fanfare();
      await BattleService.startBattle(battleId, 4);
    });
  });
}

// ==========================================
// ==========================================
// 6. View: Live Battle Quiz Engine
// ==========================================
let battleUnsub = null;
let startCountdownTimer = null;

function renderBattleView(params) {
  const battleId = params.id;
  const user = Auth.getCurrentUser();
  if (!user) return router.navigate('#auth');

  if (battleUnsub) {
    battleUnsub();
    battleUnsub = null;
  }
  if (startCountdownTimer) {
    clearInterval(startCountdownTimer);
    startCountdownTimer = null;
  }

  let localCurrentQIndex = 0;
  let localAnswers = {};
  let localScore = 0;
  let currentStreak = 0;
  let isAnswerLocked = false;
  let hasInitializedQuestion = false;
  let currentRoomCache = null;

  function formatMarks(score) {
    const num = Number(score || 0);
    return (num >= 0 ? '+' : '') + num.toFixed(2);
  }

  function updateOpponentsBar(room) {
    const oppContainer = document.getElementById('battle-opponents-bar');
    if (!oppContainer || !room || !room.players) return;

    const otherPlayers = Object.values(room.players).filter(p => p.id !== user.id);
    if (otherPlayers.length === 0) {
      oppContainer.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted);">Solo Mode</span>';
      return;
    }

    oppContainer.innerHTML = `
      <div style="display: flex; gap: 8px; overflow-x: auto; max-width: 320px; padding-bottom: 2px;">
        ${otherPlayers.map(op => {
          const opScore = Number(op.score || 0);
          const isFin = op.finished || (op.currentQuestionIndex || 0) >= (room.questions?.length || 10);
          return `
            <div style="text-align: center; min-width: 48px;" title="${op.name}: Q${(op.currentQuestionIndex || 0) + 1}">
              <div style="font-size: 1.15rem;">${op.avatar || '🎯'}</div>
              <div style="font-size: 0.72rem; font-weight: 800; color: ${opScore >= 0 ? '#34d399' : '#f87171'};">
                ${formatMarks(opScore)}
              </div>
              <div style="font-size: 0.62rem; color: var(--text-muted); font-weight: 600;">
                ${isFin ? '✅' : `Q${(op.currentQuestionIndex || 0) + 1}`}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderWaitingScreen(room) {
    const playersList = Object.values(room?.players || {}).sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    const pendingCount = playersList.filter(p => !p.finished).length;

    mainView.innerHTML = `
      <div class="text-center glass-card" style="max-width: 580px; margin: 40px auto; padding: 36px 24px;">
        <div style="font-size: 3.5rem; margin-bottom: 12px; animation: pulse-fire 1.5s infinite alternate;">⏳</div>
        <h2 class="gradient-gold" style="font-size: 1.8rem; margin-bottom: 8px;">Quiz Completed!</h2>
        <p style="color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 20px;">
          ${pendingCount > 0 ? `Waiting for ${pendingCount} friend(s) to finish their questions...` : `All players have finished! Standings are finalized.`}
        </p>

        <div style="background: rgba(0,0,0,0.25); border-radius: var(--radius-md); padding: 16px; margin-bottom: 24px;">
          <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">YOUR FINAL SCORE</div>
          <div style="font-size: 2.2rem; font-weight: 900; color: ${localScore >= 0 ? '#34d399' : '#f87171'};">
            ${formatMarks(localScore)} Marks
          </div>
        </div>

        <!-- Live Opponent Statuses -->
        <div style="margin-bottom: 24px; text-align: left;">
          <h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 10px; text-transform: uppercase; font-weight: 700;">Live Friend Standings:</h4>
          <div id="waiting-players-list" style="display: flex; flex-direction: column; gap: 10px;">
            ${playersList.map((p, idx) => `
              <div class="glass-panel" style="padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; border-left: 3px solid ${idx === 0 ? '#fbbf24' : idx === 1 ? '#94a3b8' : '#cd7f32'};">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="font-weight: 800; color: var(--text-muted); width: 24px;">#${idx + 1}</span>
                  <span style="font-size: 1.3rem;">${p.avatar || '🎯'}</span>
                  <div>
                    <span style="font-weight: 700;">${p.name} ${p.id === user.id ? '<span style="color: var(--primary); font-size: 0.75rem;">(You)</span>' : ''}</span>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${formatMarks(p.score)} marks</div>
                  </div>
                </div>
                <div>
                  ${p.finished ? '<span class="badge badge-emerald">Finished ✅</span>' : `<span class="badge badge-gold">Q ${(p.currentQuestionIndex || 0) + 1}/${room.questions?.length || 10}</span>`}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
          <a href="#results/${battleId}" class="btn btn-primary btn-lg" style="font-weight: 800;">
            🏆 View Battle Standings & Ranks Now
          </a>
          <a href="#dashboard" class="btn btn-glass">🏠 Dashboard</a>
        </div>
      </div>
    `;
  }

  function renderCurrentQuestion() {
    if (!currentRoomCache) return;
    const questions = currentRoomCache.questions || [];
    if (localCurrentQIndex >= questions.length) {
      renderWaitingScreen(currentRoomCache);
      return;
    }

    const currentQ = questions[localCurrentQIndex];
    if (!currentQ) return;

    mainView.innerHTML = `
      <div style="max-width: 840px; margin: 0 auto;">
        <!-- Battle Top Header Bar: Score, Question Index, Streak & Live Opponents -->
        <div class="glass-card" style="padding: 16px 20px; margin-bottom: 18px;">
          <div class="flex-between" style="flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span class="badge badge-primary">Q ${localCurrentQIndex + 1} of ${questions.length}</span>
              <span class="badge badge-gold">⚡ ${currentQ.subject}</span>
              ${currentStreak > 1 ? `<span class="streak-badge"><span class="flame-icon">🔥</span> ${currentStreak}x Streak</span>` : ''}
            </div>

            <div style="display: flex; align-items: center; gap: 16px;">
              <div style="text-align: right;">
                <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">YOUR SCORE</div>
                <div id="battle-my-score" style="font-size: 1.3rem; font-weight: 800; color: ${localScore >= 0 ? '#34d399' : '#f87171'};">
                  ${formatMarks(localScore)}
                </div>
              </div>

              <!-- Opponents Mini Progress Avatars -->
              <div id="battle-opponents-bar" style="display: flex; gap: 10px; border-left: 1px solid var(--border-subtle); padding-left: 14px; align-items: center;">
                <!-- Updated live via updateOpponentsBar -->
              </div>
            </div>
          </div>

          <!-- Question Progress Bar -->
          <div style="height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; margin-top: 14px; overflow: hidden;">
            <div style="width: ${((localCurrentQIndex + 1) / questions.length) * 100}%; height: 100%; background: var(--primary); transition: width 0.3s ease;"></div>
          </div>
        </div>

        <!-- Question Card -->
        <div class="glass-card" style="padding: 28px 24px; margin-bottom: 20px;">
          <div style="display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap;">
            <span class="badge badge-emerald">${currentQ.exam || 'UPSC CSE'} ${currentQ.year || ''}</span>
            <span class="badge badge-primary">${currentQ.microtheme || 'Microtheme'}</span>
            <span class="badge badge-gold" style="font-size: 0.75rem;">+2.0 / -0.66</span>
          </div>

          <div style="margin-bottom: 24px;">
            ${formatQuestionHTML(currentQ.question)}
          </div>

          <!-- MCQ Options A, B, C, D -->
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${['A', 'B', 'C', 'D'].map(opt => {
              const optText = currentQ[`option_${opt.toLowerCase()}`];
              if (!optText) return '';
              return `
                <div class="option-card" data-opt="${opt}" id="opt-${opt}">
                  <div class="option-letter">${opt}</div>
                  <div class="option-text">${optText}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    updateOpponentsBar(currentRoomCache);

    // Attach click listeners to options
    document.querySelectorAll('.option-card').forEach(card => {
      card.addEventListener('click', () => {
        if (isAnswerLocked) return;
        isAnswerLocked = true;

        const selectedOpt = card.getAttribute('data-opt');
        handleLocalQuestionAnswer(currentQ, selectedOpt);
      });
    });
  }

  async function handleLocalQuestionAnswer(currentQ, selectedOpt) {
    const isCorrect = selectedOpt === currentQ.correct_answer;
    const scoreResult = BattleEngine.calculateScore(isCorrect);
    const scoreDelta = scoreResult.points;

    localScore = Math.round((localScore + scoreDelta) * 100) / 100;

    if (isCorrect) {
      sounds.correct();
      currentStreak++;
      document.getElementById(`opt-${selectedOpt}`)?.classList.add('correct');
      showToast(`+2.0 Marks! Correct answer (${selectedOpt})`, 'success', 1200);
    } else {
      sounds.wrong();
      currentStreak = 0;
      if (selectedOpt) {
        document.getElementById(`opt-${selectedOpt}`)?.classList.add('wrong');
      }
      document.getElementById(`opt-${currentQ.correct_answer}`)?.classList.add('correct');
      showToast(`-0.66 Marks! Correct was (${currentQ.correct_answer})`, 'error', 1500);

      // Save to Mistake Notebook
      LocalDB.addMistake(user.id, {
        questionId: currentQ.id,
        question: currentQ.question,
        option_a: currentQ.option_a,
        option_b: currentQ.option_b,
        option_c: currentQ.option_c,
        option_d: currentQ.option_d,
        selectedOption: selectedOpt,
        correctAnswer: currentQ.correct_answer,
        explanation: currentQ.explanation,
        subject: currentQ.subject,
        microtheme: currentQ.microtheme,
        year: currentQ.year
      });
    }

    localAnswers[localCurrentQIndex] = {
      selectedOption: selectedOpt,
      isCorrect,
      pointsEarned: scoreDelta,
      correctAnswer: currentQ.correct_answer,
      explanation: currentQ.explanation
    };

    // Update local score indicator
    const scoreEl = document.getElementById('battle-my-score');
    if (scoreEl) {
      scoreEl.innerText = formatMarks(localScore);
      scoreEl.style.color = localScore >= 0 ? '#34d399' : '#f87171';
    }

    // Submit answer to Firebase in background
    BattleService.submitAnswer(
      battleId,
      user.id,
      localCurrentQIndex,
      selectedOpt,
      isCorrect,
      scoreDelta,
      0
    ).catch(err => console.warn("Submit answer error:", err));

    // Move to next question independently after 850ms
    setTimeout(() => {
      localCurrentQIndex++;
      isAnswerLocked = false;

      const questions = currentRoomCache?.questions || [];
      if (localCurrentQIndex < questions.length) {
        renderCurrentQuestion();
      } else {
        // Player finished all questions
        SyllabusTracker.recordQuestionAttempts(user.id, questions, localAnswers);
        renderWaitingScreen(currentRoomCache);
      }
    }, 850);
  }

  // Subscribe to room updates
  battleUnsub = BattleService.subscribeToRoom(battleId, (room) => {
    if (!room) return router.navigate('#dashboard');
    currentRoomCache = room;

    // If battle finished, redirect to results
    if (room.status === 'finished') {
      if (battleUnsub) { battleUnsub(); battleUnsub = null; }
      if (startCountdownTimer) { clearInterval(startCountdownTimer); startCountdownTimer = null; }
      router.navigate(`#results/${battleId}`);
      return;
    }

    // Check if all players in room are finished
    const playerList = Object.values(room.players || {});
    if (playerList.length > 0 && playerList.every(p => p.finished)) {
      if (battleUnsub) { battleUnsub(); battleUnsub = null; }
      if (startCountdownTimer) { clearInterval(startCountdownTimer); startCountdownTimer = null; }
      router.navigate(`#results/${battleId}`);
      return;
    }

    // If still in countdown 'starting' state
    if (room.status === 'starting') {
      const countdownScreen = document.getElementById('starting-countdown-screen');
      if (!countdownScreen) {
        mainView.innerHTML = `
          <div id="starting-countdown-screen" class="text-center glass-card" style="max-width: 440px; margin: 80px auto; padding: 50px 30px;">
            <span class="badge badge-gold mb-2">Battle Starting</span>
            <h3 style="color: var(--text-secondary); margin-bottom: 12px;">Get Ready! Battle Starts In</h3>
            <div id="starting-countdown-num" style="font-size: 5.5rem; font-weight: 900; color: #fbbf24; animation: pulse-fire 0.8s infinite alternate; transition: transform 0.15s ease;">
              4
            </div>
            <p style="color: var(--text-muted); margin-top: 14px; font-size: 0.9rem;">
              +2.0 for Correct • -0.66 for Wrong (-1/3rd).<br>Move independently at your own pace!
            </p>
          </div>
        `;
      }

      if (!startCountdownTimer) {
        let lastSec = -1;
        const updateCountdown = () => {
          const now = Date.now();
          const targetTime = currentRoomCache?.startTime || (now + 4000);
          const diffMs = targetTime - now;
          const sec = Math.max(0, Math.ceil(diffMs / 1000));
          const numEl = document.getElementById('starting-countdown-num');

          if (sec !== lastSec) {
            lastSec = sec;
            if (numEl) {
              if (sec > 0) {
                numEl.innerText = sec;
                numEl.style.transform = 'scale(1.25)';
                setTimeout(() => { if (numEl) numEl.style.transform = 'scale(1)'; }, 150);
                sounds.tick();
              } else {
                numEl.innerText = '⚔️ GO!';
                numEl.style.color = '#34d399';
                sounds.fanfare();
              }
            }
          }

          if (diffMs <= 0) {
            if (startCountdownTimer) {
              clearInterval(startCountdownTimer);
              startCountdownTimer = null;
            }
            if (currentRoomCache) currentRoomCache.status = 'active';
            if (!hasInitializedQuestion) {
              hasInitializedQuestion = true;
              renderCurrentQuestion();
            }
          }
        };

        updateCountdown();
        startCountdownTimer = setInterval(updateCountdown, 250);
      }
      return;
    }

    // If status is active, ensure countdown timer is stopped
    if (startCountdownTimer) {
      clearInterval(startCountdownTimer);
      startCountdownTimer = null;
    }

    // Restore user's current progress from database
    const myPlayerState = room.players?.[user.id];
    if (myPlayerState) {
      if (myPlayerState.score !== undefined) {
        localScore = Number(myPlayerState.score);
      }
      if (myPlayerState.answers) {
        localAnswers = myPlayerState.answers;
      }
      if (myPlayerState.currentQuestionIndex !== undefined) {
        localCurrentQIndex = Math.max(localCurrentQIndex, myPlayerState.currentQuestionIndex);
      }
    }

    // If user has completed their questions, lock into waiting screen or redirect to results
    if (localCurrentQIndex >= (room.questions?.length || 10) || (myPlayerState && myPlayerState.finished)) {
      if (room.status === 'finished') {
        if (battleUnsub) { battleUnsub(); battleUnsub = null; }
        router.navigate(`#results/${battleId}`);
        return;
      }
      renderWaitingScreen(room);
      return;
    }

    // If question has not been initialized yet, initialize it!
    if (!hasInitializedQuestion) {
      hasInitializedQuestion = true;
      renderCurrentQuestion();
    } else {
      // Just update opponents bar without rebuilding question card or resetting listeners!
      updateOpponentsBar(room);
    }
  });
}

// ==========================================
// 7. View: Battle Results & Question Review
// ==========================================
async function renderResultsView(params) {
  const battleId = params.id;
  const user = Auth.getCurrentUser();
  if (!user) return router.navigate('#auth');

  const room = await BattleService.getRoom(battleId);
  if (!room) return router.navigate('#dashboard');

  launchConfetti();
  sounds.fanfare();

  const players = Object.values(room.players || {}).sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  const myPlayer = room.players ? room.players[user.id] : null;
  const myRank = Math.max(1, players.findIndex(p => p.id === user.id) + 1);
  const isWinner = myRank === 1;

  // Record stats to LocalDB
  if (room.questions && myPlayer) {
    SyllabusTracker.recordQuestionAttempts(user.id, room.questions, myPlayer?.answers || {});
  }

  // Calculate detailed marks breakdown
  let qCorrectCount = 0;
  let qAttemptedCount = 0;
  let positiveMarks = 0;
  let negativePenalty = 0;

  if (myPlayer?.answers) {
    for (const k in myPlayer.answers) {
      qAttemptedCount++;
      const ans = myPlayer.answers[k];
      if (ans.isCorrect) {
        qCorrectCount++;
        positiveMarks += 2.0;
      } else {
        negativePenalty += 0.66;
      }
    }
  }

  positiveMarks = Math.round(positiveMarks * 100) / 100;
  negativePenalty = Math.round(negativePenalty * 100) / 100;
  const netScore = Math.round((positiveMarks - negativePenalty) * 100) / 100;
  const wrongCount = qAttemptedCount - qCorrectCount;
  const accuracyPct = qAttemptedCount > 0 ? Math.round((qCorrectCount / qAttemptedCount) * 100) : 0;

  // Update user stats
  const stats = user.stats || {};
  stats.totalBattles = (stats.totalBattles || 0) + 1;
  if (isWinner) stats.battlesWon = (stats.battlesWon || 0) + 1;
  stats.totalPoints = Math.round(((stats.totalPoints || 0) + (myPlayer?.score !== undefined ? myPlayer.score : netScore)) * 100) / 100;
  stats.questionsAttempted = (stats.questionsAttempted || 0) + qAttemptedCount;
  stats.questionsCorrect = (stats.questionsCorrect || 0) + qCorrectCount;

  StreakSystem.saveUserUpdate(user);

  // Save full marks history log
  LocalDB.addMarksHistoryRecord(user.id, {
    mode: 'Live Battle',
    subject: room.subject,
    score: myPlayer?.score !== undefined ? myPlayer.score : netScore,
    positiveMarks,
    negativePenalty,
    correctCount: qCorrectCount,
    wrongCount,
    totalQuestions: room.questions?.length || 10,
    accuracy: accuracyPct,
    rank: myRank,
    opponents: players.map(p => ({ name: p.name, avatar: p.avatar, score: p.score }))
  });

  LocalDB.addRecentBattle(user.id, {
    battleId,
    subject: room.subject,
    date: Date.now(),
    score: myPlayer?.score !== undefined ? myPlayer.score : netScore,
    rank: myRank,
    won: isWinner,
    questionCount: room.questions?.length || 10
  });

  function formatScoreText(score) {
    const num = Number(score || 0);
    return (num >= 0 ? '+' : '') + num.toFixed(2);
  }

  mainView.innerHTML = `
    <div style="max-width: 840px; margin: 0 auto;">
      <!-- Podium Banner -->
      <div class="glass-card text-center" style="padding: 36px 20px; margin-bottom: 24px; position: relative;">
        <div style="font-size: 3.5rem; margin-bottom: 6px;">${isWinner ? '🏆' : '⚔️'}</div>
        <h2 class="gradient-${isWinner ? 'gold' : 'primary'}" style="font-size: 2rem;">
          ${isWinner ? 'Victory is Yours!' : `Rank #${myRank} Finish`}
        </h2>
        <p style="color: var(--text-secondary); margin-top: 4px;">
          ${room.subject} • ${room.questions?.length || 10} MCQs with Official UPSC Marking (+2.0 / -0.66)
        </p>

        <!-- Score Breakdown Badges -->
        <div style="display: flex; justify-content: center; gap: 14px; margin: 18px 0; flex-wrap: wrap;">
          <span class="badge badge-emerald">+${positiveMarks.toFixed(2)} Correct Marks</span>
          <span class="badge badge-crimson">-${negativePenalty.toFixed(2)} Negative Penalty</span>
          <span class="badge badge-gold">Net: ${formatScoreText(myPlayer?.score ?? netScore)} Marks (${accuracyPct}% Acc)</span>
        </div>

        <!-- Podium Display for Friends -->
        <div style="display: flex; justify-content: center; align-items: flex-end; gap: 16px; margin: 30px 0 10px 0;">
          ${players.slice(0, 3).map((p, idx) => {
            const rankOrder = idx === 0 ? '1st' : idx === 1 ? '2nd' : '3rd';
            const height = idx === 0 ? '140px' : idx === 1 ? '110px' : '85px';
            const color = idx === 0 ? '#fbbf24' : idx === 1 ? '#94a3b8' : '#cd7f32';

            return `
              <div style="display: flex; flex-direction: column; align-items: center; width: 110px;">
                <div style="font-size: 2rem; margin-bottom: 4px;">${p.avatar}</div>
                <div style="font-weight: 700; font-size: 0.95rem;">${p.name}</div>
                <div style="font-size: 0.85rem; color: ${color}; font-weight: 800; margin-bottom: 8px;">${formatScoreText(p.score)} marks</div>
                <div style="width: 100%; height: ${height}; background: linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 100%); border: 1px solid ${color}; border-radius: var(--radius-md) var(--radius-md) 0 0; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.2rem; color: ${color};">
                  ${rankOrder}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Full Battle Standings Table -->
        <div style="margin-top: 30px; text-align: left;">
          <h4 style="font-size: 1rem; color: var(--text-secondary); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <span>🎖️</span> Full Battle Standings & Scores
          </h4>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${players.map((p, idx) => {
              const isMe = p.id === user.id;
              const pScore = Number(p.score || 0);
              const pAnswers = p.answers || {};
              const pCorrect = Object.values(pAnswers).filter(a => a.isCorrect).length;
              const pTotal = Object.keys(pAnswers).length;
              const pAcc = pTotal > 0 ? Math.round((pCorrect / pTotal) * 100) : 0;

              return `
                <div class="glass-panel" style="padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; border-left: 4px solid ${idx === 0 ? '#fbbf24' : idx === 1 ? '#94a3b8' : idx === 2 ? '#cd7f32' : 'var(--border-subtle)'}; background: ${isMe ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.03)'};">
                  <div style="display: flex; align-items: center; gap: 14px;">
                    <div style="font-weight: 900; font-size: 1.2rem; color: ${idx === 0 ? '#fbbf24' : idx === 1 ? '#94a3b8' : idx === 2 ? '#cd7f32' : 'var(--text-muted)'}; width: 28px;">
                      #${idx + 1}
                    </div>
                    <div style="font-size: 1.8rem;">${p.avatar || '🎯'}</div>
                    <div>
                      <div style="font-weight: 800; font-size: 1.05rem;">
                        ${p.name} ${isMe ? '<span class="badge badge-primary" style="font-size: 0.7rem; margin-left: 4px;">You</span>' : ''}
                      </div>
                      <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; gap: 10px; margin-top: 2px;">
                        <span>✅ ${pCorrect}/${room.questions?.length || 10} Correct</span>
                        <span>🎯 ${pAcc}% Acc</span>
                        <span>${p.finished ? '🏁 Finished' : '⏳ In Progress'}</span>
                      </div>
                    </div>
                  </div>

                  <div class="text-right">
                    <div style="font-size: 1.4rem; font-weight: 900; color: ${pScore >= 0 ? '#34d399' : '#f87171'};">
                      ${formatScoreText(pScore)}
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700;">FINAL MARKS</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="display: flex; gap: 12px; justify-content: center; margin-top: 28px; flex-wrap: wrap;">
          <a href="#create-battle" class="btn btn-primary btn-lg">⚔️ Play Rematch</a>
          <a href="#profile" class="btn btn-gold btn-lg">📊 View Marks History</a>
          <a href="#dashboard" class="btn btn-glass btn-lg">🏠 Arena Dashboard</a>
        </div>
      </div>

      <!-- Question-by-Question Review with Explanations -->
      <div class="glass-card" style="padding: 28px;">
        <h3 style="font-size: 1.3rem; margin-bottom: 18px; display: flex; align-items: center; gap: 8px;">
          <span>📖</span> Question Review & Explanations
        </h3>

        <div style="display: flex; flex-direction: column; gap: 18px;">
          ${room.questions.map((q, qIdx) => {
            const myAns = myPlayer?.answers?.[qIdx];
            const isCorrect = myAns?.isCorrect;
            const selectedOpt = myAns?.selectedOption;

            return `
              <div class="glass-panel" style="padding: 20px; border-left: 4px solid ${isCorrect ? '#10b981' : '#ef4444'};">
                <div class="flex-between mb-2">
                  <span class="badge ${isCorrect ? 'badge-emerald' : 'badge-crimson'}">
                    Q${qIdx + 1}: ${isCorrect ? '+2.00 Marks' : '-0.66 Penalty'}
                  </span>
                  <span style="font-size: 0.8rem; color: var(--text-muted);">${q.microtheme} (${q.year || ''})</span>
                </div>

                <div style="font-weight: 600; font-size: 1rem; line-height: 1.5; margin-bottom: 14px; white-space: pre-wrap;">
${q.question}
                </div>

                <div class="grid-2 gap-2" style="font-size: 0.88rem; margin-bottom: 12px;">
                  <div style="padding: 8px 12px; border-radius: 6px; background: ${q.correct_answer === 'A' ? 'rgba(16,185,129,0.2)' : selectedOpt === 'A' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${q.correct_answer === 'A' ? '#10b981' : selectedOpt === 'A' ? '#ef4444' : 'transparent'};">
                    <strong>(A)</strong> ${q.option_a}
                  </div>
                  <div style="padding: 8px 12px; border-radius: 6px; background: ${q.correct_answer === 'B' ? 'rgba(16,185,129,0.2)' : selectedOpt === 'B' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${q.correct_answer === 'B' ? '#10b981' : selectedOpt === 'B' ? '#ef4444' : 'transparent'};">
                    <strong>(B)</strong> ${q.option_b}
                  </div>
                  <div style="padding: 8px 12px; border-radius: 6px; background: ${q.correct_answer === 'C' ? 'rgba(16,185,129,0.2)' : selectedOpt === 'C' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${q.correct_answer === 'C' ? '#10b981' : selectedOpt === 'C' ? '#ef4444' : 'transparent'};">
                    <strong>(C)</strong> ${q.option_c}
                  </div>
                  <div style="padding: 8px 12px; border-radius: 6px; background: ${q.correct_answer === 'D' ? 'rgba(16,185,129,0.2)' : selectedOpt === 'D' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${q.correct_answer === 'D' ? '#10b981' : selectedOpt === 'D' ? '#ef4444' : 'transparent'};">
                    <strong>(D)</strong> ${q.option_d}
                  </div>
                </div>

                ${q.explanation ? `
                  <div style="background: rgba(0,0,0,0.3); border-radius: var(--radius-sm); padding: 12px 14px; font-size: 0.85rem; color: #cbd5e1; border-left: 2px solid var(--primary);">
                    <strong style="color: var(--primary);">💡 Explanation:</strong> ${q.explanation}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

let dailyUnsub = null;

// ==========================================
// 8. View: Daily Challenge (10 Questions at Midnight IST)
// ==========================================
async function renderDailyView() {
  const user = Auth.getCurrentUser();
  if (!user) return router.navigate('#auth');

  if (dailyUnsub) {
    dailyUnsub();
    dailyUnsub = null;
  }

  const todayStr = getISTDateString();
  const dailyState = await DailyChallenge.getDailyStateAsync(todayStr);
  const mySubmissionCheck = DailyChallenge.hasUserCompletedToday(user.id, todayStr);
  const mySubmission = dailyState.submissions?.[user.id] || mySubmissionCheck.submission;
  const questions = await DailyChallenge.getDailyQuestions();

  if (!mySubmission) {
    // Has not attempted today's daily challenge yet
    const secondsLeft = getSecondsUntilMidnightIST();
    const hours = Math.floor(secondsLeft / 3600);
    const minutes = Math.floor((secondsLeft % 3600) / 60);

    mainView.innerHTML = `
      <div style="max-width: 680px; margin: 0 auto;">
        <div class="glass-card" style="padding: 36px 28px; text-align: center;">
          <div style="font-size: 3.5rem; margin-bottom: 8px;">🔥</div>
          <span class="badge badge-gold mb-2">Daily 10 Challenge • ${todayStr}</span>
          <h2 class="gradient-gold" style="font-size: 1.8rem; margin-bottom: 8px;">Today's UPSC Prelims Drill</h2>
          <p style="color: var(--text-secondary); font-size: 0.95rem; max-width: 500px; margin: 0 auto 24px auto;">
            10 curated MCQs refreshed every midnight IST. Scores update live on today's leaderboard as friends complete!
          </p>

          <div class="glass-panel" style="padding: 16px; margin-bottom: 24px; display: inline-flex; gap: 24px;">
            <div>
              <div style="font-size: 1.4rem; font-weight: 800; color: #fbbf24;">${hours}h ${minutes}m</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Reset at Midnight IST</div>
            </div>
            <div style="border-left: 1px solid var(--border-subtle); padding-left: 24px;">
              <div style="font-size: 1.4rem; font-weight: 800; color: #34d399;">10 MCQs</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">+2.0 / -0.66 Marking</div>
            </div>
          </div>

          <div>
            <button id="btn-start-daily" class="btn btn-gold btn-lg" style="font-size: 1.1rem; padding: 16px 36px;">
              Start Today's 10 MCQs ⚔️
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-start-daily')?.addEventListener('click', () => {
      sounds.fanfare();
      startDailyQuizFlow(questions, user);
    });
  } else {
    // User already completed today's quiz: Render Real-time Daily Leaderboard & Explanations!
    renderDailyLeaderboardView(todayStr, questions, user);
  }
}

function renderDailyLeaderboardView(todayStr, questions, user) {
  function buildLeaderboardHTML(state) {
    const registeredUsers = LocalDB.getRegisteredUsers();
    const registeredUserIds = new Set(registeredUsers.map(u => u.id));
    const submissions = state?.submissions || {};

    // Only include submissions from non-deleted registered users
    const validSubmissions = Object.values(submissions).filter(s => registeredUserIds.has(s.userId));

    const sortedCompleted = validSubmissions.sort((a, b) => {
      const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (a.completedAt || 0) - (b.completedAt || 0);
    });

    const completedUserIds = new Set(sortedCompleted.map(s => s.userId));
    const pendingUsers = registeredUsers.filter(u => !completedUserIds.has(u.id));

    const mySub = submissions[user.id] || DailyChallenge.hasUserCompletedToday(user.id, todayStr).submission;
    const myRank = sortedCompleted.findIndex(s => s.userId === user.id) + 1;

    return `
      <div style="max-width: 860px; margin: 0 auto;">
        <!-- Top Status Card -->
        <div class="glass-card" style="padding: 28px 24px; margin-bottom: 24px; position: relative; overflow: hidden;">
          <div style="position: absolute; right: -15px; top: -15px; font-size: 7rem; opacity: 0.05; pointer-events: none;">🏆</div>
          <div class="flex-between" style="flex-wrap: wrap; gap: 16px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <span class="badge badge-emerald">✅ Completed Today</span>
                <span class="badge badge-gold">${todayStr}</span>
              </div>
              <h2 style="font-size: 1.7rem; margin-bottom: 4px;">Today's Daily 10 Leaderboard</h2>
              <p style="color: var(--text-secondary); font-size: 0.9rem;">
                Scores update live in real-time as friends complete their daily drill.
              </p>
            </div>

            <div style="display: flex; gap: 12px; align-items: center;">
              <a href="#dashboard" class="btn btn-glass">
                <span>🏛️</span> Arena
              </a>
              <a href="#leaderboard" class="btn btn-primary">
                <span>🏆</span> Overall Leaderboard
              </a>
            </div>
          </div>

          <!-- My Performance Banner -->
          ${mySub ? `
            <div class="glass-panel" style="margin-top: 20px; padding: 16px 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; align-items: center;">
              <div>
                <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Your Rank</div>
                <div style="font-size: 1.6rem; font-weight: 800; color: #fbbf24;">
                  ${myRank === 1 ? '🥇 1st Place' : (myRank === 2 ? '🥈 2nd Place' : (myRank === 3 ? '🥉 3rd Place' : (myRank > 0 ? `#${myRank}` : 'Completed')))}
                </div>
              </div>
              <div>
                <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Your Net Marks</div>
                <div style="font-size: 1.6rem; font-weight: 800; color: ${Number(mySub.score || 0) >= 0 ? '#34d399' : '#f87171'};">
                  ${formatMarks(mySub.score)}
                </div>
              </div>
              <div>
                <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Correct / Attempted</div>
                <div style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary);">
                  ${mySub.correctCount !== undefined ? `${mySub.correctCount} / 10` : '10 / 10'}
                </div>
              </div>
              <div>
                <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Net Accuracy</div>
                <div style="font-size: 1.4rem; font-weight: 700; color: #f472b6;">
                  ${mySub.accuracy !== undefined ? `${mySub.accuracy}%` : '-'}
                </div>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Live Standings Table -->
        <div class="glass-card" style="padding: 24px; margin-bottom: 28px;">
          <div class="flex-between mb-4">
            <h3 style="font-size: 1.15rem; display: flex; align-items: center; gap: 8px;">
              <span>⚡</span> Live Standings (${sortedCompleted.length} / ${registeredUsers.length} Finished)
            </h3>
            <span style="font-size: 0.8rem; color: #34d399; display: flex; align-items: center; gap: 4px;">
              <span style="display: inline-block; width: 8px; height: 8px; background: #34d399; border-radius: 50%; animation: pulse-fire 1s infinite alternate;"></span> Live Real-Time
            </span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${sortedCompleted.map((sub, idx) => {
              const rank = idx + 1;
              const isMe = sub.userId === user.id;
              const rankBadge = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : `#${rank}`));
              const marksNum = Number(sub.score || 0);

              return `
                <div class="glass-panel" style="padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; border-left: 4px solid ${isMe ? 'var(--primary)' : (rank === 1 ? '#fbbf24' : 'transparent')}; background: ${isMe ? 'rgba(99, 102, 241, 0.12)' : ''};">
                  <div style="display: flex; align-items: center; gap: 14px;">
                    <div style="font-size: 1.25rem; font-weight: 800; min-width: 32px; text-align: center;">${rankBadge}</div>
                    <div style="font-size: 1.6rem;">${sub.avatar || '🎯'}</div>
                    <div>
                      <div style="font-weight: 700; display: flex; align-items: center; gap: 6px;">
                        ${sub.name} ${isMe ? '<span class="badge badge-primary" style="font-size: 0.68rem; padding: 2px 6px;">YOU</span>' : ''}
                      </div>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">
                        ${sub.completedAt ? new Date(sub.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Completed'}
                        ${sub.accuracy ? ` • ${sub.accuracy}% Accuracy` : ''}
                      </div>
                    </div>
                  </div>

                  <div style="text-align: right;">
                    <div style="font-size: 1.25rem; font-weight: 800; color: ${marksNum >= 0 ? '#34d399' : '#f87171'};">
                      ${formatMarks(marksNum)}
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">
                      ${sub.correctCount !== undefined ? `${sub.correctCount} Correct • ${sub.wrongCount || 0} Wrong` : '+2.0 / -0.66'}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}

            ${pendingUsers.map(u => `
              <div class="glass-panel" style="padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; opacity: 0.65;">
                <div style="display: flex; align-items: center; gap: 14px;">
                  <div style="font-size: 1.1rem; min-width: 32px; text-align: center; color: var(--text-muted);">-</div>
                  <div style="font-size: 1.4rem;">${u.avatar || '🎯'}</div>
                  <div>
                    <div style="font-weight: 600;">${u.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Yet to attempt today</div>
                  </div>
                </div>
                <div>
                  <span class="badge badge-gold" style="font-size: 0.75rem;">⏳ Pending</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Question Solutions & Explanations Review -->
        ${questions && questions.length > 0 ? `
          <div class="glass-card" style="padding: 24px;">
            <h3 style="font-size: 1.15rem; margin-bottom: 18px; display: flex; align-items: center; gap: 8px;">
              <span>📖</span> Today's Questions & Solutions Review (10 MCQs)
            </h3>

            <div style="display: flex; flex-direction: column; gap: 20px;">
              ${questions.map((q, idx) => {
                const myAns = mySub?.answers?.[idx];
                const selectedOpt = myAns?.selectedOption;
                const isCorrect = myAns?.isCorrect;

                return `
                  <div class="glass-panel" style="padding: 18px; border-left: 4px solid ${isCorrect ? '#34d399' : (selectedOpt ? '#f87171' : 'var(--border-subtle)')};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 6px;">
                      <div style="display: flex; gap: 6px; align-items: center;">
                        <span class="badge badge-primary">Q${idx + 1}</span>
                        <span class="badge badge-emerald">${q.subject || 'Polity'}</span>
                        <span class="badge badge-gold">${q.microtheme || 'Microtheme'}</span>
                      </div>
                      <div>
                        ${selectedOpt ? (isCorrect ? '<span class="badge badge-emerald">✅ +2.00 Correct</span>' : '<span class="badge badge-ruby" style="background: rgba(239,68,68,0.2); color: #fca5a5; border: 1px solid rgba(239,68,68,0.4);">❌ -0.66 Wrong</span>') : '<span class="badge badge-gold">Not answered</span>'}
                      </div>
                    </div>

                    <div style="margin-bottom: 14px;">
                      ${formatQuestionHTML(q.question)}
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; margin-bottom: 14px;">
                      ${['A', 'B', 'C', 'D'].map(opt => {
                        const optText = q[`option_${opt.toLowerCase()}`];
                        if (!optText) return '';
                        const isThisCorrect = opt === q.correct_answer;
                        const isThisSelected = opt === selectedOpt;
                        let bg = 'rgba(255,255,255,0.03)';
                        let border = 'var(--border-subtle)';
                        let color = 'inherit';

                        if (isThisCorrect) {
                          bg = 'rgba(16, 185, 129, 0.15)';
                          border = 'rgba(16, 185, 129, 0.4)';
                          color = '#34d399';
                        } else if (isThisSelected && !isThisCorrect) {
                          bg = 'rgba(239, 68, 68, 0.15)';
                          border = 'rgba(239, 68, 68, 0.4)';
                          color = '#fca5a5';
                        }

                        return `
                          <div style="padding: 8px 12px; border-radius: 8px; background: ${bg}; border: 1px solid ${border}; font-size: 0.85rem; display: flex; align-items: center; gap: 8px;">
                            <strong style="color: ${color}; min-width: 18px;">${opt}.</strong>
                            <span style="color: ${color};">${optText}</span>
                            ${isThisCorrect ? '<span style="margin-left: auto; font-size: 0.75rem;">⭐ Correct</span>' : (isThisSelected ? '<span style="margin-left: auto; font-size: 0.75rem;">Selected</span>' : '')}
                          </div>
                        `;
                      }).join('')}
                    </div>

                    ${q.explanation ? `
                      <div style="background: rgba(99, 102, 241, 0.08); border-left: 3px solid var(--primary); padding: 10px 14px; border-radius: 6px; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5;">
                        <strong style="color: #a5b4fc;">💡 Solution & Explanation:</strong><br>
                        ${q.explanation}
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  const currentState = DailyChallenge.getDailyState(todayStr);
  mainView.innerHTML = buildLeaderboardHTML(currentState);

  // Subscribe to live daily room updates
  dailyUnsub = DailyChallenge.subscribeDaily(todayStr, (updatedState) => {
    if (updatedState) {
      mainView.innerHTML = buildLeaderboardHTML(updatedState);
    }
  });
}

function startDailyQuizFlow(questions, user) {
  let qIdx = 0;
  let score = 0;
  const answers = {};

  function formatScoreText(s) {
    const num = Number(s || 0);
    return (num >= 0 ? '+' : '') + num.toFixed(2);
  }

  function renderQ() {
    if (qIdx >= questions.length) {
      // Completed daily quiz
      let qCorrectCount = 0;
      let qAttemptedCount = 0;
      let positiveMarks = 0;
      let negativePenalty = 0;

      for (const k in answers) {
        qAttemptedCount++;
        const ans = answers[k];
        if (ans.isCorrect) {
          qCorrectCount++;
          positiveMarks += 2.0;
        } else {
          negativePenalty += 0.66;
        }
      }

      positiveMarks = Math.round(positiveMarks * 100) / 100;
      negativePenalty = Math.round(negativePenalty * 100) / 100;
      const netScore = Math.round((positiveMarks - negativePenalty) * 100) / 100;
      const wrongCount = qAttemptedCount - qCorrectCount;
      const accuracyPct = qAttemptedCount > 0 ? Math.round((qCorrectCount / qAttemptedCount) * 100) : 0;

      // Update user stats
      const stats = user.stats || {};
      stats.totalPoints = Math.round(((stats.totalPoints || 0) + netScore) * 100) / 100;
      stats.questionsAttempted = (stats.questionsAttempted || 0) + qAttemptedCount;
      stats.questionsCorrect = (stats.questionsCorrect || 0) + qCorrectCount;
      user.stats = stats;

      DailyChallenge.submitDaily(user, answers, netScore, {
        correctCount: qCorrectCount,
        wrongCount,
        accuracy: accuracyPct,
        positiveMarks,
        negativePenalty
      });
      SyllabusTracker.recordQuestionAttempts(user.id, questions, answers);
      StreakSystem.updateDailyStreak(user);

      // Save to Marks History
      LocalDB.addMarksHistoryRecord(user.id, {
        mode: 'Daily 10',
        subject: 'Daily Prelims Drill',
        score: netScore,
        positiveMarks,
        negativePenalty,
        correctCount: qCorrectCount,
        wrongCount,
        totalQuestions: questions.length,
        accuracy: accuracyPct,
        rank: 1,
        opponents: []
      });

      LocalDB.addRecentBattle(user.id, {
        battleId: 'daily_' + Date.now(),
        subject: 'Daily 10 Challenge',
        date: Date.now(),
        score: netScore,
        rank: 1,
        won: true,
        questionCount: questions.length
      });

      StreakSystem.saveUserUpdate(user);
      sounds.fanfare();
      renderDailyView();
      return;
    }

    const q = questions[qIdx];
    mainView.innerHTML = `
      <div style="max-width: 760px; margin: 0 auto;">
        <div class="glass-card" style="padding: 16px 24px; margin-bottom: 18px;">
          <div class="flex-between">
            <span class="badge badge-gold">Daily MCQ ${qIdx + 1} of ${questions.length}</span>
            <span style="font-weight: 700; color: ${score >= 0 ? '#34d399' : '#f87171'};">Score: ${formatScoreText(score)} marks</span>
          </div>
        </div>

        <div class="glass-card" style="padding: 30px;">
          <div style="display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap;">
            <span class="badge badge-emerald">${q.subject}</span>
            <span class="badge badge-primary">${q.microtheme}</span>
            <span class="badge badge-gold" style="font-size: 0.75rem;">+2.0 / -0.66</span>
          </div>

          <div style="margin-bottom: 24px;">
            ${formatQuestionHTML(q.question)}
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${['A', 'B', 'C', 'D'].map(opt => {
              const optText = q[`option_${opt.toLowerCase()}`];
              if (!optText) return '';
              return `
                <div class="option-card" data-opt="${opt}" id="daily-opt-${opt}">
                  <div class="option-letter">${opt}</div>
                  <div class="option-text">${optText}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    document.querySelectorAll('.option-card').forEach(card => {
      card.addEventListener('click', () => {
        const selected = card.getAttribute('data-opt');
        const isCorrect = selected === q.correct_answer;
        const pts = isCorrect ? 2.0 : -0.66;

        if (isCorrect) {
          sounds.correct();
          card.classList.add('correct');
          showToast('+2.0 Marks!', 'success', 1000);
        } else {
          sounds.wrong();
          card.classList.add('wrong');
          document.getElementById(`daily-opt-${q.correct_answer}`)?.classList.add('correct');
          showToast(`-0.66 Marks! Correct was (${q.correct_answer})`, 'error', 1200);
        }

        score = Math.round((score + pts) * 100) / 100;
        answers[qIdx] = { selectedOption: selected, isCorrect, pointsEarned: pts };

        setTimeout(() => {
          qIdx++;
          renderQ();
        }, 850);
      });
    });
  }

  renderQ();
}

// ==========================================
// 9. View: Syllabus Tracker & Comparative Friend Matrix
// ==========================================
async function renderSyllabusView() {
  const user = Auth.getCurrentUser();
  if (!user) return router.navigate('#auth');

  const myProgress = await SyllabusTracker.getSubjectProgress(user.id);
  const friendsProgress = await SyllabusTracker.getFriendsComparison();
  const otherFriends = friendsProgress.filter(f => f.user.id !== user.id);

  let selectedCompareFriendId = 'none';

  function renderSyllabusContent() {
    const friendData = otherFriends.find(f => f.user.id === selectedCompareFriendId);

    mainView.innerHTML = `
      <div style="max-width: 960px; margin: 0 auto;">
        <!-- Overall Header -->
        <div class="glass-card" style="padding: 28px; margin-bottom: 24px;">
          <div class="flex-between" style="flex-wrap: wrap; gap: 16px;">
            <div>
              <span class="badge badge-primary mb-2">Master Syllabus Coverage</span>
              <h2 style="font-size: 1.8rem;">11 Subjects • 186 Microthemes</h2>
              <p style="color: var(--text-secondary); font-size: 0.95rem;">
                Track which portions of the UPSC syllabus you & your friends have conquered.
              </p>
            </div>

            <div class="text-right">
              <div style="font-size: 2.2rem; font-weight: 900; color: #34d399;">${myProgress.overallPct}%</div>
              <div style="font-size: 0.85rem; color: var(--text-secondary);">Your Completion (${myProgress.attemptedQuestions}/${myProgress.totalQuestions} Qs)</div>
            </div>
          </div>
        </div>

        <!-- Friend Comparison Filter Selector -->
        <div class="glass-card" style="padding: 20px 24px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
          <div>
            <div style="font-weight: 700; font-size: 0.95rem;">🔍 Friend Comparison Filter</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Select a friend to compare coverage side-by-side</div>
          </div>

          <div style="min-width: 260px;">
            <select id="syllabus-friend-compare-select" class="form-select" style="font-size: 0.9rem;">
              <option value="none" ${selectedCompareFriendId === 'none' ? 'selected' : ''}>👤 Show My Coverage Only</option>
              ${otherFriends.map(f => `
                <option value="${f.user.id}" ${selectedCompareFriendId === f.user.id ? 'selected' : ''}>
                  ⚔️ Compare with ${f.user.avatar} ${f.user.name}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- If Friend Selected: Side-by-Side Comparison Table -->
        ${friendData ? `
          <div class="glass-card" style="padding: 24px; margin-bottom: 24px;">
            <h3 style="font-size: 1.2rem; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
              <span>⚔️</span> Side-by-Side Comparison: You vs ${friendData.user.avatar} ${friendData.user.name}
            </h3>

            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                <thead>
                  <tr style="border-bottom: 1px solid var(--border-subtle); color: var(--text-muted); text-align: left;">
                    <th style="padding: 10px;">Subject</th>
                    <th style="padding: 10px; text-align: center;">🎯 You (${myProgress.overallPct}%)</th>
                    <th style="padding: 10px; text-align: center;">${friendData.user.avatar} ${friendData.user.name} (${friendData.progress.overallPct}%)</th>
                    <th style="padding: 10px; text-align: center;">Lead / Diff</th>
                  </tr>
                </thead>
                <tbody>
                  ${myProgress.subjects.map(s => {
                    const fSub = friendData.progress.subjects.find(sub => sub.name === s.name);
                    const fPct = fSub ? fSub.pct : 0;
                    const diff = s.pct - fPct;

                    return `
                      <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                        <td style="padding: 12px 10px; font-weight: 600;">${s.icon} ${s.name} <span style="color: var(--text-muted); font-size: 0.75rem;">(${s.total} Qs)</span></td>
                        <td style="padding: 12px 10px; text-align: center;">
                          <span class="badge ${s.pct >= 50 ? 'badge-emerald' : s.pct > 0 ? 'badge-gold' : 'badge-primary'}">${s.pct}% (${s.attempted}/${s.total})</span>
                        </td>
                        <td style="padding: 12px 10px; text-align: center;">
                          <span class="badge ${fPct >= 50 ? 'badge-emerald' : fPct > 0 ? 'badge-gold' : 'badge-primary'}">${fPct}% (${fSub ? fSub.attempted : 0}/${s.total})</span>
                        </td>
                        <td style="padding: 12px 10px; text-align: center; font-weight: 700; color: ${diff > 0 ? '#34d399' : diff < 0 ? '#f87171' : 'var(--text-muted)'};">
                          ${diff > 0 ? `+${diff}% Lead 🌟` : diff < 0 ? `${diff}% Behind` : 'Tied 🤝'}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <!-- Subject Drilldown with Microtheme Accordions -->
        <div style="display: flex; flex-direction: column; gap: 14px;">
          ${myProgress.subjects.map(sub => `
            <div class="glass-card" style="padding: 20px;">
              <div class="flex-between" style="cursor: pointer;" onclick="document.getElementById('mt-sub-${sub.name.replace(/[^a-zA-Z0-9]/g, '')}').classList.toggle('active');">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 1.6rem;">${sub.icon}</span>
                  <div>
                    <div style="font-weight: 700; font-size: 1.05rem;">${sub.name}</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted);">${sub.attempted} / ${sub.total} MCQs attempted • ${sub.microthemes.length} Microthemes</div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 14px;">
                  <div style="font-weight: 800; font-size: 1.1rem; color: #34d399;">${sub.pct}%</div>
                  <span style="color: var(--text-muted); font-size: 0.9rem;">▼</span>
                </div>
              </div>

              <!-- Microthemes List (collapsible) -->
              <div id="mt-sub-${sub.name.replace(/[^a-zA-Z0-9]/g, '')}" style="display: none; margin-top: 16px; border-top: 1px solid var(--border-subtle); padding-top: 14px;">
                <div class="grid-2 gap-2">
                  ${sub.microthemes.map(mt => `
                    <div class="glass-panel" style="padding: 10px 14px; display: flex; align-items: center; justify-content: space-between;">
                      <div>
                        <div style="font-weight: 600; font-size: 0.85rem;">${mt.name}</div>
                        <div style="font-size: 0.72rem; color: var(--text-muted);">${mt.attempted}/${mt.total} Qs • Yield: ${mt.yield}</div>
                      </div>
                      <span class="badge ${mt.pct === 100 ? 'badge-emerald' : mt.pct > 0 ? 'badge-gold' : 'badge-primary'}" style="font-size: 0.7rem;">${mt.pct}%</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Attach friend filter change listener
    document.getElementById('syllabus-friend-compare-select')?.addEventListener('change', (e) => {
      selectedCompareFriendId = e.target.value;
      renderSyllabusContent();
    });

    // Attach toggle behaviors
    myProgress.subjects.forEach(sub => {
      const id = `mt-sub-${sub.name.replace(/[^a-zA-Z0-9]/g, '')}`;
      const el = document.getElementById(id);
      if (el) {
        el.parentElement.firstElementChild.addEventListener('click', () => {
          el.style.display = el.style.display === 'none' ? 'block' : 'none';
        });
      }
    });
  }

  renderSyllabusContent();
}

// ==========================================
// 10. View: Leaderboard
// ==========================================
async function renderLeaderboardView() {
  const user = Auth.getCurrentUser();
  if (!user) return router.navigate('#auth');

  // Loading indicator
  mainView.innerHTML = `
    <div style="max-width: 800px; margin: 0 auto; text-align: center; padding: 60px 20px;">
      <div style="font-size: 3rem; animation: pulse-fire 1s infinite alternate;">🏆</div>
      <h3 style="color: var(--text-secondary); margin-top: 14px;">Loading Live Battle Arena Ranks...</h3>
    </div>
  `;

  const ranked = await Leaderboard.getRankings();

  function renderLeaderboardTable(players) {
    mainView.innerHTML = `
      <div style="max-width: 800px; margin: 0 auto;">
        <div class="glass-card" style="padding: 28px; margin-bottom: 24px; text-align: center;">
          <span class="badge badge-gold mb-2">Hall of Fame</span>
          <h2 class="gradient-gold" style="font-size: 2rem;">Battle Arena Ranks</h2>
          <p style="color: var(--text-secondary); font-size: 0.95rem;">
            Real-time standings across all players ranked by Total Battle Points, Win Rate, and Overall Accuracy
          </p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${players.map((p, idx) => {
            const isTop1 = idx === 0;
            const isMe = p.id === user.id;

            return `
              <div class="glass-card" style="padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; border: ${isTop1 ? '1.5px solid #fbbf24' : isMe ? '1.5px solid var(--primary)' : '1px solid var(--border-subtle)'}; background: ${isMe ? 'rgba(99, 102, 241, 0.12)' : 'var(--glass-bg)'};">
                <div style="display: flex; align-items: center; gap: 16px;">
                  <div style="font-size: 1.5rem; font-weight: 900; width: 36px; color: ${isTop1 ? '#fbbf24' : idx === 1 ? '#94a3b8' : idx === 2 ? '#cd7f32' : 'var(--text-muted)'};">
                    #${idx + 1}
                  </div>
                  <div style="font-size: 2rem;">${p.avatar}</div>
                  <div>
                    <div style="font-weight: 800; font-size: 1.1rem;">
                      ${p.name} ${isMe ? '<span style="color: var(--primary); font-size: 0.8rem;">(You)</span>' : ''}
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; gap: 10px; margin-top: 2px;">
                      <span>🏆 ${p.battlesWon}/${p.totalBattles} Wins (${p.winRate}%)</span>
                      <span>🎯 ${p.accuracy}% Acc</span>
                      <span>🔥 ${p.streak}d Streak</span>
                    </div>
                  </div>
                </div>

                <div class="text-right">
                  <div style="font-size: 1.5rem; font-weight: 900; color: ${p.totalPoints >= 0 ? '#818cf8' : '#f87171'};">
                    ${p.totalPoints >= 0 ? '+' : ''}${p.totalPoints.toFixed(2)}
                  </div>
                  <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">POINTS</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  renderLeaderboardTable(ranked);

  // Live cloud listener
  UserService.subscribeToUsers(async () => {
    const updated = await Leaderboard.getRankings();
    renderLeaderboardTable(updated);
  });
}

// ==========================================
// 11. View: Player Profile & Badges
// ==========================================
function renderProfileView() {
  const user = Auth.getCurrentUser();
  if (!user) return router.navigate('#auth');

  const stats = user.stats || {};
  const badges = StreakSystem.getUserBadges(user);
  const marksHistory = LocalDB.getUserMarksHistory(user.id);
  const mistakes = LocalDB.getUserMistakes(user.id);

  // Compute aggregate marks stats
  const totalPositive = marksHistory.reduce((acc, r) => acc + (r.positiveMarks || 0), 0);
  const totalPenalty = marksHistory.reduce((acc, r) => acc + (r.negativePenalty || 0), 0);

  mainView.innerHTML = `
    <div style="max-width: 900px; margin: 0 auto;">
      <!-- Profile Header -->
      <div class="glass-card" style="padding: 30px; margin-bottom: 24px;">
        <div class="flex-between" style="flex-wrap: wrap; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 18px;">
            <div style="font-size: 3.5rem;">${user.avatar}</div>
            <div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <h2 style="font-size: 1.8rem;">${user.name}</h2>
                <span class="badge badge-gold">${stats.dailyStreak || 1}d Streak 🔥</span>
              </div>
              <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 2px;">
                Member since ${new Date(user.createdAt || Date.now()).toLocaleDateString()} • UPSC Aspirant
              </p>
            </div>
          </div>

          <div style="display: flex; gap: 10px;">
            <button id="btn-logout" class="btn btn-glass" style="color: #ef4444; border-color: rgba(239,68,68,0.3);">
              Sign Out
            </button>
          </div>
        </div>

        <!-- 4 Quick Lifetime Stats -->
        <div class="grid-4 mt-6">
          <div class="glass-panel" style="padding: 14px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">NET MARKS</div>
            <div style="font-size: 1.6rem; font-weight: 900; color: #818cf8; margin-top: 2px;">${Number(stats.totalPoints || 0).toFixed(2)}</div>
          </div>
          <div class="glass-panel" style="padding: 14px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">GROSS MARKS (+2.0)</div>
            <div style="font-size: 1.6rem; font-weight: 900; color: #34d399; margin-top: 2px;">+${Number(totalPositive || 0).toFixed(2)}</div>
          </div>
          <div class="glass-panel" style="padding: 14px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">PENALTY (-0.66)</div>
            <div style="font-size: 1.6rem; font-weight: 900; color: #f87171; margin-top: 2px;">-${Number(totalPenalty || 0).toFixed(2)}</div>
          </div>
          <div class="glass-panel" style="padding: 14px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">WIN RATE</div>
            <div style="font-size: 1.6rem; font-weight: 900; color: #fbbf24; margin-top: 2px;">
              ${stats.totalBattles > 0 ? Math.round(((stats.battlesWon || 0) / stats.totalBattles) * 100) : 0}%
            </div>
          </div>
        </div>
      </div>

      <!-- Profile Tabs: Marks History | Mistakes Notebook | Badges -->
      <div style="display: flex; gap: 8px; margin-bottom: 20px; background: rgba(0,0,0,0.25); padding: 4px; border-radius: var(--radius-md);">
        <button id="tab-btn-history" class="btn btn-primary w-full" style="padding: 10px;">📊 Marks & Scorecard History (${marksHistory.length})</button>
        <button id="tab-btn-mistakes" class="btn btn-glass w-full" style="padding: 10px;">📕 Mistakes Notebook (${mistakes.length})</button>
        <button id="tab-btn-badges" class="btn btn-glass w-full" style="padding: 10px;">🎖️ Badges & Streaks</button>
      </div>

      <!-- Tab 1: Marks & Scorecard History -->
      <div id="tab-pane-history">
        <div class="glass-card" style="padding: 24px;">
          <h3 style="font-size: 1.2rem; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
            <span>📈</span> Detailed Battle & Quiz Scorecards
          </h3>

          ${marksHistory.length === 0 ? `
            <div class="text-center" style="padding: 40px 20px; color: var(--text-muted);">
              <div style="font-size: 2.5rem; margin-bottom: 8px;">📊</div>
              <p>No scorecards logged yet. Play a live battle or daily challenge to record marks!</p>
              <a href="#create-battle" class="btn btn-primary btn-sm mt-4">Start Battle</a>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${marksHistory.map(r => `
                <div class="glass-panel" style="padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; border-left: 4px solid ${r.rank === 1 ? '#fbbf24' : '#6366f1'};">
                  <div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                      <span class="badge ${r.mode === 'Daily 10' ? 'badge-gold' : 'badge-primary'}">${r.mode || 'Live Battle'}</span>
                      <strong style="font-size: 1.05rem;">${r.subject}</strong>
                      <span class="badge ${r.rank === 1 ? 'badge-emerald' : 'badge-gold'}">Rank #${r.rank || 1}</span>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                      ${new Date(r.timestamp).toLocaleString()} • ${r.totalQuestions} Questions • <strong>${r.correctCount || 0} Correct</strong>, <strong>${r.wrongCount || 0} Wrong</strong> (${r.accuracy || 0}% Acc)
                    </div>
                  </div>

                  <div class="text-right">
                    <div style="font-size: 1.4rem; font-weight: 900; color: #818cf8;">${Number(r.score || 0).toFixed(2)} marks</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">
                      <span style="color: #34d399;">+${Number(r.positiveMarks || 0).toFixed(2)}</span> | <span style="color: #f87171;">-${Number(r.negativePenalty || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>

          `}
        </div>
      </div>

      <!-- Tab 2: Mistakes Notebook -->
      <div id="tab-pane-mistakes" style="display: none;">
        <div class="glass-card" style="padding: 24px;">
          <div class="flex-between mb-4" style="flex-wrap: wrap; gap: 12px;">
            <div>
              <h3 style="font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
                <span>📕</span> Mistakes Notebook (Study & Revise)
              </h3>
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 4px;">
                Every question answered incorrectly is logged here for quick revision.
              </p>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span class="badge badge-crimson">${mistakes.length} Logged</span>
            </div>
          </div>

          <!-- Practice Mistakes Action Bar -->
          ${mistakes.length > 0 ? `
            <div class="glass-panel" style="padding: 16px; margin-bottom: 20px; border-left: 4px solid var(--accent-gold); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
              <div>
                <strong style="color: #fcd34d; font-size: 0.95rem;">🎯 Practice & Master Your Mistakes:</strong>
                <div style="font-size: 0.8rem; color: var(--text-muted);">Re-attempt questions to clear them from your notebook</div>
              </div>
              <div style="display: flex; gap: 8px;">
                <select id="practice-mistakes-count-select" class="form-select" style="width: auto; padding: 8px 12px; font-size: 0.85rem;">
                  <option value="5" ${mistakes.length < 10 ? 'selected' : ''}>Practice 5</option>
                  ${mistakes.length >= 10 ? '<option value="10" selected>Practice 10</option>' : ''}
                  ${mistakes.length >= 20 ? '<option value="20">Practice 20</option>' : ''}
                  <option value="${mistakes.length}">Practice All (${mistakes.length})</option>
                </select>
                <button id="btn-launch-practice-mistakes" class="btn btn-gold btn-sm">
                  Start Drill ⚔️
                </button>
              </div>
            </div>
          ` : ''}

          ${mistakes.length === 0 ? `
            <div class="text-center" style="padding: 40px 20px; color: var(--text-muted);">
              <div style="font-size: 2.5rem; margin-bottom: 8px;">🎯</div>
              <p>No mistakes logged! You have 100% accuracy so far.</p>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 16px;">
              ${mistakes.map((m, idx) => `
                <div class="glass-panel" style="padding: 18px; border-left: 4px solid #ef4444;">
                  <div class="flex-between mb-2">
                    <span class="badge badge-primary">${m.subject} • ${m.microtheme}</span>
                    <button class="btn btn-glass btn-sm btn-remove-mistake" data-id="${m.questionId || m.id}" style="font-size: 0.72rem; padding: 4px 8px; color: var(--accent-emerald);">
                      Mark Mastered ✅
                    </button>
                  </div>

                  <div style="margin-bottom: 12px;">
                    ${formatQuestionHTML(m.question)}
                  </div>

                  <div class="grid-2 gap-2" style="font-size: 0.82rem; margin-bottom: 10px;">
                    <div style="padding: 6px 10px; border-radius: 4px; background: ${m.correctAnswer === 'A' ? 'rgba(16,185,129,0.2)' : m.selectedOption === 'A' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.02)'}; border: 1px solid ${m.correctAnswer === 'A' ? '#10b981' : m.selectedOption === 'A' ? '#ef4444' : 'transparent'};">
                      <strong>(A)</strong> ${m.option_a}
                    </div>
                    <div style="padding: 6px 10px; border-radius: 4px; background: ${m.correctAnswer === 'B' ? 'rgba(16,185,129,0.2)' : m.selectedOption === 'B' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.02)'}; border: 1px solid ${m.correctAnswer === 'B' ? '#10b981' : m.selectedOption === 'B' ? '#ef4444' : 'transparent'};">
                      <strong>(B)</strong> ${m.option_b}
                    </div>
                    <div style="padding: 6px 10px; border-radius: 4px; background: ${m.correctAnswer === 'C' ? 'rgba(16,185,129,0.2)' : m.selectedOption === 'C' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.02)'}; border: 1px solid ${m.correctAnswer === 'C' ? '#10b981' : m.selectedOption === 'C' ? '#ef4444' : 'transparent'};">
                      <strong>(C)</strong> ${m.option_c}
                    </div>
                    <div style="padding: 6px 10px; border-radius: 4px; background: ${m.correctAnswer === 'D' ? 'rgba(16,185,129,0.2)' : m.selectedOption === 'D' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.02)'}; border: 1px solid ${m.correctAnswer === 'D' ? '#10b981' : m.selectedOption === 'D' ? '#ef4444' : 'transparent'};">
                      <strong>(D)</strong> ${m.option_d}
                    </div>
                  </div>

                  <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <span class="badge badge-crimson" style="font-size: 0.7rem;">Your Answer: Option (${m.selectedOption})</span>
                    <span class="badge badge-emerald" style="font-size: 0.7rem;">Correct Answer: Option (${m.correctAnswer})</span>
                  </div>

                  ${m.explanation ? `
                    <div style="background: rgba(0,0,0,0.3); border-radius: var(--radius-sm); padding: 10px 12px; font-size: 0.82rem; color: #cbd5e1; border-left: 2px solid var(--primary);">
                      <strong style="color: var(--primary);">💡 Explanation:</strong> ${m.explanation}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>

      <!-- Tab 3: Badges Showcase -->
      <div id="tab-pane-badges" style="display: none;">
        <div class="glass-card" style="padding: 24px;">
          <h3 style="font-size: 1.2rem; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
            <span>🎖️</span> Achievement Badges
          </h3>

          <div class="grid-3 gap-2">
            ${badges.map(b => `
              <div class="glass-panel" style="padding: 14px; opacity: ${b.unlocked ? '1' : '0.4'}; filter: ${b.unlocked ? 'none' : 'grayscale(1)'};">
                <div style="font-size: 2rem; margin-bottom: 4px;">${b.icon}</div>
                <div style="font-weight: 700; font-size: 0.95rem;">${b.name}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${b.desc}</div>
                <div style="margin-top: 6px;">
                  ${b.unlocked ? '<span class="badge badge-emerald" style="font-size: 0.65rem;">Unlocked 🌟</span>' : '<span class="badge badge-primary" style="font-size: 0.65rem;">Locked 🔒</span>'}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach Launch Practice Mistakes listener
  document.getElementById('btn-launch-practice-mistakes')?.addEventListener('click', () => {
    sounds.fanfare();
    const count = parseInt(document.getElementById('practice-mistakes-count-select')?.value || '10', 10);
    renderPracticeMistakesView(count);
  });

  // Attach Remove / Mark Mastered listeners
  document.querySelectorAll('.btn-remove-mistake').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      sounds.click();
      const qId = btn.getAttribute('data-id');
      LocalDB.removeMistake(user.id, qId);
      showToast("Marked as Mastered! Cleared from notebook ✅", "success");
      renderProfileView();
      // Keep mistakes tab active
      setTimeout(() => {
        document.getElementById('tab-btn-mistakes')?.click();
      }, 50);
    });
  });

  // Tab switching logic
  const tabBtnHistory = document.getElementById('tab-btn-history');
  const tabBtnMistakes = document.getElementById('tab-btn-mistakes');
  const tabBtnBadges = document.getElementById('tab-btn-badges');
  const paneHistory = document.getElementById('tab-pane-history');
  const paneMistakes = document.getElementById('tab-pane-mistakes');
  const paneBadges = document.getElementById('tab-pane-badges');

  tabBtnHistory?.addEventListener('click', () => {
    sounds.click();
    tabBtnHistory.className = 'btn btn-primary w-full';
    tabBtnMistakes.className = 'btn btn-glass w-full';
    tabBtnBadges.className = 'btn btn-glass w-full';
    paneHistory.style.display = 'block';
    paneMistakes.style.display = 'none';
    paneBadges.style.display = 'none';
  });

  tabBtnMistakes?.addEventListener('click', () => {
    sounds.click();
    tabBtnMistakes.className = 'btn btn-primary w-full';
    tabBtnHistory.className = 'btn btn-glass w-full';
    tabBtnBadges.className = 'btn btn-glass w-full';
    paneMistakes.style.display = 'block';
    paneHistory.style.display = 'none';
    paneBadges.style.display = 'none';
  });

  tabBtnBadges?.addEventListener('click', () => {
    sounds.click();
    tabBtnBadges.className = 'btn btn-primary w-full';
    tabBtnHistory.className = 'btn btn-glass w-full';
    tabBtnMistakes.className = 'btn btn-glass w-full';
    paneBadges.style.display = 'block';
    paneHistory.style.display = 'none';
    paneMistakes.style.display = 'none';
  });

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    sounds.click();
    Auth.logout();
  });
}

// ==========================================
// 12. View: Practice Mistakes Interactive Drill
// ==========================================
function renderPracticeMistakesView(count = 10) {
  const user = Auth.getCurrentUser();
  if (!user) return router.navigate('#auth');

  let mistakes = LocalDB.getUserMistakes(user.id);
  if (mistakes.length === 0) {
    showToast("No mistakes in notebook to practice!", "info");
    return renderProfileView();
  }

  // Shuffle and pick `count` questions
  const shuffled = BattleEngine.shuffle(mistakes).slice(0, Math.min(count, mistakes.length));
  let currentIdx = 0;
  let correctCount = 0;
  let masteredCount = 0;

  function renderMistakeQ() {
    if (currentIdx >= shuffled.length) {
      // Completed drill
      launchConfetti();
      sounds.fanfare();
      mainView.innerHTML = `
        <div class="glass-card text-center" style="max-width: 580px; margin: 40px auto; padding: 36px 24px;">
          <div style="font-size: 3.5rem; margin-bottom: 8px;">🎉</div>
          <span class="badge badge-emerald mb-2">Drill Finished</span>
          <h2 class="gradient-gold" style="font-size: 1.8rem; margin-bottom: 8px;">Mistakes Revision Complete!</h2>
          <p style="color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 24px;">
            You revised <strong>${shuffled.length} weak questions</strong> and scored <strong>${correctCount} correct</strong>!
          </p>

          <div class="glass-panel" style="padding: 16px; margin-bottom: 24px; display: flex; justify-content: space-around;">
            <div>
              <div style="font-size: 1.6rem; font-weight: 900; color: #34d399;">${correctCount}/${shuffled.length}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Correct (${Math.round((correctCount/shuffled.length)*100)}%)</div>
            </div>
            <div>
              <div style="font-size: 1.6rem; font-weight: 900; color: #818cf8;">${masteredCount}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Mastered & Cleared</div>
            </div>
            <div>
              <div style="font-size: 1.6rem; font-weight: 900; color: #fbbf24;">${LocalDB.getUserMistakes(user.id).length}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Remaining Mistakes</div>
            </div>
          </div>

          <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
            <button id="btn-practice-again" class="btn btn-gold">🔄 Practice More</button>
            <a href="#profile" class="btn btn-primary">👤 Back to Profile</a>
            <a href="#dashboard" class="btn btn-glass">🏠 Arena Dashboard</a>
          </div>
        </div>
      `;

      document.getElementById('btn-practice-again')?.addEventListener('click', () => {
        sounds.click();
        renderPracticeMistakesView(count);
      });
      return;
    }

    const q = shuffled[currentIdx];
    let answered = false;

    mainView.innerHTML = `
      <div style="max-width: 760px; margin: 0 auto;">
        <!-- Top bar -->
        <div class="glass-card" style="padding: 16px 20px; margin-bottom: 16px;">
          <div class="flex-between">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="badge badge-crimson">Mistake Practice Q${currentIdx + 1}/${shuffled.length}</span>
              <span class="badge badge-primary">${q.subject}</span>
            </div>
            <a href="#profile" style="color: var(--text-muted); font-size: 0.85rem; text-decoration: none;">✕ Exit Drill</a>
          </div>
        </div>

        <!-- Question Card -->
        <div class="glass-card" style="padding: 28px; margin-bottom: 18px;">
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">
            ${q.microtheme || 'General'} ${q.year ? `(${q.year})` : ''}
          </div>

          <div style="margin-bottom: 24px;">
            ${formatQuestionHTML(q.question)}
          </div>

          <div style="display: flex; flex-direction: column;">
            ${['A', 'B', 'C', 'D'].map(opt => {
              const optText = q[`option_${opt.toLowerCase()}`];
              if (!optText) return '';
              return `
                <div class="option-card" data-opt="${opt}" id="drill-opt-${opt}">
                  <div class="option-letter">${opt}</div>
                  <div class="option-text">${optText}</div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Post-Answer Explanation & Master Button (Hidden initially) -->
          <div id="drill-explanation-box" style="display: none; margin-top: 20px; border-top: 1px solid var(--border-subtle); padding-top: 18px;">
            <div id="drill-feedback-banner" style="margin-bottom: 14px;"></div>
            ${q.explanation ? `
              <div style="background: rgba(0,0,0,0.3); border-radius: var(--radius-sm); padding: 14px; font-size: 0.88rem; color: #cbd5e1; border-left: 3px solid var(--primary); margin-bottom: 16px;">
                <strong style="color: var(--primary);">💡 Explanation:</strong> ${q.explanation}
              </div>
            ` : ''}
            <div class="flex-between" style="flex-wrap: wrap; gap: 10px;">
              <button id="btn-master-mistake" class="btn btn-emerald btn-sm" style="display: none;">
                Mark as Mastered ✅ (Remove from Notebook)
              </button>
              <button id="btn-next-drill-q" class="btn btn-primary" style="margin-left: auto;">
                Next Question →
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.querySelectorAll('.option-card').forEach(card => {
      card.addEventListener('click', () => {
        if (answered) return;
        answered = true;

        const selected = card.getAttribute('data-opt');
        const isCorrect = selected === q.correctAnswer;

        if (isCorrect) {
          sounds.correct();
          correctCount++;
          card.classList.add('correct');
        } else {
          sounds.wrong();
          card.classList.add('wrong');
          document.getElementById(`drill-opt-${q.correctAnswer}`)?.classList.add('correct');
        }

        const expBox = document.getElementById('drill-explanation-box');
        const feedbackBanner = document.getElementById('drill-feedback-banner');
        const masterBtn = document.getElementById('btn-master-mistake');
        const nextBtn = document.getElementById('btn-next-drill-q');

        if (expBox) expBox.style.display = 'block';

        if (isCorrect) {
          feedbackBanner.innerHTML = `<span class="badge badge-emerald" style="font-size: 0.9rem; padding: 6px 14px;">🎉 Correct Answer!</span>`;
          if (masterBtn) {
            masterBtn.style.display = 'inline-flex';
            masterBtn.addEventListener('click', () => {
              sounds.fanfare();
              LocalDB.removeMistake(user.id, q.questionId || q.id);
              masteredCount++;
              masterBtn.disabled = true;
              masterBtn.innerHTML = "Mastered! ✅";
              showToast("Question marked as Mastered!", "success");
            });
          }
        } else {
          feedbackBanner.innerHTML = `<span class="badge badge-crimson" style="font-size: 0.9rem; padding: 6px 14px;">❌ Incorrect. Correct Option was (${q.correctAnswer})</span>`;
        }

        nextBtn?.addEventListener('click', () => {
          sounds.click();
          currentIdx++;
          renderMistakeQ();
        });
      });
    });
  }

  renderMistakeQ();
}

// ==========================================
// 12. App Initialization & Routes Registration
// ==========================================
function initApp() {
  // Global real-time cloud sync to prune deleted profiles from localStorage and keep all clients synchronized
  Auth.initCloudSync();

  router.add('auth', () => {
    updateNavigation('auth');
    renderAuthView();
  });

  router.add('dashboard', () => {
    updateNavigation('dashboard');
    renderDashboardView();
  });

  router.add('create-battle', () => {
    updateNavigation('create-battle');
    renderCreateBattleView();
  });

  router.add('lobby/:id', (params) => {
    updateNavigation('create-battle');
    renderLobbyView(params);
  });

  router.add('battle/:id', (params) => {
    updateNavigation('create-battle');
    renderBattleView(params);
  });

  router.add('results/:id', (params) => {
    updateNavigation('create-battle');
    renderResultsView(params);
  });

  router.add('daily', () => {
    updateNavigation('daily');
    renderDailyView();
  });

  router.add('syllabus', () => {
    updateNavigation('syllabus');
    renderSyllabusView();
  });

  router.add('leaderboard', () => {
    updateNavigation('leaderboard');
    renderLeaderboardView();
  });

  router.add('profile', () => {
    updateNavigation('profile');
    renderProfileView();
  });

  router.add('practice-mistakes', () => {
    updateNavigation('profile');
    renderPracticeMistakesView(10);
  });

  router.add('practice-mistakes/:count', (params) => {
    updateNavigation('profile');
    const count = parseInt(params.count || '10', 10);
    renderPracticeMistakesView(count);
  });

  router.start();
}

window.addEventListener('DOMContentLoaded', initApp);
