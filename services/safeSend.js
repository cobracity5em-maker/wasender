/**
 * SafeSend — anti-ban pacing, presence simulation, session fatigue, message variation
 * Used by messaging, campaigns, warmer
 */

const PROFILES = {
  safe: {
    delayMin: 25,
    delayMax: 75,
    maxPerHour: 12,
    maxPerDay: 60,
    burstSize: 3,
    burstPauseMin: 90,
    burstPauseMax: 180,
    typingMult: 1.35,
    presenceReadChance: 0.35,
    longPauseEvery: 5,
    longPauseMin: 120,
    longPauseMax: 300
  },
  balanced: {
    delayMin: 12,
    delayMax: 40,
    maxPerHour: 25,
    maxPerDay: 120,
    burstSize: 5,
    burstPauseMin: 45,
    burstPauseMax: 100,
    typingMult: 1.1,
    presenceReadChance: 0.25,
    longPauseEvery: 8,
    longPauseMin: 60,
    longPauseMax: 150
  },
  fast: {
    delayMin: 6,
    delayMax: 18,
    maxPerHour: 45,
    maxPerDay: 200,
    burstSize: 8,
    burstPauseMin: 25,
    burstPauseMax: 55,
    typingMult: 0.9,
    presenceReadChance: 0.15,
    longPauseEvery: 12,
    longPauseMin: 30,
    longPauseMax: 70
  }
};

const EMOJI_POOL = ['😊', '🙂', '😉', '✨', '🔥', '👍', '🙏', '💪', '⭐', '✅', '👋', '💯', '👏', '🌟', ''];

// sessionId -> { hour: {key, count}, day: {key, count}, streak, lastSentAt, errors, backoffUntil }
const sessionState = new Map();

function hourKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
}
function dayKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function getState(sessionId) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      hour: { key: hourKey(), count: 0 },
      day: { key: dayKey(), count: 0 },
      streak: 0,
      lastSentAt: 0,
      errors: 0,
      backoffUntil: 0,
      totalSent: 0
    });
  }
  const st = sessionState.get(sessionId);
  const hk = hourKey();
  const dk = dayKey();
  if (st.hour.key !== hk) st.hour = { key: hk, count: 0 };
  if (st.day.key !== dk) st.day = { key: dk, count: 0 };
  return st;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** Skewed random — prefers middle-upper range (more human than uniform) */
function jitter(minSec, maxSec) {
  const a = Math.min(minSec, maxSec);
  const b = Math.max(minSec, maxSec);
  // beta-like: average of 2 uniforms
  const u = (Math.random() + Math.random()) / 2;
  return (a + u * (b - a)) * 1000;
}

function resolveProfile(name, overrides = {}) {
  const base = PROFILES[name] || PROFILES.balanced;
  return { ...base, ...overrides };
}

function inQuietHours(quietStart, quietEnd) {
  if (quietStart == null || quietEnd == null || quietStart === '' || quietEnd === '') return false;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = String(quietStart).split(':').map(Number);
  const [eh, em] = String(quietEnd).split(':').map(Number);
  if ([sh, sm, eh, em].some(x => Number.isNaN(x))) return false;
  const s = sh * 60 + (sm || 0);
  const e = eh * 60 + (em || 0);
  if (s === e) return false;
  if (s < e) return mins >= s && mins < e;
  // wraps midnight
  return mins >= s || mins < e;
}

function canSend(sessionId, profile) {
  const st = getState(sessionId);
  const now = Date.now();
  if (st.backoffUntil > now) {
    return { ok: false, reason: 'backoff', waitMs: st.backoffUntil - now };
  }
  if (st.hour.count >= profile.maxPerHour) {
    return { ok: false, reason: 'hour_limit', waitMs: 60_000 };
  }
  if (st.day.count >= profile.maxPerDay) {
    return { ok: false, reason: 'day_limit', waitMs: 300_000 };
  }
  return { ok: true };
}

function recordSuccess(sessionId) {
  const st = getState(sessionId);
  st.hour.count++;
  st.day.count++;
  st.streak++;
  st.totalSent++;
  st.lastSentAt = Date.now();
  st.errors = Math.max(0, st.errors - 1);
}

function recordError(sessionId, errMsg = '') {
  const st = getState(sessionId);
  st.errors++;
  st.streak = 0;
  const msg = String(errMsg || '').toLowerCase();
  // aggressive backoff on ban-like errors
  let backoff = Math.min(30 * 60 * 1000, 15_000 * Math.pow(2, Math.min(st.errors, 6)));
  if (/forbidden|banned|403|rate|too many|not-authorized|blocked/i.test(msg)) {
    backoff = Math.max(backoff, 10 * 60 * 1000);
  }
  st.backoffUntil = Date.now() + backoff;
  return backoff;
}

function varyText(text, { emojiVary = true } = {}) {
  let out = String(text || '');
  // subtle punctuation / spacing variation
  if (Math.random() < 0.2) out = out.replace(/\s+/g, (m) => (Math.random() < 0.3 ? '  ' : m));
  if (Math.random() < 0.18) out = out.replace(/([.!?])\s*$/, '$1');
  if (Math.random() < 0.12) out = out.replace(/\u05be/g, '-'); // hebrew maqaf subtle
  if (emojiVary && Math.random() < 0.5) {
    const n = Math.random() < 0.7 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const e = EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)];
      if (e) out += (Math.random() < 0.5 ? ' ' : '') + e;
    }
  }
  // tiny zero-width chance disabled by default (can look spammy) — skip
  return out.trim();
}

function typingMs(text, profile) {
  const len = String(text || '').length;
  const base = Math.min(8000, Math.max(1200, len * 32 + Math.random() * 1400));
  return Math.round(base * (profile.typingMult || 1));
}

/**
 * Human-like presence + typing before send
 */
async function humanPresence(sock, jid, text, profile) {
  try {
    await sock.presenceSubscribe(jid);
  } catch {}
  try {
    await sock.sendPresenceUpdate('available', jid);
  } catch {}
  await sleep(400 + Math.random() * 900);
  try {
    await sock.sendPresenceUpdate('composing', jid);
  } catch {}
  await sleep(typingMs(text, profile));
  // occasional brief pause mid-compose
  if (Math.random() < 0.22) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    await sleep(600 + Math.random() * 1400);
    try { await sock.sendPresenceUpdate('composing', jid); } catch {}
    await sleep(500 + Math.random() * 1000);
  }
}

async function afterSendPresence(sock, jid, profile) {
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}
  if (Math.random() < (profile.presenceReadChance || 0)) {
    await sleep(300 + Math.random() * 800);
    try {
      // mark as available briefly (no forced read receipts on outbound target)
      await sock.sendPresenceUpdate('available', jid);
    } catch {}
  }
}

/**
 * Compute delay before next message for this session (ms)
 */
function nextDelayMs(sessionId, profile) {
  const st = getState(sessionId);
  let ms = jitter(profile.delayMin, profile.delayMax);

  // burst pause
  if (st.streak > 0 && st.streak % profile.burstSize === 0) {
    ms += jitter(profile.burstPauseMin, profile.burstPauseMax);
  }
  // long pause every N
  if (st.streak > 0 && st.streak % profile.longPauseEvery === 0) {
    ms += jitter(profile.longPauseMin, profile.longPauseMax);
  }
  // if sent very recently, enforce minimum gap
  const since = Date.now() - (st.lastSentAt || 0);
  const minGap = profile.delayMin * 700;
  if (since < minGap) ms += (minGap - since);

  return Math.round(ms);
}

/**
 * Pick least-fatigued session from list of online session ids
 */
function pickSession(sessionIds, getSocket) {
  const scored = [];
  for (const id of sessionIds) {
    if (!getSocket(id)) continue;
    const st = getState(id);
    if (st.backoffUntil > Date.now()) continue;
    // lower is better
    const score =
      st.hour.count * 3 +
      st.day.count * 0.5 +
      st.streak * 1.2 +
      st.errors * 8 +
      (Date.now() - (st.lastSentAt || 0) < 8000 ? 20 : 0);
    scored.push({ id, score });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => a.score - b.score);
  // pick among top 2 randomly for natural rotation
  const top = scored.slice(0, Math.min(2, scored.length));
  return top[Math.floor(Math.random() * top.length)].id;
}

function getSessionStats(sessionId) {
  return { ...getState(sessionId) };
}

function getProfileList() {
  return Object.keys(PROFILES);
}

export default {
  PROFILES,
  resolveProfile,
  inQuietHours,
  canSend,
  recordSuccess,
  recordError,
  varyText,
  humanPresence,
  afterSendPresence,
  nextDelayMs,
  pickSession,
  getSessionStats,
  getProfileList,
  sleep,
  jitter
};
