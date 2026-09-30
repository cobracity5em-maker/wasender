/**
 * Unified mailbox — private vs group, session filter, reply
 * LID-safe: never display @lid numeric part as phone; resolve via Alt/PN/contactBook
 */
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import sessionManager from './sessionManager.js';
import analytics from './analytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const MAILBOX_FILE = path.join(DATA_DIR, 'mailbox.json');

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

function isLidJid(jid) {
  return String(jid || '').includes('@lid');
}

function isGroupJid(jid) {
  const s = String(jid || '');
  return s.endsWith('@g.us') || s.includes('@g.us');
}

function isPhoneJid(jid) {
  const s = String(jid || '');
  return s.endsWith('@s.whatsapp.net') || s.endsWith('@c.us');
}

/** Real E.164 phone digits only — reject LID-style garbage */
function isRealPhoneDigits(d) {
  const n = digitsOnly(d);
  if (!n || n.length < 8 || n.length > 15) return false;
  if (/^0+$/.test(n)) return false;
  // LID internals often 14–15 digit blocks that are not valid country numbers
  // Reject pure 15-digit and suspicious 14-digit that aren't known-length country formats
  if (n.length >= 15) return false;
  // Reject numbers that look like WA internal (start with high random blocks without valid CC)
  // Allow: 972 (IL) 10-12, 1 (US) 11, 44 (UK) 11-12, 49 11-13, 33 11-12, 7 11, generic 8-13
  if (n.length === 14) {
    // most real numbers aren't 14 digits; allow only if starts with known long CC patterns carefully
    // safer: reject 14-digit as phone for display from raw LID
    return false;
  }
  return /^[1-9]\d{7,13}$/.test(n);
}

function formatPhoneDisplay(raw) {
  const d = digitsOnly(raw);
  if (!isRealPhoneDigits(d)) {
    // Israeli local 05xxxxxxxx
    if (/^0(5\d{8})$/.test(d)) return '+972' + d.slice(1);
    return null;
  }
  if (/^0(5\d{8})$/.test(d)) return '+972' + d.slice(1);
  if (/^972\d{8,10}$/.test(d)) return '+' + d;
  return '+' + d;
}

function chatType(jid) {
  if (!jid) return 'unknown';
  const s = String(jid);
  if (s.endsWith('@g.us')) return 'group';
  if (s.endsWith('@s.whatsapp.net') || s.endsWith('@c.us')) return 'private';
  if (s.endsWith('@broadcast')) return 'broadcast';
  if (s.endsWith('@lid')) {
    // Do NOT assume long LID = group; groups use @g.us. LID is private or unknown.
    return 'private';
  }
  const bare = s.split('@')[0].split(':')[0];
  if (/^\d{15,}$/.test(bare)) return 'private';
  return 'other';
}

function isRawId(name) {
  if (!name) return true;
  const s = String(name).trim();
  if (!s || s === '.' || s === '?') return true;
  if (/^\+?\d{6,25}$/.test(s)) return true;
  if (/^(Group|קבוצה|שיחה|Private|Group chat)\s*\d*$/i.test(s)) return true;
  return false;
}

function phoneFromAnyJid(jid) {
  if (!jid) return null;
  const s = String(jid);
  if (s.includes('@g.us') || s.includes('@broadcast') || s.includes('@newsletter')) return null;
  if (s.includes('@lid')) return null; // never treat LID user part as phone
  if (s.includes('@s.whatsapp.net') || s.includes('@c.us')) {
    const user = s.split('@')[0].split(':')[0];
    return isRealPhoneDigits(user) || /^0(5\d{8})$/.test(user) ? digitsOnly(user) : null;
  }
  return null;
}

/**
 * Extract real phone digits from a Baileys message key / message envelope
 */
function extractRealPhone(key, msg) {
  const candidates = [
    key?.remoteJidAlt,
    key?.senderPn,
    key?.participantAlt,
    key?.participantPn,
    msg?.senderPn,
    msg?.participantAlt,
    key?.remoteJid && isPhoneJid(key.remoteJid) ? key.remoteJid : null,
    key?.participant && isPhoneJid(key.participant) ? key.participant : null
  ];
  for (const c of candidates) {
    if (!c) continue;
    const p = phoneFromAnyJid(c) || (isRealPhoneDigits(c) ? digitsOnly(c) : null);
    if (p && isRealPhoneDigits(p)) return p;
    // local IL
    const d = digitsOnly(c);
    if (/^0(5\d{8})$/.test(d)) return '972' + d.slice(1);
  }
  return null;
}

function lookupContactName(sessionId, phoneDigits) {
  if (!sessionId || !phoneDigits) return null;
  try {
    const book = sessionManager.getContactBook?.(sessionId) || {};
    const d = digitsOnly(phoneDigits);
    if (!d) return null;
    const variants = new Set([d]);
    // IL local <-> international
    if (d.startsWith('972') && d.length >= 11) variants.add('0' + d.slice(3));
    if (d.startsWith('0') && d.length >= 9) variants.add('972' + d.slice(1));
    for (const v of [...variants]) {
      if (book[v]?.name && !isRawId(book[v].name)) return String(book[v].name).trim();
    }
    for (const [k, v] of Object.entries(book)) {
      if (!v) continue;
      const kd = digitsOnly(k);
      const vd = digitsOnly(v.phone || v.phoneNumber || '');
      const names = [v.name, v.notify, v.verifiedName, v.pushName].filter(Boolean).map(x => String(x).trim());
      const good = names.find(n => n && !isRawId(n));
      if (!good) continue;
      if (variants.has(kd) || variants.has(vd)) return good;
      for (const vv of variants) {
        if (kd && (kd === vv || kd.endsWith(vv) || vv.endsWith(kd)) && Math.abs(kd.length - vv.length) <= 4) return good;
        if (vd && (vd === vv || vd.endsWith(vv) || vv.endsWith(vd)) && Math.abs(vd.length - vv.length) <= 4) return good;
      }
    }
  } catch {}
  return null;
}

function lookupContactNameByLid(sessionId, lidJid) {
  if (!sessionId || !lidJid) return null;
  try {
    const book = sessionManager.getContactBook?.(sessionId) || {};
    const lid = String(lidJid);
    for (const v of Object.values(book)) {
      if (!v) continue;
      const ids = [v.id, v.jid, v.lid, v.remoteJid].filter(Boolean).map(String);
      if (ids.some(x => x === lid || x.includes(lid.split('@')[0]))) {
        if (v.name && !isRawId(v.name)) return String(v.name).trim();
        if (v.phone && isRealPhoneDigits(v.phone)) return null; // name missing but phone known — handled elsewhere
      }
    }
  } catch {}
  return null;
}

function lookupPhoneByLid(sessionId, lidJid) {
  if (!sessionId || !lidJid) return null;
  try {
    const book = sessionManager.getContactBook?.(sessionId) || {};
    const lid = String(lidJid);
    for (const [k, v] of Object.entries(book)) {
      if (!v) continue;
      const ids = [v.id, v.jid, v.lid, v.remoteJid].filter(Boolean).map(String);
      if (ids.some(x => x === lid || x.includes(String(lid).split('@')[0]))) {
        const p = digitsOnly(v.phone || v.phoneNumber || k);
        if (isRealPhoneDigits(p)) return p;
      }
    }
  } catch {}
  return null;
}

async function resolveLidPhone(sessionId, lidJid) {
  const cached = lookupPhoneByLid(sessionId, lidJid);
  if (cached) return cached;
  try {
    const sock = sessionManager.getSocket(sessionId);
    if (!sock) return null;
    const mapping = sock.signalRepository?.lidMapping;
    if (mapping?.getPNForLID) {
      const pn = await mapping.getPNForLID(lidJid);
      if (pn) {
        const p = phoneFromAnyJid(pn) || digitsOnly(String(pn).split('@')[0]);
        if (isRealPhoneDigits(p)) return p;
      }
    }
  } catch {}
  return null;
}

function isLikelySelfOrNoiseJid(jid, sessionPhones = []) {
  const raw = digitsOnly(String(jid || '').split('@')[0].split(':')[0]);
  if (!raw) return true;
  for (const ph of sessionPhones) {
    const p = digitsOnly(ph);
    if (p && (p === raw || p.endsWith(raw) || raw.endsWith(p))) return true;
  }
  return false;
}


function canonicalPrivateKey(phone, phoneJid, jid) {
  if (phone && isRealPhoneDigits(phone)) return digitsOnly(phone) + '@s.whatsapp.net';
  if (phoneJid && isPhoneJid(phoneJid)) {
    const d = digitsOnly(String(phoneJid).split('@')[0]);
    if (isRealPhoneDigits(d)) return d + '@s.whatsapp.net';
  }
  if (jid && isPhoneJid(jid)) {
    const d = digitsOnly(String(jid).split('@')[0]);
    if (isRealPhoneDigits(d)) return d + '@s.whatsapp.net';
  }
  return jid; // lid or unknown
}

function findChatByIdentity(chats, { jid, phone, phoneJid, lid }) {
  if (jid && chats.has(jid)) return chats.get(jid);
  if (phoneJid && chats.has(phoneJid)) return chats.get(phoneJid);
  if (phone) {
    const pk = digitsOnly(phone) + '@s.whatsapp.net';
    if (chats.has(pk)) return chats.get(pk);
  }
  const phoneD = phone ? digitsOnly(phone) : null;
  const lidRaw = lid ? String(lid).split('@')[0] : null;
  for (const c of chats.values()) {
    if (phoneD && c.phone && digitsOnly(c.phone) === phoneD) return c;
    if (phoneD && c.phoneJid && digitsOnly(String(c.phoneJid).split('@')[0]) === phoneD) return c;
    if (phoneJid && (c.jid === phoneJid || c.phoneJid === phoneJid)) return c;
    if (lid && (c.jid === lid || (c.lids && c.lids.has?.(lid)) || (Array.isArray(c.lids) && c.lids.includes(lid)))) return c;
    if (lidRaw && String(c.jid || '').includes(lidRaw)) return c;
    if (c.aliases instanceof Set) {
      if (jid && c.aliases.has(jid)) return c;
      if (phoneJid && c.aliases.has(phoneJid)) return c;
    }
  }
  return null;
}

class MailboxService {
  constructor() {
    this.messages = [];
    this.chats = new Map();
    this.io = null;
    this._saveTimer = null;
    this._groupCache = new Map(); // jid -> { subject, size }
    this._load();
  }

  setIO(io) {
    this.io = io;
  }

  async _load() {
    try {
      await fs.ensureDir(DATA_DIR);
      if (await fs.pathExists(MAILBOX_FILE)) {
        const data = await fs.readJson(MAILBOX_FILE);
        this.messages = Array.isArray(data.messages) ? data.messages : [];
        const chats = Array.isArray(data.chats) ? data.chats : [];
        this.chats = new Map();
        for (const c of chats) {
          if (!c?.jid) continue;
          c.sessionIds = new Set(c.sessionIds || []);
          c.aliases = new Set(c.aliases || [c.jid]);
          c.lids = new Set(c.lids || []);
          this.chats.set(c.jid, c);
          for (const a of c.aliases) if (a) this.chats.set(a, c);
          for (const a of c.lids) if (a) this.chats.set(a, c);
        }
      }
    } catch (e) {
      console.error('[MAILBOX] load', e.message);
    }
  }

  async _save() {
    try {
      await fs.ensureDir(DATA_DIR);
      const seen = new Set();
      const chats = [];
      for (const c of this.chats.values()) {
        if (seen.has(c)) continue;
        seen.add(c);
        chats.push({
          ...c,
          sessionIds: [...(c.sessionIds instanceof Set ? c.sessionIds : (c.sessionIds || []))],
          aliases: [...(c.aliases instanceof Set ? c.aliases : (c.aliases || []))],
          lids: [...(c.lids instanceof Set ? c.lids : (c.lids || []))]
        });
      }
      await fs.writeJson(MAILBOX_FILE, { messages: this.messages.slice(-5000), chats }, { spaces: 0 });
    } catch (e) {
      console.error('[MAILBOX] save', e.message);
    }
  }

  _indexChat(msg) {
    const rawJid = msg.chatJid;
    if (!rawJid) return;
    let type = msg.chatType || chatType(rawJid);
    if (isGroupJid(rawJid)) type = 'group';

    const phone = msg.phone && isRealPhoneDigits(msg.phone) ? digitsOnly(msg.phone) : null;
    const phoneJid = msg.phoneJid || (phone ? phone + '@s.whatsapp.net' : null);
    const lid = isLidJid(rawJid) ? rawJid : null;

    // Canonical key: phone-based for private so LID + PN collapse into one chat
    let key = rawJid;
    if (type !== 'group') {
      key = canonicalPrivateKey(phone, phoneJid, rawJid);
    }

    let chat = findChatByIdentity(this.chats, { jid: rawJid, phone, phoneJid, lid });
    if (chat && chat.jid !== key && type !== 'group' && key !== rawJid) {
      // re-key map to canonical phone jid
      this.chats.delete(chat.jid);
      chat.jid = key;
      this.chats.set(key, chat);
    }

    let bookName = null;
    if (msg.sessionId && phone) bookName = lookupContactName(msg.sessionId, phone);
    if (!bookName && msg.sessionId && lid) bookName = lookupContactNameByLid(msg.sessionId, lid);
    // also try all sessions on existing chat
    if (!bookName && phone) {
      const sids = chat?.sessionIds ? [...(chat.sessionIds instanceof Set ? chat.sessionIds : chat.sessionIds)] : [msg.sessionId];
      for (const sid of sids) {
        bookName = lookupContactName(sid, phone);
        if (bookName) break;
      }
    }

    const pushOk = (!isRawId(msg.pushName) && !msg.fromMe && msg.pushName) ? String(msg.pushName).trim() : null;
    const chatNameOk = (!isRawId(msg.chatName) && msg.chatName) ? String(msg.chatName).trim() : null;

    if (!chat) {
      chat = {
        jid: key,
        type,
        name: bookName || chatNameOk || pushOk || null,
        phone: phone || null,
        phoneJid: phoneJid || null,
        lids: lid ? new Set([lid]) : new Set(),
        aliases: new Set([rawJid, key, phoneJid].filter(Boolean)),
        lastMessage: msg.body,
        lastAt: msg.timestamp,
        sessionIds: new Set([msg.sessionId]),
        unread: msg.fromMe ? 0 : 1,
        nameLocked: !!bookName
      };
      this.chats.set(key, chat);
    } else {
      chat.lastMessage = msg.body;
      chat.lastAt = msg.timestamp;
      if (!(chat.sessionIds instanceof Set)) chat.sessionIds = new Set(chat.sessionIds || []);
      chat.sessionIds.add(msg.sessionId);
      if (!(chat.aliases instanceof Set)) chat.aliases = new Set(chat.aliases || []);
      chat.aliases.add(rawJid);
      if (phoneJid) chat.aliases.add(phoneJid);
      if (lid) {
        if (!(chat.lids instanceof Set)) chat.lids = new Set(chat.lids || []);
        chat.lids.add(lid);
      }
      chat.type = type === 'group' ? 'group' : (chat.type || type);
      if (bookName) {
        chat.name = bookName;
        chat.nameLocked = true;
      } else if (!chat.nameLocked && (chatNameOk || pushOk) && isRawId(chat.name)) {
        chat.name = chatNameOk || pushOk;
      }
      if (phone) chat.phone = phone;
      if (phoneJid) chat.phoneJid = phoneJid;
      if (!msg.fromMe) chat.unread = (chat.unread || 0) + 1;
    }

    // Always re-check contact book
    if (chat.phone) {
      for (const sid of (chat.sessionIds instanceof Set ? chat.sessionIds : [msg.sessionId])) {
        const cn = lookupContactName(sid, chat.phone);
        if (cn) { chat.name = cn; chat.nameLocked = true; break; }
      }
    }

    // Keep alias keys pointing to same object for lookups
    for (const a of (chat.aliases || [])) {
      if (a && a !== chat.jid) this.chats.set(a, chat);
    }
    if (lid) this.chats.set(lid, chat);
  }

  async resolveGroupName(sessionId, groupJid) {
    if (this._groupCache.has(groupJid)) return this._groupCache.get(groupJid);
    try {
      const sock = sessionManager.getSocket(sessionId);
      if (!sock) return null;
      const candidates = [groupJid];
      const raw = String(groupJid).split('@')[0];
      if (!String(groupJid).endsWith('@g.us')) candidates.push(raw + '@g.us');
      for (const j of candidates) {
        try {
          const meta = await sock.groupMetadata(j);
          if (meta?.subject) {
            const info = {
              subject: meta.subject,
              size: Array.isArray(meta.participants) ? meta.participants.length : (meta.size || null)
            };
            this._groupCache.set(groupJid, info);
            this._groupCache.set(j, info);
            return info;
          }
        } catch {}
      }
      try {
        const all = await sock.groupFetchAllParticipating();
        if (all) {
          const hit = all[groupJid] || all[raw + '@g.us'];
          if (hit?.subject) {
            const info = {
              subject: hit.subject,
              size: Array.isArray(hit.participants) ? hit.participants.length : null
            };
            this._groupCache.set(groupJid, info);
            return info;
          }
          for (const [k, v] of Object.entries(all)) {
            if (String(k).startsWith(raw) && v?.subject) {
              const info = {
                subject: v.subject,
                size: Array.isArray(v.participants) ? v.participants.length : null
              };
              this._groupCache.set(groupJid, info);
              return info;
            }
          }
        }
      } catch {}
      // store chats metadata
      try {
        const storeChats = sock.store?.chats?.all?.() || [];
        for (const ch of storeChats) {
          if (ch?.id && String(ch.id).includes(raw) && (ch.name || ch.subject)) {
            const info = { subject: ch.name || ch.subject, size: null };
            this._groupCache.set(groupJid, info);
            return info;
          }
        }
      } catch {}
      return null;
    } catch {
      return null;
    }
  }

  addMessage(sessionId, sessionLabel, msg) {
    try {
      const key = msg.key || {};
      const fromMe = !!key.fromMe;
      let remoteJid = key.remoteJid || '';
      const remoteAlt = key.remoteJidAlt || key.senderPn || null;

      // Prefer phone JID for identity when Alt provides it
      let phoneJid = null;
      let phone = extractRealPhone(key, msg);
      if (remoteAlt && isPhoneJid(remoteAlt)) {
        phoneJid = remoteAlt;
        if (!phone) phone = phoneFromAnyJid(remoteAlt);
      }
      if (isPhoneJid(remoteJid)) {
        phoneJid = remoteJid;
        if (!phone) phone = phoneFromAnyJid(remoteJid);
      }

      if (!remoteJid || remoteJid === 'status@broadcast') return;
      if (!msg.message) return;

      // If we only have LID but resolved phone — keep LID as jid for reply routing,
      // but store phone for display. Optionally dual-index under phone jid.
      if (!phone && isLidJid(remoteJid)) {
        phone = lookupPhoneByLid(sessionId, remoteJid);
      }

      let type = chatType(remoteJid);
      if (isGroupJid(remoteJid)) type = 'group';
      else if (phoneJid || phone) type = 'private';

      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        msg.message?.documentMessage?.caption ||
        (msg.message?.imageMessage ? '[image]' : null) ||
        (msg.message?.videoMessage ? '[video]' : null) ||
        (msg.message?.audioMessage ? '[audio]' : null) ||
        (msg.message?.documentMessage ? '[file]' : null) ||
        (msg.message?.stickerMessage ? '[sticker]' : null) ||
        (msg.message?.reactionMessage ? null : null) ||
        (Object.keys(msg.message || {}).length ? '[media]' : null);

      if (body == null) return;

      let participant = key.participant || msg.participant || null;
      const partAlt = key.participantAlt || key.participantPn || null;
      if (partAlt && isPhoneJid(partAlt)) participant = partAlt;

      const pushName = msg.pushName || msg.verifiedBizName || null;
      let chatName = null;

      if (type === 'private') {
        // 1) saved contact name
        if (phone) chatName = lookupContactName(sessionId, phone);
        if (!chatName && isLidJid(remoteJid)) chatName = lookupContactNameByLid(sessionId, remoteJid);
        // 2) pushName from WA
        if (!chatName && pushName && !isRawId(pushName)) chatName = String(pushName).trim();
      }

      if (fromMe && type === 'private' && !chatName) {
        // keep previous name if any; don't force "me"
      }

      const entry = {
        id: key.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        sessionId,
        sessionLabel: sessionLabel || sessionId,
        fromMe,
        body: String(body),
        timestamp: msg.messageTimestamp
          ? (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp * 1000 : Number(msg.messageTimestamp) * 1000)
          : Date.now(),
        chatJid: remoteJid,
        chatType: type,
        chatName,
        pushName,
        phone: phone || null,
        phoneJid: phoneJid || null,
        participant: participant || null
      };

      if (!fromMe && type === 'private' && !pushName && !body) return;

      this.messages.push(entry);
      try {
        analytics.track({
          category: 'mailbox',
          action: entry.fromMe ? 'out' : 'in',
          sessionId,
          success: true,
          meta: { type: entry.chatType }
        });
      } catch {}
      this._indexChat(entry);

      // Async LID → phone resolution
      if (type === 'private' && !phone && isLidJid(remoteJid)) {
        resolveLidPhone(sessionId, remoteJid).then(p => {
          if (!p) return;
          const chat = this.chats.get(remoteJid);
          if (chat) {
            chat.phone = p;
            chat.phoneJid = p + '@s.whatsapp.net';
            const cn = lookupContactName(sessionId, p);
            if (cn) chat.name = cn;
            else if (isRawId(chat.name)) chat.name = formatPhoneDisplay(p);
            if (this.io) this.io.emit('mailbox-chat-update', this._chatToJson(chat));
            this._save();
          }
        }).catch(() => {});
      }

      // Group subject enrichment
      if (type === 'group' || isGroupJid(remoteJid)) {
        const chat = this.chats.get(remoteJid);
        if (chat && isRawId(chat.name)) {
          this.resolveGroupName(sessionId, remoteJid).then(info => {
            if (!info) return;
            const subject = typeof info === 'string' ? info : info.subject;
            const size = typeof info === 'object' ? info.size : null;
            if (subject && String(subject).trim()) {
              chat.name = String(subject).trim();
              chat.type = 'group';
              if (size) chat.participantCount = size;
              if (this.io) this.io.emit('mailbox-chat-update', this._chatToJson(chat));
              this._save();
            }
          }).catch(() => {});
        }
      }

      if (this.io) {
        this.io.emit('mailbox-message', entry);
        this.io.emit('mailbox-chat-update', this._chatToJson(this.chats.get(remoteJid)));
      }

      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this._save(), 2000);
    } catch (e) {
      console.error('[MAILBOX] addMessage', e.message);
    }
  }

  _chatToJson(chat) {
    if (!chat) return null;
    const type = (isGroupJid(chat.jid) ? 'group' : null) || chat.type || chatType(chat.jid);
    let name = (chat.name && String(chat.name).trim()) ? String(chat.name).trim() : '';
    let phone = chat.phone && isRealPhoneDigits(chat.phone) ? digitsOnly(chat.phone) : null;

    // Never show LID digits as phone
    if (!phone) {
      const fromJid = phoneFromAnyJid(chat.phoneJid || chat.jid);
      if (fromJid) phone = fromJid;
    }

    // Contact book ALWAYS wins (even over pushName already stored)
    if (phone) {
      for (const sid of (chat.sessionIds instanceof Set ? chat.sessionIds : (chat.sessionIds || []))) {
        const cn = lookupContactName(sid, phone);
        if (cn) { name = cn; break; }
      }
    }
    if ((isRawId(name) || !name) && isLidJid(chat.jid)) {
      for (const sid of (chat.sessionIds instanceof Set ? chat.sessionIds : (chat.sessionIds || []))) {
        const cn = lookupContactNameByLid(sid, chat.jid);
        if (cn) { name = cn; break; }
      }
    }

    if (isRawId(name) || !name) {
      if (type === 'group') {
        // keep literal group fallback only if no subject yet
        name = name && !isRawId(name) ? name : 'קבוצה';
      } else if (phone) {
        name = formatPhoneDisplay(phone) || 'שיחה';
      } else {
        // no real phone resolved — do not invent +222... from LID
        name = (name && !/^\+?\d{10,}$/.test(name)) ? name : 'שיחה';
      }
    }

    // strip accidental LID display
    const nameDigits = digitsOnly(name);
    if (/^\+?\d+$/.test(String(name).trim()) && !isRealPhoneDigits(nameDigits)) {
      name = type === 'group' ? 'קבוצה' : 'שיחה';
      phone = null;
    }

    return {
      jid: chat.jid,
      type,
      name,
      phone: phone ? formatPhoneDisplay(phone) : null,
      phoneDigits: phone || null,
      lastMessage: chat.lastMessage,
      lastAt: chat.lastAt,
      sessionIds: [...(chat.sessionIds instanceof Set ? chat.sessionIds : (chat.sessionIds || []))],
      unread: chat.unread || 0,
      isSelf: this._isSelfChat(chat),
      participantCount: chat.participantCount || null
    };
  }

  _isSelfChat(chat) {
    try {
      if (chat.name === 'אני') return true;
      const sessions = sessionManager.listSessions?.() || [];
      const phones = sessions.map(s => digitsOnly(s.phone)).filter(Boolean);
      if (chat.phone && phones.includes(digitsOnly(chat.phone))) return true;
      return isLikelySelfOrNoiseJid(chat.jid, phones);
    } catch {
      return false;
    }
  }

  getChats({ sessionId = null, type = null, limit = 200 } = {}) {
    // Merge legacy duplicate chats (same phone / shared aliases)
    try {
      const byPhone = new Map();
      const objs = [];
      const seenObj = new Set();
      for (const c of this.chats.values()) {
        if (seenObj.has(c)) continue;
        seenObj.add(c);
        objs.push(c);
      }
      for (const c of objs) {
        const ph = c.phone ? digitsOnly(c.phone) : (isPhoneJid(c.jid) ? digitsOnly(c.jid.split('@')[0]) : null);
        if (!ph || !isRealPhoneDigits(ph)) continue;
        if (!byPhone.has(ph)) byPhone.set(ph, c);
        else {
          const primary = byPhone.get(ph);
          if (primary === c) continue;
          // merge c into primary
          if (!(primary.aliases instanceof Set)) primary.aliases = new Set(primary.aliases || []);
          if (!(primary.lids instanceof Set)) primary.lids = new Set(primary.lids || []);
          if (!(primary.sessionIds instanceof Set)) primary.sessionIds = new Set(primary.sessionIds || []);
          primary.aliases.add(c.jid);
          for (const a of (c.aliases instanceof Set ? c.aliases : (c.aliases || []))) primary.aliases.add(a);
          for (const a of (c.lids instanceof Set ? c.lids : (c.lids || []))) primary.lids.add(a);
          for (const s of (c.sessionIds instanceof Set ? c.sessionIds : (c.sessionIds || []))) primary.sessionIds.add(s);
          if ((c.lastAt || 0) > (primary.lastAt || 0)) {
            primary.lastAt = c.lastAt;
            primary.lastMessage = c.lastMessage;
          }
          if (c.nameLocked || (c.name && !isRawId(c.name) && isRawId(primary.name))) {
            primary.name = c.name;
            primary.nameLocked = !!c.nameLocked;
          }
          if (!primary.phone) primary.phone = ph;
          // remap
          this.chats.set(c.jid, primary);
          for (const a of primary.aliases) this.chats.set(a, primary);
        }
      }
    } catch {}

    // enrich names before serialize
    for (const c of this.chats.values()) {
      if (!isRawId(c.name)) continue;
      if (c.phone) {
        for (const sid of (c.sessionIds instanceof Set ? c.sessionIds : (c.sessionIds || []))) {
          const cn = lookupContactName(sid, c.phone);
          if (cn) { c.name = cn; break; }
        }
      }
      // from recent messages
      for (let i = this.messages.length - 1; i >= 0; i--) {
        const m = this.messages[i];
        if (m.chatJid !== c.jid) continue;
        if (m.chatName && !isRawId(m.chatName)) { c.name = m.chatName; break; }
        if (m.phone && !c.phone) c.phone = m.phone;
        if (m.pushName && !isRawId(m.pushName) && !m.fromMe) { c.name = m.pushName; break; }
      }
    }

    let list = [...this.chats.values()];
    if (sessionId) {
      const sid = String(sessionId);
      list = list.filter(c => {
        const raw = c.sessionIds instanceof Set ? [...c.sessionIds] : (c.sessionIds || []);
        const ids = raw.map(String);
        // empty sessionIds = legacy / unknown → keep (do not drop)
        if (!ids.length) return true;
        return ids.includes(sid);
      });
    }
    if (type) list = list.filter(c => (c.type || chatType(c.jid)) === type);

    // dedupe — aliases point to same object
    const seen = new Set();
    const unique = [];
    for (const c of list) {
      const id = c.jid || c.phone || Math.random();
      if (seen.has(id)) continue;
      seen.add(id);
      unique.push(c);
    }

    return unique
      .filter(c => !this._isSelfChat(c))
      .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))
      .slice(0, limit)
      .map(c => this._chatToJson(c));
  }

  getMessages(chatJid, { sessionId = null, limit = 200 } = {}) {
    const chat = this.chats.get(chatJid);
    const keys = new Set([chatJid]);
    if (chat) {
      keys.add(chat.jid);
      if (chat.phoneJid) keys.add(chat.phoneJid);
      if (chat.phone) keys.add(digitsOnly(chat.phone) + '@s.whatsapp.net');
      if (chat.aliases instanceof Set) chat.aliases.forEach(a => keys.add(a));
      else if (Array.isArray(chat.aliases)) chat.aliases.forEach(a => keys.add(a));
      if (chat.lids instanceof Set) chat.lids.forEach(a => keys.add(a));
    }
    const phoneD = chat?.phone ? digitsOnly(chat.phone) : (isPhoneJid(chatJid) ? digitsOnly(chatJid.split('@')[0]) : null);
    let list = this.messages.filter(m => {
      if (keys.has(m.chatJid) || keys.has(m.phoneJid)) return true;
      if (phoneD && m.phone && digitsOnly(m.phone) === phoneD) return true;
      return false;
    });
    if (sessionId) list = list.filter(m => String(m.sessionId) === String(sessionId));
    list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return list.slice(-limit);
  }

  getAllRecent(limit = 200) {
    return this.messages.slice(-limit).reverse();
  }

  markRead(chatJid) {
    const chat = this.chats.get(chatJid);
    if (chat) {
      chat.unread = 0;
      if (this.io) this.io.emit('mailbox-chat-update', this._chatToJson(chat));
    }
  }

  async reply(sessionId, chatJid, text, mediaPath = null, mimetype = null) {
    const sock = sessionManager.getSocket(sessionId);
    if (!chatJid) throw new Error('missing chat');
    if (!text && !mediaPath) throw new Error('missing text or media');
    // Prefer phone JID for private send when available
    let jid = chatJid;
    const chat = this.chats.get(chatJid);
    if (chat?.phoneJid && isPhoneJid(chat.phoneJid)) jid = chat.phoneJid;
    else if (chat?.phone && isRealPhoneDigits(chat.phone)) jid = digitsOnly(chat.phone) + '@s.whatsapp.net';

    let result;
    if (mediaPath) {
      const buf = await fs.readFile(mediaPath);
      const mt = mimetype || '';
      const caption = text ? String(text) : '';
      if (mt.startsWith('video/')) {
        result = await sock.sendMessage(jid, { video: buf, caption, mimetype: mt });
      } else if (mt.startsWith('audio/')) {
        result = await sock.sendMessage(jid, { audio: buf, mimetype: mt });
      } else if (mt.startsWith('image/') || !mt) {
        result = await sock.sendMessage(jid, { image: buf, caption, mimetype: mt || 'image/jpeg' });
      } else {
        result = await sock.sendMessage(jid, {
          document: buf,
          mimetype: mt,
          fileName: mediaPath.split(/[/\\]/).pop() || 'file',
          caption
        });
      }
    } else {
      result = await sock.sendMessage(jid, { text: String(text) });
    }
    return result;
  }

  async clearAll() {
    this.messages = [];
    this.chats = new Map();
    await this._save();
    if (this.io) this.io.emit('mailbox-cleared', {});
    return { ok: true };
  }

  getStats() {
    const chats = [...this.chats.values()];
    return {
      totalMessages: this.messages.length,
      totalChats: chats.length,
      privateChats: chats.filter(c => (c.type || chatType(c.jid)) === 'private').length,
      groupChats: chats.filter(c => (c.type || chatType(c.jid)) === 'group' || isGroupJid(c.jid)).length,
      unread: chats.reduce((s, c) => s + (c.unread || 0), 0)
    };
  }
}

export default new MailboxService();
