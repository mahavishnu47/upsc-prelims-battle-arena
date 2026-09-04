/**
 * UPSC Prelims Battle Arena — Core Utilities
 * Audio synthesizers, Bitfield helpers, Toast, Confetti, IST time helpers
 */

// ==========================================
// 1. Web Audio Sound Synthesizer (No external assets required!)
// ==========================================
class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.2) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio error:", e);
    }
  }

  click() {
    this.playTone(600, 'triangle', 0.04, 0.08);
  }

  correct() {
    this.init();
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => { // C5, E5, G5, C6 arpeggio
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.18, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.2);
    });
  }

  wrong() {
    this.init();
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    [220, 196, 174].forEach((freq, i) => { // Low dissonant drop
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.2, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.22);
    });
  }

  tick() {
    this.playTone(880, 'sine', 0.03, 0.06);
  }

  fanfare() {
    this.init();
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [
      { f: 523.25, d: 0.12, t: 0 },
      { f: 659.25, d: 0.12, t: 0.12 },
      { f: 783.99, d: 0.12, t: 0.24 },
      { f: 1046.50, d: 0.4, t: 0.36 }
    ];
    notes.forEach(n => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, now + n.t);
      gain.gain.setValueAtTime(0.25, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d);
    });
  }
}

export const sounds = new SoundFX();

// ==========================================
// 2. Toast Notifications
// ==========================================
export function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ==========================================
// 3. Bitfield Helper for Syllabus Progress
// (Stores unattempted/attempted/correct state compactly in Base64)
// ==========================================
export class BitfieldTracker {
  static CHUNK_SIZE = 1024; // 1024 bits per chunk

  /**
   * Unpack base64 string into Uint8Array
   */
  static decodeChunk(base64Str) {
    if (!base64Str) return new Uint8Array(128); // 1024 bits = 128 bytes
    const binaryStr = atob(base64Str);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Pack Uint8Array into base64 string
   */
  static encodeChunk(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Check if question at index `qIndex` is set in chunkMap { chunk0: "base64", ... }
   */
  static isSet(chunksMap, qIndex) {
    const chunkIdx = Math.floor(qIndex / BitfieldTracker.CHUNK_SIZE);
    const bitOffset = qIndex % BitfieldTracker.CHUNK_SIZE;
    const chunkKey = `chunk_${chunkIdx}`;
    const chunkData = chunksMap[chunkKey];
    if (!chunkData) return false;

    const bytes = this.decodeChunk(chunkData);
    const byteIdx = Math.floor(bitOffset / 8);
    const bitPos = bitOffset % 8;
    if (byteIdx >= bytes.length) return false;
    return (bytes[byteIdx] & (1 << bitPos)) !== 0;
  }

  /**
   * Set bit for question at index `qIndex`
   */
  static setBit(chunksMap, qIndex) {
    const chunkIdx = Math.floor(qIndex / BitfieldTracker.CHUNK_SIZE);
    const bitOffset = qIndex % BitfieldTracker.CHUNK_SIZE;
    const chunkKey = `chunk_${chunkIdx}`;
    
    let bytes = this.decodeChunk(chunksMap[chunkKey]);
    if (bytes.length < 128) {
      const newBytes = new Uint8Array(128);
      newBytes.set(bytes);
      bytes = newBytes;
    }

    const byteIdx = Math.floor(bitOffset / 8);
    const bitPos = bitOffset % 8;
    bytes[byteIdx] |= (1 << bitPos);

    chunksMap[chunkKey] = this.encodeChunk(bytes);
    return chunksMap;
  }

  /**
   * Count total bits set across all chunks
   */
  static countBits(chunksMap) {
    let total = 0;
    for (const key in chunksMap) {
      if (chunksMap[key]) {
        const bytes = this.decodeChunk(chunksMap[key]);
        for (let b of bytes) {
          // Hamming weight (popcount)
          while (b > 0) {
            total += (b & 1);
            b >>= 1;
          }
        }
      }
    }
    return total;
  }
}

// ==========================================
// 4. Time and Date in IST (Indian Standard Time, UTC+5:30)
// ==========================================
export function getISTDate() {
  const now = new Date();
  // IST is UTC + 5.5 hours
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
}

export function getISTDateString() {
  const ist = getISTDate();
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, '0');
  const d = String(ist.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getSecondsUntilMidnightIST() {
  const ist = getISTDate();
  const midnight = new Date(ist);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(0, Math.floor((midnight.getTime() - ist.getTime()) / 1000));
}

// ==========================================
// 5. Seeded Random Number Generator
// ==========================================
export function seededRandom(seedStr) {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
    hash |= 0;
  }
  return function() {
    hash = (hash * 9301 + 49297) % 233280;
    return hash / 233280;
  };
}

// ==========================================
// 6. Confetti Particle Animation
// ==========================================
export function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#3b82f6', '#f43f5e', '#a855f7'];

  for (let i = 0; i < 120; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 0.5) * 18 - 6,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
      gravity: 0.35,
      opacity: 1
    });
  }

  let animationFrame;
  function update() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;

    for (let p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.98;
      p.rotation += p.rotSpeed;
      p.opacity -= 0.012;

      if (p.opacity > 0) {
        alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    }

    if (alive > 0) {
      animationFrame = requestAnimationFrame(update);
    } else {
      canvas.remove();
    }
  }

  animationFrame = requestAnimationFrame(update);
}

// ==========================================
// 7. Share Helpers
// ==========================================
export function copyToClipboard(text, successMessage = "Link copied to clipboard! 📋") {
  navigator.clipboard.writeText(text).then(() => {
    showToast(successMessage, 'success');
  }).catch(() => {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    showToast(successMessage, 'success');
  });
}

export function shareViaWhatsApp(text) {
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}
