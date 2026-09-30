/**
 * Auth — users, login tokens, device binding, expiry, admin control
 * Storage: data/users.json + data/auth-tokens.json
 */
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TOKENS_FILE = path.join(DATA_DIR, 'auth-tokens.json');

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 min lockout
const failedLogins = new Map(); // username|ip -> { count, lockedUntil }

function failKey(username, ip) {
  return String(username || '').toLowerCase() + '|' + String(ip || '');
}

function isDefaultAdminPassword(user, password) {
  return user.role === 'admin' && user.username === 'admin' && password === 'admin123';
}

function assertStrongPassword(password, { isAdmin = false } = {}) {
  const p = String(password || '');
  if (p.length < 6) throw new Error('password_short');
  if (isAdmin) {
    if (p.length < 8) throw new Error('password_weak');
    if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) throw new Error('password_weak');
  }
  if (['admin123', 'password', '123456', '12345678', 'qwerty'].includes(p.toLowerCase())) {
    throw new Error('password_weak');
  }
}


function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  try {
    const h = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

function uid() {
  return crypto.randomBytes(12).toString('hex');
}

function tokenId() {
  return crypto.randomBytes(32).toString('hex');
}

class AuthService {
  constructor() {
    this.users = [];
    this.tokens = {}; // token -> { userId, deviceId, createdAt, expiresAt }
    this._ready = this._load();
  }

  async _load() {
    await fs.ensureDir(DATA_DIR);
    try {
      if (await fs.pathExists(USERS_FILE)) {
        const data = await fs.readJson(USERS_FILE);
        this.users = Array.isArray(data.users) ? data.users : [];
      }
    } catch {
      this.users = [];
    }
    try {
      if (await fs.pathExists(TOKENS_FILE)) {
        this.tokens = await fs.readJson(TOKENS_FILE);
      }
    } catch {
      this.tokens = {};
    }
    // Seed default admin
    if (!this.users.find(u => u.role === 'admin')) {
      const { salt, hash } = hashPassword('admin123');
      this.users.push({
        id: uid(),
        username: 'admin',
        salt,
        hash,
        role: 'admin',
        enabled: true,
        expiresAt: null, // never
        maxDevices: 5,
        devices: [],
        note: 'Default admin — change password',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await this._saveUsers();
      console.log('[AUTH] Default admin created: admin / admin123');
    }
    // purge expired tokens
    const now = Date.now();
    let changed = false;
    for (const [t, row] of Object.entries(this.tokens)) {
      if (row.expiresAt && row.expiresAt < now) {
        delete this.tokens[t];
        changed = true;
      }
    }
    if (changed) await this._saveTokens();
  }

  async ready() {
    await this._ready;
  }

  async _saveUsers() {
    await fs.writeJson(USERS_FILE, { users: this.users }, { spaces: 2 });
  }

  async _saveTokens() {
    await fs.writeJson(TOKENS_FILE, this.tokens, { spaces: 0 });
  }

  findByUsername(username) {
    const u = String(username || '').trim().toLowerCase();
    return this.users.find(x => x.username.toLowerCase() === u) || null;
  }

  findById(id) {
    return this.users.find(x => x.id === id) || null;
  }

  isExpired(user) {
    if (!user.expiresAt) return false;
    return new Date(user.expiresAt).getTime() < Date.now();
  }

  publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      enabled: !!user.enabled,
      expiresAt: user.expiresAt || null,
      maxDevices: user.maxDevices ?? 1,
      deviceCount: (user.devices || []).length,
      devices: (user.devices || []).map(d => ({
        id: d.id,
        label: d.label || d.id.slice(0, 8),
        lastSeen: d.lastSeen,
        createdAt: d.createdAt
      })),
      note: user.note || '',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  /**
   * Login
   * @returns {{ token, user } | { error }}
   */
  async login(username, password, deviceId, deviceLabel = '', ip = '') {
    await this.ready();
    const key = failKey(username, ip);
    const fail = failedLogins.get(key) || { count: 0, lockedUntil: 0 };
    if (fail.lockedUntil && fail.lockedUntil > Date.now()) {
      return { error: 'account_locked', status: 429, meta: { retryAfterSec: Math.ceil((fail.lockedUntil - Date.now()) / 1000) } };
    }

    const user = this.findByUsername(username);
    if (!user) {
      fail.count++;
      if (fail.count >= MAX_FAILED) fail.lockedUntil = Date.now() + LOCK_MS;
      failedLogins.set(key, fail);
      return { error: 'invalid_credentials', status: 401 };
    }
    if (!verifyPassword(password, user.salt, user.hash)) {
      fail.count++;
      if (fail.count >= MAX_FAILED) fail.lockedUntil = Date.now() + LOCK_MS;
      failedLogins.set(key, fail);
      return { error: 'invalid_credentials', status: 401 };
    }
    // success — clear fails
    failedLogins.delete(key);

    if (!user.enabled) return { error: 'account_disabled', status: 403 };
    if (this.isExpired(user)) return { error: 'account_expired', status: 403 };

    const did = String(deviceId || '').trim() || uid();
    user.devices = user.devices || [];
    const max = user.maxDevices ?? 1;
    let device = user.devices.find(d => d.id === did);

    if (!device) {
      if (user.devices.length >= max) {
        return {
          error: 'device_limit',
          status: 403,
          meta: { maxDevices: max, devices: user.devices.map(d => d.label || d.id.slice(0, 8)) }
        };
      }
      device = {
        id: did,
        label: deviceLabel || `Device ${user.devices.length + 1}`,
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      user.devices.push(device);
    } else {
      device.lastSeen = new Date().toISOString();
      if (deviceLabel) device.label = deviceLabel;
    }
    user.updatedAt = new Date().toISOString();
    await this._saveUsers();

    const token = tokenId();
    this.tokens[token] = {
      userId: user.id,
      deviceId: did,
      createdAt: Date.now(),
      expiresAt: Date.now() + TOKEN_TTL_MS
    };
    await this._saveTokens();

    const mustChangePassword = isDefaultAdminPassword(user, password);
    return { token, user: this.publicUser(user), deviceId: did, mustChangePassword };
  }

  async logout(token) {
    if (token && this.tokens[token]) {
      delete this.tokens[token];
      await this._saveTokens();
    }
    return { ok: true };
  }

  async logoutAll(userId) {
    for (const [t, row] of Object.entries(this.tokens)) {
      if (row.userId === userId) delete this.tokens[t];
    }
    await this._saveTokens();
  }

  /**
   * Validate bearer token + optional device binding
   */
  async validate(token, deviceId = null) {
    await this.ready();
    if (!token) return { error: 'unauthorized', status: 401 };
    const row = this.tokens[token];
    if (!row) return { error: 'unauthorized', status: 401 };
    if (row.expiresAt && row.expiresAt < Date.now()) {
      delete this.tokens[token];
      await this._saveTokens();
      return { error: 'session_expired', status: 401 };
    }
    const user = this.findById(row.userId);
    if (!user) return { error: 'unauthorized', status: 401 };
    if (!user.enabled) return { error: 'account_disabled', status: 403 };
    if (this.isExpired(user)) return { error: 'account_expired', status: 403 };
    if (deviceId && row.deviceId && row.deviceId !== deviceId) {
      return { error: 'device_mismatch', status: 403 };
    }
    // touch device
    const dev = (user.devices || []).find(d => d.id === row.deviceId);
    if (dev) dev.lastSeen = new Date().toISOString();
    return { user, tokenRow: row };
  }

  // ——— Admin ops ———

  listUsers() {
    return this.users.map(u => this.publicUser(u));
  }

  async createUser({ username, password, role = 'client', expiresAt = null, maxDevices = 1, note = '', enabled = true }) {
    await this.ready();
    const name = String(username || '').trim().toLowerCase();
    if (!name || name.length < 3) throw new Error('username_short');
    assertStrongPassword(password, { isAdmin: false });
    if (this.findByUsername(name)) throw new Error('username_taken');
    if (role === 'admin') throw new Error('cannot_create_admin'); // only one seeded admin path
    const { salt, hash } = hashPassword(password);
    const user = {
      id: uid(),
      username: name,
      salt,
      hash,
      role: 'client',
      enabled: enabled !== false,
      expiresAt: expiresAt || null,
      maxDevices: Math.max(1, Number(maxDevices) || 1),
      devices: [],
      note: String(note || ''),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.users.push(user);
    await this._saveUsers();
    return this.publicUser(user);
  }

  async updateUser(id, patch = {}) {
    await this.ready();
    const user = this.findById(id);
    if (!user) throw new Error('not_found');
    if (patch.enabled != null) user.enabled = !!patch.enabled;
    if (patch.expiresAt !== undefined) user.expiresAt = patch.expiresAt || null;
    if (patch.maxDevices != null) user.maxDevices = Math.max(1, Number(patch.maxDevices) || 1);
    if (patch.note != null) user.note = String(patch.note);
    if (patch.password) {
      assertStrongPassword(patch.password, { isAdmin: user.role === 'admin' });
      const { salt, hash } = hashPassword(patch.password);
      user.salt = salt;
      user.hash = hash;
      await this.logoutAll(user.id);
    }
    // extend days helper
    if (patch.extendDays) {
      const days = Number(patch.extendDays) || 0;
      if (days > 0) {
        const base = user.expiresAt && new Date(user.expiresAt).getTime() > Date.now()
          ? new Date(user.expiresAt).getTime()
          : Date.now();
        user.expiresAt = new Date(base + days * 86400000).toISOString();
        user.enabled = true;
      }
    }
    user.updatedAt = new Date().toISOString();
    await this._saveUsers();
    return this.publicUser(user);
  }

  async deleteUser(id) {
    await this.ready();
    const user = this.findById(id);
    if (!user) throw new Error('not_found');
    if (user.role === 'admin') throw new Error('cannot_delete_admin');
    this.users = this.users.filter(u => u.id !== id);
    await this.logoutAll(id);
    await this._saveUsers();
    return { ok: true };
  }

  async revokeDevice(userId, deviceId) {
    await this.ready();
    const user = this.findById(userId);
    if (!user) throw new Error('not_found');
    user.devices = (user.devices || []).filter(d => d.id !== deviceId);
    // kill tokens for that device
    for (const [t, row] of Object.entries(this.tokens)) {
      if (row.userId === userId && row.deviceId === deviceId) delete this.tokens[t];
    }
    user.updatedAt = new Date().toISOString();
    await this._saveUsers();
    await this._saveTokens();
    return this.publicUser(user);
  }

  async changePassword(userId, oldPass, newPass) {
    await this.ready();
    const user = this.findById(userId);
    if (!user) throw new Error('not_found');
    if (!verifyPassword(oldPass, user.salt, user.hash)) throw new Error('invalid_credentials');
    assertStrongPassword(newPass, { isAdmin: user.role === 'admin' });
    const { salt, hash } = hashPassword(newPass);
    user.salt = salt;
    user.hash = hash;
    user.updatedAt = new Date().toISOString();
    await this._saveUsers();
    return { ok: true };
  }

  middleware() {
    return async (req, res, next) => {
      try {
        await this.ready();
        const path = req.path || '';
        // public paths
        const open =
          path === '/api/auth/login' ||
          path === '/api/auth/status' ||
          path.startsWith('/login') ||
          path === '/login.html' ||
          path === '/admin.html' ||
          path.endsWith('.css') ||
          path.endsWith('.js') ||
          path.endsWith('.svg') ||
          path.endsWith('.png') ||
          path.endsWith('.ico') ||
          path.endsWith('.woff2');
        // static assets under / are served before this middleware usually
        if (!path.startsWith('/api/')) return next();
        if (path === '/api/auth/login') return next();

        const hdr = req.headers.authorization || '';
        const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : (req.headers['x-auth-token'] || req.query.token || null);
        const deviceId = req.headers['x-device-id'] || null;
        const result = await this.validate(token, deviceId);
        if (result.error) {
          return res.status(result.status || 401).json({ success: false, error: result.error, meta: result.meta });
        }
        req.user = result.user;
        req.authToken = token;
        // admin-only routes
        if (path.startsWith('/api/admin') && result.user.role !== 'admin') {
          return res.status(403).json({ success: false, error: 'admin_only' });
        }
        next();
      } catch (e) {
        res.status(500).json({ success: false, error: e.message });
      }
    };
  }
}

export default new AuthService();
