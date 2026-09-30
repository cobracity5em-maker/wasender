import analytics from './analytics.js';
/**
 * Campaigns — multi-account, templates, {{name}}, human typing, skip cooldown
 */
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import cron from 'node-cron';
import sessionManager from './sessionManager.js';
import safeSend from './safeSend.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json');
const SENT_LOG_FILE = path.join(DATA_DIR, 'sent_log.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');

function digitsOnly(num) {
  let n = String(num).replace(/\D/g, '');
  if (n.startsWith('0') && n.length <= 10) n = '972' + n.slice(1);
  return n;
}
function toJid(num) {
  const n = digitsOnly(num);
  return n.includes('@') ? n : n + '@s.whatsapp.net';
}

function applyTemplate(text, vars = {}) {
  let out = String(text || '');
  // {{name}} {{first_name}} {{phone}}
  out = out.replace(/\{\{\s*name\s*\}\}/gi, vars.name || vars.first_name || '');
  out = out.replace(/\{\{\s*first_name\s*\}\}/gi, vars.first_name || vars.name || '');
  out = out.replace(/\{\{\s*phone\s*\}\}/gi, vars.phone || '');
  return out;
}

function varyMessage(base, useEmojis = true) {
  const emojis = ['😊', '👍', '✨', '🙏', '💯', '🔥', '✅', '👋', '💪', '🌟', ''];
  let msg = base.trim();
  if (useEmojis && Math.random() > 0.45) {
    msg += ' ' + emojis[Math.floor(Math.random() * emojis.length)];
  }
  return msg.trim();
}

const DEFAULT_TEMPLATES = [
  { id: 't1', name: 'ברכה קצרה', body: 'שלום {{name}}, מה שלומך?' },
  { id: 't2', name: 'מבצע', body: 'היי {{name}} 👋\nיש לנו עדכון קצר עבורך.' },
  { id: 't3', name: 'מעקב', body: 'שלום {{name}}, רצינו לוודא שקיבלת את ההודעה הקודמת.' }
];

class CampaignsService {
  constructor() {
    this.campaigns = {};
    this.sentLog = {};
    this.templates = [...DEFAULT_TEMPLATES];
    this.running = new Map();
    this.cronJobs = new Map();
    this.io = null;
    this._load();
  }

  setIO(io) { this.io = io; }

  async _load() {
    try {
      await fs.ensureDir(DATA_DIR);
      if (await fs.pathExists(CAMPAIGNS_FILE)) this.campaigns = await fs.readJson(CAMPAIGNS_FILE);
      if (await fs.pathExists(SENT_LOG_FILE)) this.sentLog = await fs.readJson(SENT_LOG_FILE);
      if (await fs.pathExists(TEMPLATES_FILE)) this.templates = await fs.readJson(TEMPLATES_FILE);
    } catch {
      this.campaigns = {};
      this.sentLog = {};
    }
  }

  async _saveCampaigns() { await fs.writeJson(CAMPAIGNS_FILE, this.campaigns, { spaces: 2 }); }
  async _saveSentLog() { await fs.writeJson(SENT_LOG_FILE, this.sentLog); }
  async _saveTemplates() { await fs.writeJson(TEMPLATES_FILE, this.templates, { spaces: 2 }); }

  _emit(event, data) { if (this.io) this.io.emit(event, data); }

  listTemplates() { return this.templates; }

  async saveTemplate(t) {
    if (t.id) {
      const i = this.templates.findIndex(x => x.id === t.id);
      if (i >= 0) this.templates[i] = { ...this.templates[i], ...t };
      else this.templates.push(t);
    } else {
      t.id = 't_' + Date.now();
      this.templates.push(t);
    }
    await this._saveTemplates();
    return t;
  }

  list() {
    return Object.values(this.campaigns).map(c => ({
      ...c,
      running: this.running.has(c.id),
      stats: this.running.get(c.id)?.stats || c.stats || null
    }));
  }

  get(id) { return this.campaigns[id] || null; }

  async create(data) {
    const id = 'camp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    let sessionIds = data.sessionIds || (data.sessionId ? [data.sessionId] : []);
    if (!Array.isArray(sessionIds)) sessionIds = [sessionIds];
    sessionIds = sessionIds.filter(Boolean);

    const campaign = {
      id,
      name: data.name || 'קמפיין',
      sessionId: sessionIds[0] || data.sessionId,
      sessionIds,
      message: data.message || '',
      numbers: data.numbers || [],
      // optional parallel array or map phone -> name
      contacts: data.contacts || [], // [{phone, name}]
      delayMin: Number(data.delayMin) || 12,
      delayMax: Number(data.delayMax) || 40,
      safeProfile: data.safeProfile || 'balanced',
      maxPerHour: Number(data.maxPerHour) || 0,
      maxPerDay: Number(data.maxPerDay) || 0,
      quietStart: data.quietStart || '',
      quietEnd: data.quietEnd || '',
      skipDays: data.skipDays !== undefined ? Number(data.skipDays) : 7,
      humanTyping: data.humanTyping !== false,
      useEmojis: data.useEmojis !== false,
      schedule: data.schedule || null,
      scheduleEnabled: !!data.scheduleEnabled,
      status: 'draft',
      createdAt: new Date().toISOString(),
      stats: { sent: 0, skipped: 0, failed: 0, total: 0 }
    };
    this.campaigns[id] = campaign;
    await this._saveCampaigns();
    if (campaign.scheduleEnabled && campaign.schedule) this._setupCron(campaign);
    return campaign;
  }

  async update(id, data) {
    const c = this.campaigns[id];
    if (!c) throw new Error('campaign not found');
    let sessionIds = data.sessionIds || c.sessionIds || (c.sessionId ? [c.sessionId] : []);
    if (data.sessionId && !data.sessionIds) sessionIds = [data.sessionId];
    Object.assign(c, {
      name: data.name ?? c.name,
      message: data.message ?? c.message,
      numbers: data.numbers ?? c.numbers,
      contacts: data.contacts ?? c.contacts,
      delayMin: data.delayMin ?? c.delayMin,
      delayMax: data.delayMax ?? c.delayMax,
      skipDays: data.skipDays ?? c.skipDays,
      humanTyping: data.humanTyping ?? c.humanTyping,
      useEmojis: data.useEmojis ?? c.useEmojis,
      schedule: data.schedule ?? c.schedule,
      scheduleEnabled: data.scheduleEnabled ?? c.scheduleEnabled,
      sessionId: sessionIds[0] || c.sessionId,
      sessionIds
    });
    await this._saveCampaigns();
    if (this.cronJobs.has(id)) { this.cronJobs.get(id).stop(); this.cronJobs.delete(id); }
    if (c.scheduleEnabled && c.schedule) this._setupCron(c);
    return c;
  }

  async delete(id) {
    if (this.running.has(id)) { this.running.get(id).abort = true; this.running.delete(id); }
    if (this.cronJobs.has(id)) { this.cronJobs.get(id).stop(); this.cronJobs.delete(id); }
    delete this.campaigns[id];
    await this._saveCampaigns();
  }

  _setupCron(campaign) {
    try {
      if (!cron.validate(campaign.schedule)) return;
      const job = cron.schedule(campaign.schedule, () => {
        this.start(campaign.id).catch(e => console.error('[CAMPAIGN]', e.message));
      }, { scheduled: true });
      this.cronJobs.set(campaign.id, job);
    } catch (e) {
      console.error('[CAMPAIGN] cron', e.message);
    }
  }

  _shouldSkip(phone, skipDays) {
    if (!skipDays || skipDays <= 0) return false;
    const entry = this.sentLog[phone];
    if (!entry?.lastSent) return false;
    return (Date.now() - entry.lastSent) < skipDays * 86400000;
  }

  _nameFor(phone, campaign) {
    const c = (campaign.contacts || []).find(x => digitsOnly(x.phone) === phone);
    if (c?.name) return c.name;
    return '';
  }

  async start(id) {
    try { analytics.track({ category: 'campaign', action: 'start', success: true }); } catch {}
    const campaign = this.campaigns[id];
    if (!campaign) throw new Error('campaign not found');
    if (this.running.has(id)) throw new Error('already running');

    const sessionIds = (campaign.sessionIds?.length ? campaign.sessionIds : [campaign.sessionId]).filter(Boolean);
    if (!sessionIds.length) throw new Error('no session');

    // build recipient list
    let entries = [];
    if (campaign.contacts?.length) {
      entries = campaign.contacts.map(c => ({ phone: digitsOnly(c.phone), name: c.name || '' })).filter(e => e.phone.length >= 8);
    } else {
      entries = [...new Set((campaign.numbers || []).map(digitsOnly).filter(n => n.length >= 8))]
        .map(phone => ({ phone, name: '' }));
    }
    if (!entries.length) throw new Error('no numbers');

    const stats = { sent: 0, skipped: 0, failed: 0, total: entries.length };
    const state = { abort: false, stats };
    this.running.set(id, state);
    campaign.status = 'running';
    campaign.stats = stats;
    await this._saveCampaigns();
    this._emit('campaign-update', { id, status: 'running', stats });

    (async () => {
      let sessionIndex = 0;
      for (let i = 0; i < entries.length; i++) {
        if (state.abort) break;
        const { phone, name } = entries[i];
        const jid = toJid(phone);

        if (this._shouldSkip(phone, campaign.skipDays)) {
          stats.skipped++;
          this._emit('campaign-progress', { id, phone, status: 'skipped', stats });
          continue;
        }

        // pick least-fatigued online session (anti-ban rotation)
        const sessionId = safeSend.pickSession(sessionIds, (id) => {
          try { return sessionManager.getSocket(id); } catch { return null; }
        });
        if (!sessionId) {
          stats.failed++;
          this._emit('campaign-progress', { id, phone, status: 'no_session', stats });
          await safeSend.sleep(15_000);
          continue;
        }
        sessionIndex++;
        let sock;
        try {
          sock = sessionManager.getSocket(sessionId);
          if (!sock) throw new Error('offline');
        } catch (e) {
          stats.failed++;
          this._emit('campaign-progress', { id, phone, status: 'no_session', error: e.message, stats });
          continue;
        }

        try {
          let exists = true;
          try {
            const [check] = await sock.onWhatsApp(phone);
            exists = !!check?.exists;
          } catch {}

          if (!exists) {
            stats.failed++;
            this._emit('campaign-progress', { id, phone, status: 'not_on_wa', stats });
            continue;
          }

          let body = applyTemplate(campaign.message, { name, first_name: (name || '').split(/\s+/)[0], phone });
          body = varyMessage(body, campaign.useEmojis);

          const profile = safeSend.resolveProfile(campaign.safeProfile || 'balanced', {
            delayMin: campaign.delayMin,
            delayMax: campaign.delayMax,
            ...(campaign.maxPerHour ? { maxPerHour: campaign.maxPerHour } : {}),
            ...(campaign.maxPerDay ? { maxPerDay: campaign.maxPerDay } : {})
          });

          if (safeSend.inQuietHours(campaign.quietStart, campaign.quietEnd)) {
            await safeSend.sleep(30_000);
            i--;
            continue;
          }

          const gate = safeSend.canSend(sessionId, profile);
          if (!gate.ok) {
            this._emit('campaign-progress', { id, phone, status: 'rate_wait', reason: gate.reason, stats, sessionId });
            await safeSend.sleep(Math.min(gate.waitMs || 60_000, 180_000));
            i--;
            continue;
          }

          body = safeSend.varyText(body, { emojiVary: campaign.useEmojis !== false });

          if (campaign.humanTyping !== false) {
            await safeSend.humanPresence(sock, jid, body, profile);
          }

          await sock.sendMessage(jid, { text: body });
          await safeSend.afterSendPresence(sock, jid, profile);
          safeSend.recordSuccess(sessionId);

          this.sentLog[phone] = { lastSent: Date.now(), campaignId: id, campaignName: campaign.name, sessionId };
          stats.sent++;
          this._emit('campaign-progress', { id, phone, status: 'sent', stats, message: body, sessionId });
        } catch (e) {
          try { safeSend.recordError(sessionId, e.message); } catch {}
          stats.failed++;
          this._emit('campaign-progress', { id, phone, status: 'error', error: e.message, stats });
        }

        if (i < entries.length - 1 && !state.abort) {
          const profile2 = safeSend.resolveProfile(campaign.safeProfile || 'balanced', {
            delayMin: campaign.delayMin,
            delayMax: campaign.delayMax
          });
          const delay = safeSend.nextDelayMs(sessionId, profile2);
          await safeSend.sleep(delay);
        }
      }

      this.running.delete(id);
      campaign.status = state.abort ? 'stopped' : 'completed';
      campaign.stats = stats;
      campaign.completedAt = new Date().toISOString();
      await this._saveCampaigns();
      await this._saveSentLog();
      this._emit('campaign-update', { id, status: campaign.status, stats });
    })();

    return { id, status: 'running', stats };
  }

  stop(id) {
    try { analytics.track({ category: 'campaign', action: 'stop', success: true }); } catch {}
    const state = this.running.get(id);
    if (state) { state.abort = true; return true; }
    return false;
  }
}

export default new CampaignsService();
