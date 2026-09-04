/**
 * UPSC Prelims Battle Arena — Authentication Module
 * 4-digit PIN authentication with Web Crypto SHA-256 hashing and 5-attempt lockout
 */

import { LocalDB } from './storage.js';
import { showToast } from './utils.js';
import { peerBus, UserService } from './firebase-service.js';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const AVATARS = ['🎯', '🦁', '🐯', '🦅', '🦉', '⚡', '🛡️', '⚔️', '👑', '🚀', '🏹', '🏛️'];

// Self-contained pure JS SHA-256 implementation as fallback for non-secure HTTP contexts
function sha256Pure(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i, j;
  let result = '';
  const words = [];
  const asciiBitLength = ascii[lengthProperty] * 8;
  let hash = [];
  const k = [];
  let primeCounter = 0;

  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = candidate * 2; i <= 311; i += candidate) {
        isComposite[i] = true;
      }
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      }
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }

  ascii += '\x80';
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return;
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp1 =
        hash[7] +
        (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) +
        ch +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] + s0 + w[i - 7] + s1) | 0);
      const temp2 =
        (rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) +
        maj;

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

export async function hashPin(pin) {
  const str = pin + "_upsc_salt_key";
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn("crypto.subtle failed, using pure JS fallback:", e);
    }
  }
  return sha256Pure(str);
}

export const Auth = {
  getCurrentUser() {
    return LocalDB.getUser();
  },

  isLoggedIn() {
    return !!LocalDB.getUser();
  },

  logout() {
    LocalDB.setUser(null);
    window.location.hash = '#auth';
    window.location.reload();
  },

  getRegisteredUsers() {
    return LocalDB.getRegisteredUsers();
  },

  async syncCloudUsers() {
    try {
      const cloudUsers = await UserService.getAllUsers();
      if (Array.isArray(cloudUsers)) {
        LocalDB.saveRegisteredUsers(cloudUsers);
        // If current logged-in user was deleted from cloud, log out immediately
        const currentUser = LocalDB.getUser();
        if (currentUser && !cloudUsers.some(u => u.id === currentUser.id)) {
          console.warn("User account was deleted from Firebase. Logging out...");
          LocalDB.setUser(null);
          if (window.location.hash !== '#auth') {
            window.location.hash = '#auth';
            window.location.reload();
          }
        }
        return cloudUsers;
      }
    } catch (e) {
      console.warn("Cloud users sync failed:", e);
    }
    return LocalDB.getRegisteredUsers();
  },

  initCloudSync(onUsersUpdated) {
    // 1. Initial async sync
    this.syncCloudUsers().then(users => {
      if (onUsersUpdated) onUsersUpdated(users);
    });

    // 2. Real-time subscription to Firebase users
    return UserService.subscribeToUsers(cloudUsers => {
      if (Array.isArray(cloudUsers)) {
        LocalDB.saveRegisteredUsers(cloudUsers);
        const currentUser = LocalDB.getUser();
        if (currentUser && !cloudUsers.some(u => u.id === currentUser.id)) {
          console.warn("Active account was deleted from cloud. Logging out...");
          LocalDB.setUser(null);
          if (window.location.hash !== '#auth') {
            window.location.hash = '#auth';
            window.location.reload();
          }
        }
        if (onUsersUpdated) onUsersUpdated(cloudUsers);
      }
    });
  },

  async register(name, pin, avatar = '🎯') {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Please enter your name");
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      throw new Error("PIN must be exactly 4 digits (0-9)");
    }

    // Sync cloud users first to check unique names
    let users = await this.syncCloudUsers();
    const existing = users.find(u => u.name.toLowerCase() === trimmedName.toLowerCase());
    if (existing) {
      throw new Error(`A user named "${trimmedName}" already exists. Please select your name in the Sign In list.`);
    }

    const pinHash = await hashPin(pin);
    const id = 'user_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

    const newUser = {
      id,
      name: trimmedName,
      avatar,
      pinHash,
      createdAt: Date.now(),
      stats: {
        totalBattles: 0,
        battlesWon: 0,
        totalPoints: 0,
        questionsAttempted: 0,
        questionsCorrect: 0,
        dailyStreak: 1,
        lastActiveDate: new Date().toISOString().split('T')[0],
        maxStreak: 1,
        streakFreezes: 1
      }
    };

    users.push(newUser);
    LocalDB.saveRegisteredUsers(users);
    LocalDB.setUser(newUser);

    // Save to Firebase Realtime Database
    try {
      await UserService.saveUserToCloud(newUser);
    } catch (e) {
      console.warn("Cloud user sync error:", e);
    }

    showToast(`Welcome to Battle Arena, ${trimmedName}! 🏆`, 'success');
    return newUser;
  },

  async login(nameOrId, pin) {
    if (!nameOrId) {
      throw new Error("Please select or search your name");
    }
    if (!pin || pin.length !== 4) {
      throw new Error("Please enter your 4-digit PIN");
    }

    let users = LocalDB.getRegisteredUsers();
    let user = users.find(u => u.id === nameOrId || u.name.toLowerCase() === nameOrId.trim().toLowerCase());

    // If not found in local DB, attempt cloud fetch
    if (!user) {
      users = await this.syncCloudUsers();
      user = users.find(u => u.id === nameOrId || u.name.toLowerCase() === nameOrId.trim().toLowerCase());
    }

    if (!user) {
      throw new Error(`Profile "${nameOrId}" not found. Please click Register to create your account.`);
    }

    // Check lockout
    const lockout = LocalDB.getLockoutInfo(user.id);
    const now = Date.now();
    if (lockout.lockedUntil && lockout.lockedUntil > now) {
      const minutesLeft = Math.ceil((lockout.lockedUntil - now) / 60000);
      throw new Error(`Account locked due to 5 failed attempts. Please try again in ${minutesLeft} minute(s).`);
    }

    const inputHash = await hashPin(pin);
    if (inputHash !== user.pinHash) {
      const attempts = (lockout.attempts || 0) + 1;
      if (attempts >= LOCKOUT_THRESHOLD) {
        LocalDB.setLockoutInfo(user.id, {
          attempts: 0,
          lockedUntil: now + LOCKOUT_DURATION_MS
        });
        throw new Error("Too many incorrect attempts! Account locked for 15 minutes.");
      } else {
        LocalDB.setLockoutInfo(user.id, {
          attempts,
          lockedUntil: 0
        });
        const remaining = LOCKOUT_THRESHOLD - attempts;
        throw new Error(`Incorrect PIN. ${remaining} attempt(s) remaining.`);
      }
    }

    // Reset lockout on success
    LocalDB.setLockoutInfo(user.id, { attempts: 0, lockedUntil: 0 });
    LocalDB.setUser(user);
    showToast(`Welcome back, ${user.name}! 🚀`, 'success');
    return user;
  }
};
