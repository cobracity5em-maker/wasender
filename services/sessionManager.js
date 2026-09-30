/**
 * Session Manager - ניהול סשנים מרובים של WhatsApp
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import QRCode from 'qrcode';
import analytics from './analytics.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
const DATA_FILE = path.join(__dirname, '..', 'data', 'sessions.json');

const logger = pino({ level: 'silent' });

class SessionManager {
  constructor() {
    this.sessions = new Map(); // id -> { sock, status, qr, meta }
    this.io = null;
    this.meta = {};
    this._loadMeta();
  }

  setIO(io) {
    this.io = io;
  }

  async _loadMeta() {
    try {
      if (await fs.pathExists(DATA_FILE)) {
        this.meta = await fs.readJson(DATA_FILE);
      }
    } catch {
      this.meta = {};
    }
  }

  async _saveMeta() {
    await fs.ensureDir(path.dirname(DATA_FILE));
    await fs.writeJson(DATA_FILE, this.meta, { spaces: 2 });
  }

  _emit(sessionId, event, data) {
    if (this.io) {
      this.io.to(`session-${sessionId}`).emit(event, data);
      this.io.emit('session-update', { sessionId, event, data });
    }
    try {
      if (event === 'status' || event === 'connection') {
        const st = (data && (data.status || data.connection)) || '';
        if (st === 'open' || st === 'connected') {
          analytics.track({ category: 'session', action: 'connected', sessionId, success: true });
        } else if (st === 'close' || st === 'disconnected') {
          analytics.track({ category: 'session', action: 'disconnected', sessionId, success: true });
        }
      }
      if (event === 'qr') analytics.track({ category: 'session', action: 'qr', sessionId, success: true });
    } catch {}
  }

  async listSessions() {
    const list = [];
    for (const [id, meta] of Object.entries(this.meta)) {
      const live = this.sessions.get(id);
      let status = live ? live.status : 'stopped';
      const phone = live?.phone || meta.phone || null;
      // if socket exists and user is known, treat as connected
      if (live?.sock && phone && status !== 'qr') status = 'connected';
      if (live?.sock && !status) status = 'connected';
      list.push({
        id,
        name: meta.name,
        label: meta.label,
        createdAt: meta.createdAt,
        status,
        phone,
        hasQR: !!(live && live.qr),
        online: status === 'connected' || status === 'open' || status === 'ready'
      });
    }
    return list;
  }

  async createSession(name, label) {
    try { analytics.track({ category: 'session', action: 'create', success: true, meta: { name } }); } catch {}
    const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (this.meta[id]) {
      throw new Error('סשן עם שם זה כבר קיים');
    }
    this.meta[id] = {
      name: id,
      label: label || id,
      createdAt: new Date().toISOString(),
      phone: null
    };
    await this._saveMeta();
    await fs.ensureDir(path.join(SESSIONS_DIR, id));
    return { id, ...this.meta[id], status: 'stopped' };
  }

  async startSession(id) {
    if (!this.meta[id]) throw new Error('סשן לא קיים');
    if (this.sessions.has(id) && this.sessions.get(id).status === 'connected') {
      return { status: 'already_connected' };
    }

    const authPath = path.join(SESSIONS_DIR, id);
    await fs.ensureDir(authPath);

    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      printQRInTerminal: false,
      logger,
      browser: ['WASender', 'Chrome', '2.0.0'],
      generateHighQualityLinkPreview: true,
      syncFullHistory: true,
      shouldSyncHistoryMessage: () => true,
      markOnlineOnConnect: true,
      getMessage: async () => undefined
    });

    const sessionData = {
      sock,
      status: 'connecting',
      qr: null,
      phone: null,
      saveCreds,
      contactBook: {},
      chatIndex: {},
      // local store — Baileys 6 no longer ships makeInMemoryStore by default
      chatsMap: new Map(),
      contactsMap: new Map()
    };
    try {
      const cached = this.loadContactCache(id) || {};
      sessionData.contactBook = { ...cached };
    } catch {}
    this.sessions.set(id, sessionData);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          sessionData.qr = qrDataUrl;
          sessionData.status = 'qr';
          this._emit(id, 'qr', { qr: qrDataUrl });
          this._emit(id, 'status', { status: 'qr' });
        } catch (e) {
          console.error('[QR]', e.message);
        }
      }

      if (connection === 'open') {
        sessionData.status = 'connected';
        try { analytics.track({ category: 'session', action: 'connected', sessionId: id, success: true }); } catch {}
        sessionData.qr = null;
        const phone = sock.user?.id?.split(':')[0] || sock.user?.id || null;
        sessionData.phone = phone;
        this.meta[id].phone = phone;
        await this._saveMeta();
        this._emit(id, 'status', { status: 'connected', phone });
        console.log(`[SESSION] ${id} מחובר | ${phone}`);
        // history/contacts keep arriving for a while after open
        setTimeout(() => {
          try {
            const n = Object.keys(sessionData.contactBook || {}).length;
            console.log(`[SESSION] ${id} contactBook size=${n}`);
            this._persistContactBook(id);
          } catch {}
        }, 8000);
        setTimeout(() => {
          try {
            const n = Object.keys(sessionData.contactBook || {}).length;
            console.log(`[SESSION] ${id} contactBook size=${n} (late)`);
            this._persistContactBook(id);
          } catch {}
        }, 25000);
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error?.output?.statusCode != null)
          ? lastDisconnect.error.output?.statusCode
          : 0;
        const shouldReconnect = code !== DisconnectReason.loggedOut;

        sessionData.status = 'disconnected';
        this._emit(id, 'status', { status: 'disconnected', code });

        if (shouldReconnect) {
          console.log(`[SESSION] ${id} מתנתק - מנסה להתחבר מחדש...`);
          setTimeout(() => this.startSession(id).catch(() => {}), 3000);
        } else {
          console.log(`[SESSION] ${id} התנתק (logged out)`);
          this.sessions.delete(id);
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    const ingestContact = async (c, source = 'contact') => {
      if (!c) return;
      try {
        let phone = null;
        const cid = c.id || c.jid || null;

        // 1) explicit phone fields
        if (c.phoneNumber) phone = String(c.phoneNumber).split('@')[0].split(':')[0].replace(/\D/g, '');
        if (!phone && c.phone) phone = String(c.phone).split('@')[0].split(':')[0].replace(/\D/g, '');
        if (!phone && c.senderPn) phone = String(c.senderPn).split('@')[0].split(':')[0].replace(/\D/g, '');

        // 2) classic PN jid
        if (!phone && cid && (String(cid).includes('@s.whatsapp.net') || String(cid).includes('@c.us'))) {
          phone = String(cid).split('@')[0].split(':')[0].replace(/\D/g, '');
        }

        // 3) remoteJidAlt / participantAlt (LID era — real phone jid)
        if (!phone) {
          for (const key of ['remoteJidAlt', 'participantAlt', 'participantPn', 'jidPn']) {
            const v = c[key];
            if (!v) continue;
            if (String(v).includes('@s.whatsapp.net') || String(v).includes('@c.us')) {
              phone = String(v).split('@')[0].split(':')[0].replace(/\D/g, '');
              if (phone) break;
            }
            const d = String(v).replace(/\D/g, '');
            if (d.length >= 8 && d.length <= 15 && !String(v).includes('@lid')) {
              phone = d;
              break;
            }
          }
        }

        // 4) LID mapping
        if (!phone && cid && String(cid).includes('@lid')) {
          try {
            const mapping = sock.signalRepository?.lidMapping;
            if (mapping?.getPNForLID) {
              const pn = await mapping.getPNForLID(cid);
              if (pn) phone = String(pn).split('@')[0].split(':')[0].replace(/\D/g, '');
            }
          } catch {}
        }

        // Accept 8–15 digits (same as working version)
        if (!phone || phone.length < 8 || phone.length > 15) return;

        const name = String(c.name || c.notify || c.verifiedName || c.pushName || c.fullName || '').trim();
        const prev = sessionData.contactBook[phone];
        sessionData.contactBook[phone] = {
          phone,
          name: name || prev?.name || '',
          source: source || prev?.source || 'contact',
          jid: (cid && String(cid).includes('@s.whatsapp.net')) ? cid : (prev?.jid || null),
          lid: (cid && String(cid).includes('@lid')) ? cid : (prev?.lid || null)
        };
        if (cid && !String(cid).endsWith('@g.us') && !String(cid).endsWith('@broadcast')) {
          sessionData.chatIndex[cid] = {
            phone,
            name: name || sessionData.chatIndex[cid]?.name || '',
            source: source || 'chat'
          };
          try { sessionData.chatsMap.set(cid, { id: cid, name, phone }); } catch {}
        }
      } catch {}
    };

    sock.ev.on('contacts.upsert', async (list) => {
      console.log(`[SESSION] ${id} contacts.upsert +${(list || []).length}`);
      for (const c of list || []) {
        await ingestContact(c, 'contact');
        try { if (c?.id) sessionData.contactsMap.set(c.id, c); } catch {}
      }
      this._persistContactBook(id);
    });
    sock.ev.on('contacts.update', async (list) => {
      for (const c of list || []) {
        await ingestContact(c, 'contact');
        try { if (c?.id) sessionData.contactsMap.set(c.id, c); } catch {}
      }
      this._persistContactBook(id);
    });
    sock.ev.on('chats.upsert', async (list) => {
      for (const ch of list || []) {
        const jid = ch?.id;
        if (!jid || String(jid).endsWith('@g.us') || String(jid).endsWith('@broadcast')) continue;
        await ingestContact({
          id: jid,
          name: ch.name || ch.pushName || ch.notify || '',
          phoneNumber: ch.phoneNumber || ch.pnAddressingMode || undefined,
          remoteJidAlt: ch.jidPn || ch.pnJid || ch.senderPn || ch.remoteJidAlt || undefined,
          senderPn: ch.senderPn || undefined
        }, 'chat');
        try { sessionData.chatsMap.set(jid, ch); } catch {}
      }
      this._persistContactBook(id);
    });
    sock.ev.on('chats.set', async (payload) => {
      const chats = payload?.chats || payload || [];
      console.log(`[SESSION] ${id} chats.set +${(chats || []).length}`);
      for (const ch of chats || []) {
        const jid = ch?.id;
        if (!jid || String(jid).endsWith('@g.us') || String(jid).endsWith('@broadcast')) continue;
        await ingestContact({
          id: jid,
          name: ch.name || ch.pushName || '',
          phoneNumber: ch.phoneNumber || undefined,
          remoteJidAlt: ch.jidPn || ch.pnJid || ch.senderPn || ch.remoteJidAlt || undefined,
          senderPn: ch.senderPn || undefined
        }, 'chat');
        try { sessionData.chatsMap.set(jid, ch); } catch {}
      }
      this._persistContactBook(id);
    });
    sock.ev.on('messaging-history.set', async (data) => {
      try {
        const contacts = data?.contacts || [];
        const chats = data?.chats || [];
        const messages = data?.messages || [];
        console.log(`[SESSION] ${id} history set: contacts=${contacts.length} chats=${chats.length} msgs=${messages.length}`);
        for (const c of contacts) await ingestContact(c, 'history');
        for (const ch of chats) {
          if (!ch?.id || String(ch.id).endsWith('@g.us') || String(ch.id).endsWith('@broadcast')) continue;
          await ingestContact({
            id: ch.id,
            name: ch.name || ch.pushName || '',
            phoneNumber: ch.phoneNumber,
            remoteJidAlt: ch.jidPn || ch.pnJid || ch.senderPn || ch.remoteJidAlt
          }, 'history');
          try { sessionData.chatsMap.set(ch.id, ch); } catch {}
        }
        for (const msg of messages) {
          try {
            const key = msg.key || {};
            const jid = key.remoteJid;
            const alt = key.remoteJidAlt || key.senderPn;
            if (jid && !String(jid).endsWith('@g.us')) {
              await ingestContact({
                id: jid,
                remoteJidAlt: alt,
                phoneNumber: alt && String(alt).includes('@s.whatsapp.net') ? alt : undefined,
                name: msg.pushName || ''
              }, 'history-msg');
            }
            if (alt) await ingestContact({ id: alt, name: msg.pushName || '' }, 'history-msg');
          } catch {}
        }
        this._persistContactBook(id);
      } catch (e) { console.error('[history]', e.message); }
    });

    sock.ev.on('messages.upsert', async (m) => {
      const mapped = [];
      for (const msg of (m.messages || [])) {
        if (!msg.message) continue;
        const body = msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          (msg.message?.stickerMessage ? '[סטיקר]' : null) ||
          (msg.message?.audioMessage ? '[אודיו]' : null) ||
          (msg.message?.documentMessage ? '[קובץ]' : null) ||
          '[מדיה]';
        const entry = {
          id: msg.key?.id,
          from: msg.key?.remoteJid,
          fromMe: msg.key?.fromMe,
          body,
          pushName: msg.pushName || null,
          timestamp: (msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now())
        };
        mapped.push(entry);
                // index chat — prefer phone from remoteJidAlt / senderPn (LID era)
        try {
          const key = msg.key || {};
          const jid = key.remoteJid;
          const alt = key.remoteJidAlt || key.senderPn || null;
          if (jid && !String(jid).endsWith('@g.us') && !String(jid).endsWith('@broadcast') && jid !== 'status@broadcast') {
            await ingestContact({
              id: jid,
              phoneNumber: alt && String(alt).includes('@s.whatsapp.net') ? alt : undefined,
              remoteJidAlt: alt || undefined,
              name: msg.pushName || '',
              notify: msg.pushName || '',
              pushName: msg.pushName || ''
            }, 'chat');
          }
          if (alt && String(alt).includes('@s.whatsapp.net')) {
            await ingestContact({
              id: alt,
              name: msg.pushName || '',
              notify: msg.pushName || ''
            }, 'chat');
          }
          const part = key.participant || null;
          const partAlt = key.participantAlt || key.participantPn || null;
          if (partAlt && String(partAlt).includes('@s.whatsapp.net')) {
            await ingestContact({ id: partAlt, name: msg.pushName || '' }, 'group-participant');
          } else if (part && String(part).includes('@s.whatsapp.net')) {
            await ingestContact({ id: part, name: msg.pushName || '' }, 'group-participant');
          }
        } catch {}
        try {
          const { default: mailbox } = await import('./mailbox.js');
          mailbox.addMessage(id, this.meta[id]?.label || id, msg);
        } catch (e) {}
      }
      this._emit(id, 'message', { messages: mapped });
      try { if ((m.messages || []).length) this._persistContactBook(id); } catch {}
    });

    return { status: 'starting' };
  }

  async stopSession(id) {
    const s = this.sessions.get(id);
    if (s?.sock) {
      try {
        s.sock.end(undefined);
      } catch {}
    }
    this.sessions.delete(id);
    this._emit(id, 'status', { status: 'stopped' });
  }

  async deleteSession(id) {
    await this.stopSession(id);
    delete this.meta[id];
    await this._saveMeta();
    const authPath = path.join(SESSIONS_DIR, id);
    if (await fs.pathExists(authPath)) {
      await fs.remove(authPath);
    }
  }

  async getStatus(id) {
    const live = this.sessions.get(id);
    const meta = this.meta[id];
    if (!meta) throw new Error('סשן לא קיים');
    return {
      id,
      status: live?.status || 'stopped',
      phone: live?.phone || meta.phone,
      hasQR: !!(live?.qr)
    };
  }

  async getQR(id) {
    const s = this.sessions.get(id);
    if (!s) return null;
    return s.qr;
  }

  getSocket(id) {
    const s = this.sessions.get(id);
    if (!s || s.status !== 'connected') {
      throw new Error(`סשן ${id} לא מחובר`);
    }
    return s.sock;
  }

  getActiveCount() {
    let n = 0;
    for (const s of this.sessions.values()) {
      if (s.status === 'connected') n++;
    }
    return n;
  }

  async stopAll() {
    for (const id of [...this.sessions.keys()]) {
      await this.stopSession(id);
    }
  }

  getConnectedSessionIds() {
    const ids = [];
    for (const [id, s] of this.sessions) {
      if (s.status === 'connected') ids.push(id);
    }
    return ids;
  }

  getContactBook(sessionId) {
    const s = this.sessions.get(sessionId);
    if (s?.contactBook && Object.keys(s.contactBook).length) return s.contactBook;
    return this.loadContactCache(sessionId) || {};
  }

  getChatIndex(sessionId) {
    return this.sessions.get(sessionId)?.chatIndex || {};
  }

  loadContactCache(sessionId) {
    try {
      const f = path.join(SESSIONS_DIR, sessionId, 'contacts-cache.json');
      if (fs.existsSync(f)) return fs.readJsonSync(f);
    } catch {}
    return {};
  }

  _persistContactBook(sessionId) {
    try {
      const s = this.sessions.get(sessionId);
      if (!s?.contactBook) return;
      const dir = path.join(SESSIONS_DIR, sessionId);
      fs.ensureDirSync(dir);
      fs.writeJsonSync(path.join(dir, 'contacts-cache.json'), s.contactBook, { spaces: 0 });
    } catch {}
  }

  getSessionData(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /** Deep harvest: maps + LID resolve + ALL group participants */
  async harvestContacts(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s?.sock) throw new Error('session offline');
    const sock = s.sock;
    const takeDigits = (v) => {
      if (v == null || v === '') return null;
      const str = String(v);
      if (str.includes('@lid')) return null;
      const raw = str.includes('@') ? str.split('@')[0].split(':')[0] : str;
      let d = raw.replace(/\D/g, '');
      if (/^0\d{8,9}$/.test(d)) d = '972' + d.slice(1);
      return (d.length >= 8 && d.length <= 15) ? d : null;
    };
    const put = (phone, name, source, extra = {}) => {
      if (!phone) return;
      const prev = s.contactBook[phone];
      s.contactBook[phone] = {
        phone,
        name: (name || prev?.name || ''),
        source: source || prev?.source || 'harvest',
        jid: extra.jid || prev?.jid || null,
        lid: extra.lid || prev?.lid || null
      };
    };

    // 1) chatIndex LIDs
    for (const [jid, meta] of Object.entries(s.chatIndex || {})) {
      if (meta?.phone) { put(meta.phone, meta.name, 'chatIndex'); continue; }
      let d = takeDigits(jid);
      if (!d && String(jid).includes('@lid')) {
        try {
          const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(jid);
          d = takeDigits(pn);
        } catch {}
      }
      if (d) {
        if (s.chatIndex[jid]) s.chatIndex[jid].phone = d;
        put(d, meta?.name, 'chatIndex', { lid: String(jid).includes('@lid') ? jid : null, jid: String(jid).includes('@s.whatsapp.net') ? jid : null });
      }
    }

    // 2) contactsMap
    for (const [jid, c] of (s.contactsMap || new Map()).entries()) {
      let d = takeDigits(c?.phoneNumber || c?.phone || jid);
      if (!d && String(jid).includes('@lid')) {
        try { d = takeDigits(await sock.signalRepository?.lidMapping?.getPNForLID?.(jid)); } catch {}
      }
      if (d) put(d, c?.name || c?.notify || c?.verifiedName || '', 'contactsMap', {
        jid: String(jid).includes('@s.whatsapp.net') ? jid : null,
        lid: String(jid).includes('@lid') ? jid : null
      });
    }

    // 3) chatsMap
    for (const [jid, ch] of (s.chatsMap || new Map()).entries()) {
      if (String(jid).endsWith('@g.us')) continue;
      let d = takeDigits(ch?.phoneNumber || ch?.phone || jid);
      if (!d) d = takeDigits(ch?.senderPn || ch?.remoteJidAlt || ch?.jidPn);
      if (!d && String(jid).includes('@lid')) {
        try { d = takeDigits(await sock.signalRepository?.lidMapping?.getPNForLID?.(jid)); } catch {}
      }
      if (d) put(d, ch?.name || ch?.pushName || '', 'chatsMap');
    }

    // 4) LID mapping dump
    try {
      const dumped = await this.dumpLidMappings(sessionId);
      for (const r of dumped || []) put(r.phone, '', r.source || 'lid-dump');
    } catch {}

    // 5) ALL groups — participants often carry real PN / Alt (biggest source of numbers)
    try {
      const groups = await sock.groupFetchAllParticipating();
      const entries = groups ? Object.entries(groups) : [];
      console.log(`[SESSION] ${sessionId} groups participating: ${entries.length}`);
      for (const [gid, meta] of entries) {
        const parts = meta?.participants || [];
        for (const p of parts) {
          const id = p?.id || p?.jid || p;
          const phoneField = p?.phoneNumber || p?.notify || null;
          let d = takeDigits(phoneField) || takeDigits(id);
          // participant might be LID
          if (!d && id && String(id).includes('@lid')) {
            try { d = takeDigits(await sock.signalRepository?.lidMapping?.getPNForLID?.(String(id))); } catch {}
          }
          // sometimes phone is on p.jidPn / admin fields
          if (!d) d = takeDigits(p?.jidPn || p?.participantPn || p?.alt);
          if (d) put(d, p?.name || meta?.subject || '', 'group-participant', {
            jid: String(id).includes('@s.whatsapp.net') ? String(id) : null,
            lid: String(id).includes('@lid') ? String(id) : null
          });
        }
        // skip per-group groupMetadata (too slow on large accounts)
      }
    } catch (e) {
      console.error(`[SESSION] ${sessionId} group harvest failed:`, e.message);
    }

    this._persistContactBook(sessionId);
    const diag = {
      contactBook: Object.keys(s.contactBook || {}).length,
      chatsMap: s.chatsMap?.size || 0,
      contactsMap: s.contactsMap?.size || 0,
      chatIndex: Object.keys(s.chatIndex || {}).length
    };
    console.log(`[SESSION] ${sessionId} harvest done`, diag);
    return Object.values(s.contactBook || {});
  }

  mergeContactBook(sessionId, rows) {
    const s = this.sessions.get(sessionId);
    // ALWAYS union disk + memory so we never shrink the book
    const disk = this.loadContactCache(sessionId) || {};
    const mem = (s?.contactBook) || {};
    const book = { ...disk, ...mem };
    for (const r of rows || []) {
      let phone = String(r.phone || '').replace(/\D/g, '');
      if (phone.startsWith('0') && phone.length >= 9 && phone.length <= 10) {
        phone = '972' + phone.slice(1);
      }
      if (!phone || phone.length < 8 || phone.length > 15) continue;
      const prev = book[phone];
      book[phone] = {
        phone,
        name: (r.name || prev?.name || ''),
        source: r.source || prev?.source || 'merge',
        jid: r.jid || prev?.jid || null,
        lid: r.lid || prev?.lid || null
      };
    }
    if (s) s.contactBook = book;
    try {
      const dir = path.join(SESSIONS_DIR, sessionId);
      fs.ensureDirSync(dir);
      fs.writeJsonSync(path.join(dir, 'contacts-cache.json'), book, { spaces: 0 });
    } catch {}
    return book;
  }

  /**
   * Dump every LID→PN entry Baileys has cached (internal maps differ by version)
   */
  async dumpLidMappings(sessionId) {
    const s = this.sessions.get(sessionId);
    const sock = s?.sock;
    if (!sock) return [];
    const out = [];
    const mapping = sock.signalRepository?.lidMapping;
    if (!mapping) return out;
    const take = (v) => {
      if (!v) return null;
      const str = String(v);
      if (str.includes('@lid')) return null;
      const raw = str.includes('@') ? str.split('@')[0].split(':')[0] : str;
      const d = raw.replace(/\D/g, '');
      return (d.length >= 8 && d.length <= 15) ? d : null;
    };
    try {
      // common internal shapes across baileys versions
      const candidates = [
        mapping.pnToLIDMap, mapping.lidToPNMap, mapping.lidsToPns, mapping.pnsToLids,
        mapping._pnToLid, mapping._lidToPn, mapping.cache, mapping.store,
        mapping.map, mapping.mappings, mapping.lidMappings
      ];
      for (const m of candidates) {
        if (!m) continue;
        const entries = m instanceof Map ? m.entries() : Object.entries(m);
        for (const [k, v] of entries) {
          const ks = String(k);
          const vs = v && typeof v === 'object' ? (v.pn || v.phone || v.jid || v.id || JSON.stringify(v)) : v;
          let phone = null;
          let lid = null;
          if (ks.includes('@lid') || ks.includes('lid')) {
            lid = ks;
            phone = take(vs);
          } else if (String(vs).includes('@lid')) {
            lid = String(vs);
            phone = take(ks);
          } else {
            phone = take(ks) || take(vs);
          }
          if (phone) out.push({ phone, lid, source: 'lid-dump' });
        }
      }
      // function to enumerate if exists
      if (typeof mapping.getAll === 'function') {
        try {
          const all = await mapping.getAll();
          for (const [k, v] of (all instanceof Map ? all.entries() : Object.entries(all || {}))) {
            const phone = take(k) || take(v);
            if (phone) out.push({ phone, source: 'lid-getAll' });
          }
        } catch {}
      }
    } catch (e) {
      console.error('[LID dump]', e.message);
    }
    console.log('[SESSION] lid dump count', out.length, 'keys on mapping', mapping ? Object.keys(mapping) : []);
    return out;
  }
}


export default new SessionManager();
