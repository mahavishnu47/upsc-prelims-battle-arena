/**
 * UPSC Prelims Battle Arena — Firebase Realtime Database Engine
 * Real-time room sync, live multiplayer, leaderboard & daily challenge across devices
 */

let firebaseApp = null;
let firebaseDb = null;

export function initFirebase(config) {
  if (typeof firebase !== 'undefined' && firebase.initializeApp) {
    try {
      if (!firebase.apps || firebase.apps.length === 0) {
        firebaseApp = firebase.initializeApp(config);
      } else {
        firebaseApp = firebase.apps[0];
      }
      firebaseDb = firebase.database();
      console.log("🔥 Firebase Realtime Database initialized successfully!");
      return true;
    } catch (e) {
      console.warn("Firebase initialization warning:", e);
    }
  }
  return false;
}

// Check if user has saved custom Firebase config
export function getSavedFirebaseConfig() {
  const custom = localStorage.getItem('upsc_custom_firebase_config');
  if (custom) {
    try {
      return JSON.parse(custom);
    } catch (e) {}
  }
  return null;
}

export function saveFirebaseConfig(config) {
  localStorage.setItem('upsc_custom_firebase_config', JSON.stringify(config));
  initFirebase(config);
}

// Try auto-initializing on load if config exists
const savedConfig = getSavedFirebaseConfig();
if (savedConfig) {
  initFirebase(savedConfig);
}

// Local simulation fallback
class PeerSyncBus {
  constructor() {
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('upsc_arena_bus') : null;
    this.listeners = new Map();

    if (this.channel) {
      this.channel.onmessage = (event) => {
        const { type, path, data } = event.data;
        if (this.listeners.has(path)) {
          this.listeners.get(path).forEach(cb => cb(data));
        }
      };
    }
  }

  set(path, data) {
    if (firebaseDb) {
      try {
        firebaseDb.ref(path).set(data);
      } catch (e) {
        console.warn("Firebase write error:", e);
      }
    }
    localStorage.setItem(`rtdb_${path}`, JSON.stringify(data));
    if (this.channel) {
      this.channel.postMessage({ type: 'SET', path, data });
    }
    if (this.listeners.has(path)) {
      this.listeners.get(path).forEach(cb => cb(data));
    }
  }

  get(path) {
    const d = localStorage.getItem(`rtdb_${path}`);
    return d ? JSON.parse(d) : null;
  }

  on(path, callback) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    this.listeners.get(path).add(callback);

    // If Firebase DB is connected, listen to live socket events
    if (firebaseDb) {
      try {
        const ref = firebaseDb.ref(path);
        const fbCallback = (snapshot) => {
          const val = snapshot.val();
          if (val !== null) {
            localStorage.setItem(`rtdb_${path}`, JSON.stringify(val));
            callback(val);
          }
        };
        ref.on('value', fbCallback);
        return () => {
          ref.off('value', fbCallback);
          if (this.listeners.has(path)) {
            this.listeners.get(path).delete(callback);
          }
        };
      } catch (e) {
        console.warn("Firebase listener error:", e);
      }
    }

    // Trigger with current cached value
    const current = this.get(path);
    if (current !== null) {
      callback(current);
    }
    return () => {
      if (this.listeners.has(path)) {
        this.listeners.get(path).delete(callback);
      }
    };
  }
}

export const peerBus = new PeerSyncBus();

export const BattleService = {
  async createRoom(battleId, roomData) {
    const path = `battles/${battleId}`;
    peerBus.set(path, roomData);
    return roomData;
  },

  async getRoom(battleId) {
    const path = `battles/${battleId}`;
    return peerBus.get(path);
  },

  subscribeToRoom(battleId, callback) {
    const path = `battles/${battleId}`;
    return peerBus.on(path, callback);
  },

  async joinRoom(battleId, player) {
    const path = `battles/${battleId}`;
    const room = peerBus.get(path);
    if (!room) throw new Error("Battle room not found");

    if (!room.players) room.players = {};
    room.players[player.id] = {
      id: player.id,
      name: player.name,
      avatar: player.avatar || '🎯',
      score: 0,
      currentQuestionIndex: 0,
      answers: {},
      isReady: true,
      finished: false,
      streak: 0,
      joinedAt: Date.now()
    };

    peerBus.set(path, room);
    return room;
  },

  async startBattle(battleId, startCountdownSeconds = 5) {
    const path = `battles/${battleId}`;
    const room = peerBus.get(path);
    if (!room) return;

    room.status = 'starting';
    room.startTime = Date.now() + (startCountdownSeconds * 1000);
    peerBus.set(path, room);

    setTimeout(() => {
      const activeRoom = peerBus.get(path);
      if (activeRoom && activeRoom.status === 'starting') {
        activeRoom.status = 'active';
        peerBus.set(path, activeRoom);
      }
    }, startCountdownSeconds * 1000);
  },

  async submitAnswer(battleId, playerId, questionIndex, selectedOption, isCorrect, pointsEarned, timeTakenSec) {
    const path = `battles/${battleId}`;
    const room = peerBus.get(path);
    if (!room || !room.players || !room.players[playerId]) return;

    const p = room.players[playerId];
    p.answers[questionIndex] = {
      selectedOption,
      isCorrect,
      pointsEarned,
      timeTakenSec,
      answeredAt: Date.now()
    };

    p.score += pointsEarned;
    if (isCorrect) {
      p.streak = (p.streak || 0) + 1;
    } else {
      p.streak = 0;
    }
    p.currentQuestionIndex = questionIndex + 1;

    if (p.currentQuestionIndex >= room.questions.length) {
      p.finished = true;
      p.finishedAt = Date.now();
    }

    const playerList = Object.values(room.players);
    const allFinished = playerList.length > 0 && playerList.every(pl => pl.finished);
    if (allFinished) {
      room.status = 'finished';
      room.endedAt = Date.now();
    }

    peerBus.set(path, room);
  }
};
