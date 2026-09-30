/**
 * Analytics — persistent activity log + aggregated stats
 * Uses only node built-ins (no fs-extra) so it never fails init.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(DATA_DIR, 'analytics.json');

const CATEGORIES = [
  'session', 'message', 'campaign', 'warmer', 'mailbox', 'group', 'check', 'system'
];

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

class AnalyticsService {
  constructor() {
    this.events = [];
    this.maxEvents = 5000;
    this._loaded = false;
    this._load();
  }

  _load() {
    try {
      ensureDir(DATA_DIR);
      if (fs.existsSync(LOG_FILE)) {
        const raw = fs.readFileSync(LOG_FILE, 'utf8');
        const data = JSON.parse(raw);
        this.events = Array.isArray(data.events) ? data.events : [];
      }
      this._loaded = true;
    } catch {
      this.events = [];
      this._loaded = true;
    }
  }

  _save() {
    try {
      ensureDir(DATA_DIR);
      if (this.events.length > this.maxEvents) {
        this.events = this.events.slice(-this.maxEvents);
      }
      fs.writeFileSync(LOG_FILE, JSON.stringify({
        events: this.events,
        updatedAt: new Date().toISOString()
      }));
    } catch (e) {
      console.error('[ANALYTICS] save', e.message);
    }
  }

  track(ev = {}) {
    try {
      if (!this._loaded) this._load();
      const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        ts: Date.now(),
        category: CATEGORIES.includes(ev.category) ? ev.category : 'system',
        action: String(ev.action || 'event').slice(0, 80),
        sessionId: ev.sessionId || null,
        success: ev.success !== false,
        count: Number(ev.count || 1) || 1,
        meta: ev.meta && typeof ev.meta === 'object' ? ev.meta : {}
      };
      this.events.push(entry);
      clearTimeout(this._t);
      this._t = setTimeout(() => this._save(), 800);
      return entry;
    } catch (e) {
      console.error('[ANALYTICS] track', e.message);
      return null;
    }
  }

  query({ category = null, action = null, sessionId = null, since = null, until = null, limit = 200 } = {}) {
    try {
      if (!this._loaded) this._load();
      let list = this.events.slice();
      if (category) list = list.filter(e => e.category === category);
      if (action) list = list.filter(e => e.action === action);
      if (sessionId) list = list.filter(e => e.sessionId === sessionId);
      if (since) list = list.filter(e => e.ts >= Number(since));
      if (until) list = list.filter(e => e.ts <= Number(until));
      const lim = Math.min(1000, Number(limit) || 200);
      return list.slice(-lim).reverse();
    } catch {
      return [];
    }
  }

  summary({ since = null } = {}) {
    try {
      if (!this._loaded) this._load();
      const sinceTs = since ? Number(since) : (Date.now() - 7 * 24 * 3600 * 1000);
      const list = this.events.filter(e => e.ts >= sinceTs);
      const byCategory = {};
      const byAction = {};
      let success = 0, fail = 0, totalCount = 0;
      for (const e of list) {
        byCategory[e.category] = (byCategory[e.category] || 0) + 1;
        byAction[e.action] = (byAction[e.action] || 0) + 1;
        if (e.success) success++; else fail++;
        totalCount += e.count || 1;
      }
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const today = list.filter(e => e.ts >= startOfDay.getTime()).length;
      return {
        windowStart: sinceTs,
        totalEvents: list.length,
        totalCount,
        success,
        fail,
        today,
        byCategory,
        byAction,
        recent: list.slice(-12).reverse()
      };
    } catch {
      return {
        windowStart: Date.now(), totalEvents: 0, totalCount: 0,
        success: 0, fail: 0, today: 0, byCategory: {}, byAction: {}, recent: []
      };
    }
  }

  clear() {
    this.events = [];
    this._save();
    return { ok: true };
  }
}

const analyticsService = new AnalyticsService();
export default analyticsService;
