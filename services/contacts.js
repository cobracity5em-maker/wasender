/**
 * Contacts — strict source modes:
 *  - saved/contacts: phone book only (contacts.upsert / history contacts / disk cache of contacts)
 *  - chats: phones seen in private chats / mailbox / chatIndex (not group spam dump)
 *  - all: merge of both
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import PDFDocument from "pdfkit";
import sessionManager from "./sessionManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");
const MAILBOX_FILE = path.join(DATA_DIR, "mailbox.json");

function ensureDir(d) {
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
}
function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}
function normalizeNumber(num) {
  let n = String(num).replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  if (n.startsWith("0") && n.length >= 9) n = "972" + n.slice(1);
  return n;
}
function isValidPhone(d) {
  const n = digitsOnly(d);
  return n.length >= 8 && n.length <= 15;
}
function formatPlus(d) {
  const n = digitsOnly(d);
  return n ? "+" + n : "";
}
function phoneFromJid(jid) {
  if (!jid) return null;
  const s = String(jid);
  if (s.includes("@g.us") || s.includes("@broadcast") || s.includes("@newsletter")) return null;
  if (s.includes("@s.whatsapp.net") || s.includes("@c.us")) {
    const user = s.split("@")[0].split(":")[0];
    return isValidPhone(user) ? digitsOnly(user) : null;
  }
  if (/^\d{8,15}$/.test(s)) return s;
  return null;
}
async function lidToPhone(sock, lidJid) {
  try {
    const mapping = sock?.signalRepository?.lidMapping;
    if (mapping?.getPNForLID) {
      const pn = await mapping.getPNForLID(lidJid);
      if (pn) {
        const p = phoneFromJid(pn) || digitsOnly(String(pn).split("@")[0]);
        if (isValidPhone(p)) return p;
      }
    }
  } catch {}
  return null;
}
async function resolvePhone(sock, jidOrContact) {
  if (!jidOrContact) return null;
  if (typeof jidOrContact === "object") {
    const c = jidOrContact;
    for (const k of ["phoneNumber", "phone"]) {
      if (c[k] && isValidPhone(digitsOnly(c[k]))) return digitsOnly(c[k]);
    }
    const fromId = phoneFromJid(c.id || c.jid);
    if (fromId) return fromId;
    if (c.id && String(c.id).includes("@lid") && sock) {
      return await lidToPhone(sock, c.id);
    }
    return null;
  }
  const jid = String(jidOrContact);
  const direct = phoneFromJid(jid);
  if (direct) return direct;
  if (jid.includes("@lid") && sock) return await lidToPhone(sock, jid);
  return null;
}
function contactName(c) {
  if (!c) return "";
  return String(c.name || c.notify || c.verifiedName || c.pushName || "").trim();
}

/** Sources that count as "saved contacts" (address book) */
const SAVED_SOURCES = new Set([
  "contact", "contacts", "contactsMap", "history", "saved", "import", "book"
]);
/** Sources that count as "from chats" */
const CHAT_SOURCES = new Set([
  "chat", "chats", "chatIndex", "chatsMap", "mailbox", "message", "dm"
]);

class ContactService {
  async checkNumbers(sessionId, numbers) {
    const sock = sessionManager.getSocket(sessionId);
    if (!sock) throw new Error("session offline");
    const results = { exists: [], notExists: [], invalid: [] };
    const cleaned = numbers.map(n => normalizeNumber(n)).filter(n => isValidPhone(n));
    try {
      const checks = await sock.onWhatsApp(...cleaned);
      const found = new Set();
      for (const c of checks || []) {
        if (c?.exists) {
          const num = c.jid?.split("@")[0] || c.jid;
          results.exists.push({ number: num, jid: c.jid, formatted: formatPlus(num) });
          found.add(String(num));
        }
      }
      for (const n of cleaned) if (!found.has(n)) results.notExists.push(n);
    } catch {
      for (const n of cleaned) {
        try {
          const [c] = await sock.onWhatsApp(n);
          if (c?.exists) results.exists.push({ number: n, jid: c.jid, formatted: formatPlus(n) });
          else results.notExists.push(n);
        } catch {
          results.invalid.push(n);
        }
        await new Promise(r => setTimeout(r, 120));
      }
    }
    return results;
  }

  /**
   * Saved address-book contacts only
   */
  async listSavedContacts(sessionId) {
    let sock = null;
    try { sock = sessionManager.getSocket(sessionId); } catch {}

    const map = new Map();
    const add = (phone, name, source) => {
      if (!phone || !isValidPhone(phone)) return;
      const p = digitsOnly(phone);
      const prev = map.get(p);
      const nm = String(name || "").trim();
      const src = source || "contact";
      if (!prev) map.set(p, { phone: p, formatted: formatPlus(p), name: nm, source: src });
      else if (!prev.name && nm) map.set(p, { ...prev, name: nm });
    };

    // A) contactBook — only entries tagged as contact/history/import
    try {
      const book = sessionManager.getContactBook?.(sessionId) || {};
      for (const [key, entry] of Object.entries(book)) {
        const src = String(entry?.source || "contact");
        // skip pure chat/group harvest rows when asking for saved only
        if (src.includes("group") || src === "chatIndex" || src === "chatsMap" || src === "mailbox" || src === "harvest") {
          // harvest may mix — only keep if explicitly contact-like name from contactsMap path
          if (!SAVED_SOURCES.has(src) && src !== "contactsMap") continue;
        }
        if (SAVED_SOURCES.has(src) || src === "contactsMap" || !entry?.source) {
          if (entry?.phone) add(entry.phone, entry.name, src || "contact");
          else if (isValidPhone(key)) add(key, entry?.name, "contact");
        }
      }
    } catch {}

    // B) live store.contacts (real address book from WA)
    try {
      if (sock) {
        const store = sock.store || sessionManager.sessions?.get?.(sessionId)?.store;
        const contacts = store?.contacts || {};
        for (const [jid, c] of Object.entries(contacts)) {
          const phone = await resolvePhone(sock, c || jid);
          if (!phone) continue;
          add(phone, contactName(c), "contact");
        }
      }
    } catch {}

    // C) contactsMap from sessionManager (from contacts.upsert)
    try {
      const s = sessionManager.sessions?.get?.(sessionId);
      if (s?.contactsMap) {
        for (const [jid, c] of s.contactsMap.entries()) {
          let d = digitsOnly(c?.phoneNumber || c?.phone || "");
          if (!d) d = phoneFromJid(jid) || "";
          if (!d && String(jid).includes("@lid") && sock) {
            d = (await lidToPhone(sock, jid)) || "";
          }
          if (d) add(d, contactName(c), "contactsMap");
        }
      }
    } catch {}

    // D) disk cache — only contact-tagged
    try {
      const cache = sessionManager.loadContactCache?.(sessionId) || {};
      for (const [p, entry] of Object.entries(cache)) {
        const src = String(entry?.source || "contact");
        if (src.includes("group") || CHAT_SOURCES.has(src)) continue;
        add(entry.phone || p, entry.name, src);
      }
    } catch {}

    return [...map.values()].sort((a, b) => (a.name || a.phone).localeCompare(b.name || b.phone, "he"));
  }

  /**
   * Phones from private chats only (not full group dump)
   */
  async listChatPhones(sessionId) {
    let sock = null;
    try { sock = sessionManager.getSocket(sessionId); } catch {}

    const map = new Map();
    const add = (phone, name, source) => {
      if (!phone || !isValidPhone(phone)) return;
      const p = digitsOnly(phone);
      const prev = map.get(p);
      const nm = String(name || "").trim();
      if (!prev) map.set(p, { phone: p, formatted: formatPlus(p), name: nm, source: source || "chat" });
      else if (!prev.name && nm) map.set(p, { ...prev, name: nm });
    };

    // A) chatIndex — private only
    try {
      const s = sessionManager.sessions?.get?.(sessionId);
      const index = s?.chatIndex || sessionManager.getChatIndex?.(sessionId) || {};
      for (const [jid, meta] of Object.entries(index)) {
        if (String(jid).includes("@g.us")) continue;
        let phone = meta?.phone || phoneFromJid(jid);
        if (!phone && String(jid).includes("@lid") && sock) {
          phone = await lidToPhone(sock, jid);
        }
        if (phone) add(phone, meta?.name || meta?.pushName || "", "chatIndex");
      }
    } catch {}

    // B) chatsMap private
    try {
      const s = sessionManager.sessions?.get?.(sessionId);
      if (s?.chatsMap) {
        for (const [jid, ch] of s.chatsMap.entries()) {
          if (String(jid).endsWith("@g.us")) continue;
          let d = digitsOnly(ch?.phoneNumber || ch?.phone || "");
          if (!d) d = phoneFromJid(jid) || digitsOnly(ch?.senderPn || ch?.remoteJidAlt || "");
          if (!d && String(jid).includes("@lid") && sock) d = (await lidToPhone(sock, jid)) || "";
          if (d) add(d, ch?.name || ch?.pushName || "", "chatsMap");
        }
      }
    } catch {}

    // C) contactBook entries that came from chat sources only
    try {
      const book = sessionManager.getContactBook?.(sessionId) || {};
      for (const entry of Object.values(book)) {
        const src = String(entry?.source || "");
        if (!CHAT_SOURCES.has(src) && !src.includes("chat")) continue;
        if (entry?.phone) add(entry.phone, entry.name, src || "chat");
      }
    } catch {}

    // D) mailbox.json for this session
    try {
      if (fs.existsSync(MAILBOX_FILE)) {
        const data = JSON.parse(fs.readFileSync(MAILBOX_FILE, "utf8"));
        for (const msg of data.messages || []) {
          if (msg.sessionId != null && String(msg.sessionId) !== String(sessionId)) continue;
          const jid = msg.chatJid || "";
          if (String(jid).includes("@g.us")) continue;
          let phone = msg.phone || phoneFromJid(jid);
          if (!phone && msg.from && isValidPhone(msg.from)) phone = digitsOnly(msg.from);
          if (phone) add(phone, msg.pushName || msg.chatName || "", "mailbox");
        }
      }
    } catch {}

    // Do NOT pull group participants here — that belongs to Groups extract

    return [...map.values()].sort((a, b) => a.phone.localeCompare(b.phone));
  }

  async listByMode(sessionId, mode = "all") {
    const m = String(mode || "all").toLowerCase();
    if (m === "chats" || m === "chat") return this.listChatPhones(sessionId);
    if (m === "contacts" || m === "saved" || m === "contact") return this.listSavedContacts(sessionId);
    // all — merge unique
    const a = await this.listSavedContacts(sessionId);
    const b = await this.listChatPhones(sessionId);
    const map = new Map();
    for (const r of [...a, ...b]) {
      if (!r?.phone) continue;
      const prev = map.get(r.phone);
      if (!prev) map.set(r.phone, r);
      else {
        const merged = { ...prev };
        if (!merged.name && r.name) merged.name = r.name;
        if (merged.source !== r.source) merged.source = (merged.source || "") + "+" + (r.source || "");
        map.set(r.phone, merged);
      }
    }
    return [...map.values()].sort((a, b) => (a.name || a.phone).localeCompare(b.name || b.phone, "he"));
  }

  async exportList(sessionId, { mode = "all", format = "txt" } = {}) {
    ensureDir(DATA_DIR);
    const rows = await this.listByMode(sessionId, mode);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const base = `contacts_${sessionId}_${mode}_${stamp}`;

    if (format === "pdf") {
      const file = base + ".pdf";
      const fp = path.join(DATA_DIR, file);
      await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 48 });
        const stream = fs.createWriteStream(fp);
        doc.pipe(stream);
        doc.fontSize(16).text("Contacts export", { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor("#444").text(`Mode: ${mode} · Count: ${rows.length} · ${new Date().toISOString()}`);
        doc.moveDown();
        doc.fillColor("#000");
        rows.forEach((r, i) => {
          const line = `${String(i + 1).padStart(4, " ")}.  ${r.formatted || ("+" + r.phone)}${r.name ? "  —  " + r.name : ""}`;
          doc.fontSize(10).text(line);
        });
        doc.end();
        stream.on("finish", resolve);
        stream.on("error", reject);
      });
      return { file, downloadUrl: `/api/downloads/${file}`, count: rows.length, mode };
    }

    const file = base + ".txt";
    const lines = rows.map(r => (r.name ? `${r.name}\n${r.formatted || ("+" + r.phone)}` : (r.formatted || ("+" + r.phone))));
    fs.writeFileSync(path.join(DATA_DIR, file), lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
    return { file, downloadUrl: `/api/downloads/${file}`, count: rows.length, mode };
  }

  async importNumbers(sessionId, text, { check = false } = {}) {
    const raw = String(text || "").split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const phones = [];
    for (const line of raw) {
      const d = digitsOnly(line);
      if (isValidPhone(d)) phones.push(normalizeNumber(d));
    }
    const unique = [...new Set(phones)];
    const rows = unique.map(p => ({ phone: p, formatted: formatPlus(p), name: "", source: "import" }));
    try { sessionManager.mergeContactBook?.(sessionId, rows); sessionManager._persistContactBook?.(sessionId); } catch {}
    let checked = null;
    if (check && unique.length) {
      try { checked = await this.checkNumbers(sessionId, unique); } catch {}
    }
    return { imported: unique.length, contacts: rows, checked };
  }
}

export default new ContactService();
