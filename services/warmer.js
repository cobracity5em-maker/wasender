/**
 * Warmer — mutual light activity between sessions
 * Tracks per-session heat score and ready-for-send status
 */
import sessionManager from './sessionManager.js';
import analytics from './analytics.js';
import safeSend from './safeSend.js';

const PHRASES = [
  'היי', 'מה נשמע?', '👍', 'בסדר גמור', 'ערב טוב', 'בוקר טוב',
  'ok', 'hi', 'hey', '👍👍', 'כן', 'סבבה', 'מעולה', '✌️',
  'test', '👋', 'הכל טוב?', 'נתעדכן', 'אחלה'
];

// sessionId -> { sent, received, lastAt, startedAt, score, ready }
const heat = new Map();

function getHeat(id) {
  if (!heat.has(id)) {
    heat.set(id, {
      sent: 0,
      received: 0,
      lastAt: 0,
      startedAt: Date.now(),
      score: 0,
      ready: false,
      status: 'idle'
    });
  }
  return heat.get(id);
}

function recompute(h) {
  const ageMin = (Date.now() - (h.startedAt || Date.now())) / 60000;
  // readiness: need both volume and time
  const volume = h.sent + h.received;
  let score = 0;
  score += Math.min(40, volume * 4);
  score += Math.min(30, ageMin * 2); // ~15 min for full time score
  score += Math.min(20, h.sent * 3);
  score += Math.min(10, h.received * 3);
  h.score = Math.round(Math.min(100, score));
  // ready when score >= 70 and at least 8 outbound + 4 inbound and ~10 min
  h.ready = h.score >= 70 && h.sent >= 8 && h.received >= 4 && ageMin >= 10;
  if (h.ready) h.status = 'ready';
  else if (h.sent > 0 || h.received > 0) h.status = 'warming';
  else h.status = 'idle';
  return h;
}

class WarmerService {
  constructor() {
    this.active = false;
    this.sessionIds = [];
    this.mode = 'normal';
    this.intervalMin = 30;
    this.intervalMax = 120;
    this.timer = null;
    this.stats = { sent: 0, errors: 0, last: null };
    this.io = null;
  }

  setIO(io) { this.io = io; }

  _emit(event, data) {
    try { this.io?.emit(event, data); } catch {}
  }

  _modeRange() {
    if (this.mode === 'gentle') return { min: 90, max: 240 };
    if (this.mode === 'active') return { min: 20, max: 60 };
    return { min: this.intervalMin || 30, max: this.intervalMax || 120 };
  }

  start({ sessionIds = [], mode = 'normal', intervalMin = 30, intervalMax = 120 } = {}) {
    this.stop();
    this.sessionIds = [...new Set(sessionIds)].filter(Boolean);
    if (this.sessionIds.length < 2) throw new Error('need_at_least_2_sessions');
    this.mode = mode || 'normal';
    this.intervalMin = Number(intervalMin) || 30;
    this.intervalMax = Number(intervalMax) || 120;
    this.active = true;
    this.stats = { sent: 0, errors: 0, last: null };
    for (const id of this.sessionIds) {
      const h = getHeat(id);
      h.startedAt = h.startedAt || Date.now();
      h.status = 'warming';
      recompute(h);
    }
    try { analytics.track({ category: 'warmer', action: 'start', success: true, meta: { n: this.sessionIds.length } }); } catch {}
    this._emit('warmer-status', this.getStatus());
    this._scheduleNext();
    return this.getStatus();
  }

  stop() {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const id of this.sessionIds) {
      const h = getHeat(id);
      if (!h.ready) h.status = 'paused';
    }
    this._emit('warmer-status', this.getStatus());
    return this.getStatus();
  }

  _scheduleNext() {
    if (!this.active) return;
    const { min, max } = this._modeRange();
    const delay = (min + Math.random() * Math.max(1, max - min)) * 1000;
    this.timer = setTimeout(() => this._tick(), delay);
  }

  async _tick() {
    if (!this.active) return;
    try {
      const online = this.sessionIds.filter(id => {
        try { return !!sessionManager.getSocket(id); } catch { return false; }
      });
      if (online.length < 2) {
        this._scheduleNext();
        return;
      }

      // pick two different sessions, prefer ones less ready
      const ranked = online
        .map(id => ({ id, score: getHeat(id).score }))
        .sort((a, b) => a.score - b.score);
      const fromId = ranked[0].id;
      let toId = ranked[Math.min(1, ranked.length - 1)].id;
      if (toId === fromId) {
        toId = online.find(x => x !== fromId) || fromId;
      }
      if (fromId === toId) {
        this._scheduleNext();
        return;
      }

      const fromSock = sessionManager.getSocket(fromId);
      const toMeta = sessionManager.listSessions?.()?.find(s => s.id === toId);
      const phone = toMeta?.phone;
      if (!phone) {
        this.stats.errors++;
        this._scheduleNext();
        return;
      }
      const jid = String(phone).replace(/\D/g, '') + '@s.whatsapp.net';
      const msg = PHRASES[Math.floor(Math.random() * PHRASES.length)];
      const profile = safeSend.resolveProfile('safe');

      try {
        await safeSend.humanPresence(fromSock, jid, msg, profile);
        await fromSock.sendMessage(jid, { text: msg });
        await safeSend.afterSendPresence(fromSock, jid, profile);

        const hf = getHeat(fromId);
        hf.sent++;
        hf.lastAt = Date.now();
        recompute(hf);
        const ht = getHeat(toId);
        ht.received++;
        ht.lastAt = Date.now();
        recompute(ht);

        this.stats.sent++;
        this.stats.last = new Date().toISOString();
        this._emit('warmer-message', {
          from: fromId,
          to: toId,
          text: msg,
          at: this.stats.last
        });
        this._emit('warmer-status', this.getStatus());
      } catch (e) {
        this.stats.errors++;
        const hf = getHeat(fromId);
        hf.status = 'error';
        this._emit('warmer-status', this.getStatus());
      }
    } catch (e) {
      this.stats.errors++;
    }
    this._scheduleNext();
  }

  getStatus() {
    const sessions = this.sessionIds.map(id => {
      const h = recompute(getHeat(id));
      let online = false;
      try { online = !!sessionManager.getSocket(id); } catch {}
      const meta = sessionManager.listSessions?.()?.find(s => s.id === id);
      return {
        id,
        label: meta?.label || meta?.name || id,
        phone: meta?.phone || null,
        online,
        sent: h.sent,
        received: h.received,
        score: h.score,
        ready: h.ready,
        status: !online ? 'offline' : h.status,
        lastAt: h.lastAt || null
      };
    });
    const readyCount = sessions.filter(s => s.ready).length;
    return {
      active: this.active,
      mode: this.mode,
      stats: this.stats,
      sessions,
      readyCount,
      total: sessions.length,
      allReady: sessions.length > 0 && readyCount === sessions.length
    };
  }
}

export default new WarmerService();
