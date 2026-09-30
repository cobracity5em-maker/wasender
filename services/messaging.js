/**
 * Messaging — single + bulk with multi-session round-robin
 * Anti-ban: SafeSend profiles, fatigue rotation, quiet hours, human presence
 */
import sessionManager from './sessionManager.js';
import analytics from './analytics.js';
import safeSend from './safeSend.js';

function normalizeNumber(num) {
  let n = String(num).replace(/[^\d+]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  if (n.startsWith('0')) n = '972' + n.slice(1);
  return n;
}

function toJid(num) {
  const n = normalizeNumber(num);
  if (n.includes('@')) return n;
  return n + '@s.whatsapp.net';
}

class MessagingService {
  constructor() {
    this._scheduled = new Map();
    this._bulkAbort = new Map();
  }

  async sendMessage(sessionId, to, message, opts = {}) {
    const profile = safeSend.resolveProfile(opts.safeProfile || 'balanced', {
      delayMin: opts.delayMin,
      delayMax: opts.delayMax,
      maxPerHour: opts.maxPerHour,
      maxPerDay: opts.maxPerDay
    });
    // filter undefined overrides
    Object.keys(profile).forEach(k => profile[k] === undefined && delete profile[k]);
    const finalProfile = safeSend.resolveProfile(opts.safeProfile || 'balanced', {
      ...(opts.delayMin != null ? { delayMin: Number(opts.delayMin) } : {}),
      ...(opts.delayMax != null ? { delayMax: Number(opts.delayMax) } : {}),
      ...(opts.maxPerHour != null ? { maxPerHour: Number(opts.maxPerHour) } : {}),
      ...(opts.maxPerDay != null ? { maxPerDay: Number(opts.maxPerDay) } : {})
    });

    if (safeSend.inQuietHours(opts.quietStart, opts.quietEnd)) {
      throw new Error('quiet_hours');
    }
    const gate = safeSend.canSend(sessionId, finalProfile);
    if (!gate.ok) {
      throw new Error(`rate_limited:${gate.reason}`);
    }

    if (opts.delayMs > 0) await safeSend.sleep(opts.delayMs);
    const sock = sessionManager.getSocket(sessionId);
    if (!sock) throw new Error('session offline');
    const jid = toJid(to);
    const humanTyping = opts.humanTyping !== false;
    const text = safeSend.varyText(message, { emojiVary: !!opts.emojiVary });

    if (humanTyping) {
      await safeSend.humanPresence(sock, jid, text, finalProfile);
    }

    try {
      const result = await sock.sendMessage(jid, { text });
      await safeSend.afterSendPresence(sock, jid, finalProfile);
      safeSend.recordSuccess(sessionId);
      analytics.track({ category: 'message', action: 'send_single', sessionId, success: true, meta: { to: jid } });
      return { id: result?.key?.id, to: jid, status: 'sent', sessionId, text };
    } catch (e) {
      safeSend.recordError(sessionId, e.message);
      analytics.track({ category: 'message', action: 'send_single', sessionId, success: false, meta: { error: e.message } });
      throw e;
    }
  }

  /**
   * @param {string|string[]} sessionIdOrIds
   * @param {string[]} numbers
   * @param {string} message
   * @param {object} opts
   */
  async sendBulk(sessionIdOrIds, numbers, message, opts = {}) {
    const ids = Array.isArray(sessionIdOrIds) ? sessionIdOrIds : [sessionIdOrIds];
    const list = (numbers || []).map(n => String(n).trim()).filter(Boolean);
    const profileName = opts.safeProfile || 'balanced';
    const profile = safeSend.resolveProfile(profileName, {
      ...(opts.delayMin != null ? { delayMin: Number(opts.delayMin) } : {}),
      ...(opts.delayMax != null ? { delayMax: Number(opts.delayMax) } : {}),
      ...(opts.maxPerHour != null ? { maxPerHour: Number(opts.maxPerHour) } : {}),
      ...(opts.maxPerDay != null ? { maxPerDay: Number(opts.maxPerDay) } : {})
    });
    const humanTyping = opts.humanTyping !== false;
    const emojiVary = opts.emojiVary !== false;
    const jobId = opts.jobId || `bulk_${Date.now()}`;
    this._bulkAbort.set(jobId, false);

    const stats = { total: list.length, sent: 0, failed: 0, skipped: 0 };
    const getSocket = (id) => sessionManager.getSocket(id);

    for (let i = 0; i < list.length; i++) {
      if (this._bulkAbort.get(jobId)) break;
      if (opts.stopAt && Date.now() >= new Date(opts.stopAt).getTime()) break;

      if (safeSend.inQuietHours(opts.quietStart, opts.quietEnd)) {
        // wait until quiet hours end (poll every 30s, max 15 min slices)
        await safeSend.sleep(30_000);
        i--;
        continue;
      }

      const sessionId = safeSend.pickSession(ids, getSocket);
      if (!sessionId) {
        stats.failed++;
        continue;
      }

      const gate = safeSend.canSend(sessionId, profile);
      if (!gate.ok) {
        await safeSend.sleep(Math.min(gate.waitMs || 60_000, 120_000));
        i--;
        continue;
      }

      const phone = list[i];
      try {
        await this.sendMessage(sessionId, phone, message, {
          humanTyping,
          emojiVary,
          safeProfile: profileName,
          delayMin: profile.delayMin,
          delayMax: profile.delayMax,
          maxPerHour: profile.maxPerHour,
          maxPerDay: profile.maxPerDay,
          quietStart: opts.quietStart,
          quietEnd: opts.quietEnd
        });
        stats.sent++;
        if (opts.onProgress) opts.onProgress({ phone, status: 'sent', sessionId, stats });
      } catch (e) {
        stats.failed++;
        if (opts.onProgress) opts.onProgress({ phone, status: 'error', error: e.message, stats });
      }

      if (i < list.length - 1 && !this._bulkAbort.get(jobId)) {
        const delay = safeSend.nextDelayMs(sessionId, profile);
        await safeSend.sleep(delay);
      }
    }

    this._bulkAbort.delete(jobId);
    return stats;
  }

  abortBulk(jobId) {
    if (this._bulkAbort.has(jobId)) {
      this._bulkAbort.set(jobId, true);
      return true;
    }
    return false;
  }

  scheduleBulk(job) {
    const id = job.id || `sched_${Date.now()}`;
    const startAt = job.startAt ? new Date(job.startAt).getTime() : Date.now();
    const delay = Math.max(0, startAt - Date.now());
    const handle = setTimeout(async () => {
      try {
        await this.sendBulk(job.sessionIds || job.sessionId, job.numbers, job.message, {
          delayMin: job.delayMin,
          delayMax: job.delayMax,
          humanTyping: job.humanTyping,
          emojiVary: job.emojiVary,
          safeProfile: job.safeProfile || 'balanced',
          quietStart: job.quietStart,
          quietEnd: job.quietEnd,
          stopAt: job.stopAt,
          jobId: id
        });
      } finally {
        this._scheduled.delete(id);
      }
    }, delay);
    this._scheduled.set(id, { handle, job, startAt });
    return { id, startsInMs: delay, startAt: new Date(startAt).toISOString() };
  }

  cancelScheduled(id) {
    const row = this._scheduled.get(id);
    if (!row) return false;
    clearTimeout(row.handle);
    this._scheduled.delete(id);
    this.abortBulk(id);
    return true;
  }

  listScheduled() {
    return [...this._scheduled.entries()].map(([id, v]) => ({
      id,
      startAt: new Date(v.startAt).toISOString(),
      numbers: (v.job.numbers || []).length
    }));
  }

  getSafeProfiles() {
    return safeSend.PROFILES;
  }

  getSessionSendStats(sessionId) {
    return safeSend.getSessionStats(sessionId);
  }
}

export default new MessagingService();
