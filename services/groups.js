/**
 * Group member extract
 *
 * WhatsApp often returns @lid instead of phone JIDs.
 * We try every known field Baileys exposes, then lidMapping.
 * We NEVER invent phones from LID digits.
 * If 0 resolved, we write a debug JSON of raw participant shapes so you can see what WA returned.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import PDFDocument from 'pdfkit';
import sessionManager from './sessionManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

function jidHost(jid) {
  const s = String(jid || '');
  const i = s.indexOf('@');
  return i >= 0 ? s.slice(i + 1).toLowerCase() : '';
}

function isPnHost(h) {
  return h === 's.whatsapp.net' || h === 'c.us';
}

function isLidHost(h) {
  return h === 'lid';
}

/** Extract phone from a PN jid only */
function phoneFromPnJid(jid) {
  if (!jid) return null;
  const h = jidHost(jid);
  if (!isPnHost(h)) return null;
  const user = String(jid).split('@')[0].split(':')[0];
  const d = digitsOnly(user);
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

/** Accept bare phone string (with optional +) if length looks real */
function phoneFromBare(s) {
  const d = digitsOnly(s);
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

function collectCandidateStrings(p) {
  const out = [];
  if (p == null) return out;
  if (typeof p === 'string') {
    out.push(p);
    return out;
  }
  if (typeof p !== 'object') return out;

  const keys = [
    'phoneNumber', 'pn', 'participantPn', 'ownerPn', 'jid', 'id',
    'lid', 'participant', 'participantAlt', 'remoteJidAlt'
  ];
  for (const k of keys) {
    if (p[k] != null) out.push(p[k]);
  }
  // nested attrs (some update payloads)
  const attrs = p.content?.attrs || p.attrs;
  if (attrs) {
    for (const k of ['phone_number', 'jid', 'lid', 'participant']) {
      if (attrs[k] != null) out.push(attrs[k]);
    }
  }
  return out;
}

class GroupService {
  async listGroups(sessionId) {
    const sock = sessionManager.getSocket(sessionId);
    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups || {}).map(g => ({
      id: g.id,
      subject: g.subject || '',
      size: g.participants?.length || 0,
      owner: g.owner || null,
      ownerPn: g.ownerPn || null,
      addressingMode: g.addressingMode || null,
      creation: g.creation || null,
      desc: g.desc || ''
    }));
  }

  async resolveParticipantPhone(sock, p) {
    const candidates = collectCandidateStrings(p);

    // 1) Any candidate that is already a PN jid
    for (const c of candidates) {
      const phone = phoneFromPnJid(c);
      if (phone) return { phone, source: 'pn-jid', raw: String(c) };
    }

    // 2) Explicit phoneNumber-like fields that are bare numbers
    if (typeof p === 'object' && p) {
      for (const k of ['phoneNumber', 'pn', 'participantPn']) {
        if (p[k] && !String(p[k]).includes('@')) {
          const phone = phoneFromBare(p[k]);
          if (phone) return { phone, source: k, raw: String(p[k]) };
        }
      }
    }

    // 3) LID → getPNForLID (only if mapping already known)
    for (const c of candidates) {
      if (!isLidHost(jidHost(c))) continue;
      try {
        const map = sock.signalRepository?.lidMapping;
        if (map?.getPNForLID) {
          const pnJid = await map.getPNForLID(String(c));
          const phone = phoneFromPnJid(pnJid);
          if (phone) return { phone, source: 'lidMapping', raw: String(pnJid) };
        }
      } catch {}
    }

    // 4) contacts store by any candidate jid
    try {
      const contacts = sock.store?.contacts;
      if (contacts) {
        for (const c of candidates) {
          const contact = contacts[c];
          if (!contact) continue;
          for (const k of ['phoneNumber', 'id', 'jid']) {
            if (!contact[k]) continue;
            const phone = phoneFromPnJid(contact[k]) || phoneFromBare(contact[k]);
            if (phone) return { phone, source: 'contact', raw: String(contact[k]) };
          }
        }
      }
    } catch {}

    return null;
  }

  /**
   * Snapshot raw participant shape for debugging (first N)
   */
  _sampleRaw(participants, n = 3) {
    return participants.slice(0, n).map(p => {
      if (typeof p === 'string') return { type: 'string', value: p };
      if (!p || typeof p !== 'object') return { type: typeof p, value: p };
      const o = {};
      for (const [k, v] of Object.entries(p)) {
        if (v == null) continue;
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') o[k] = v;
        else if (typeof v === 'object') o[k] = '[object]';
      }
      return o;
    });
  }

  async extractMembers(sessionId, groupId) {
    const sock = sessionManager.getSocket(sessionId);
    const meta = await sock.groupMetadata(groupId);
    const participants = meta.participants || [];

    const details = [];
    const seen = new Set();
    let unresolved = 0;
    const unresolvedSamples = [];

    for (const p of participants) {
      const resolved = await this.resolveParticipantPhone(sock, p);
      if (!resolved) {
        unresolved++;
        if (unresolvedSamples.length < 8) {
          const raw = typeof p === 'string' ? p : (p?.id || p?.jid || p?.phoneNumber || '?');
          unresolvedSamples.push(String(raw));
        }
        continue;
      }
      if (seen.has(resolved.phone)) continue;
      seen.add(resolved.phone);
      details.push({
        phone: resolved.phone,
        phoneE164: '+' + resolved.phone,
        source: resolved.source,
        admin: (typeof p === 'object' && p.admin) ? p.admin : null
      });
    }

    details.sort((a, b) => a.phone.localeCompare(b.phone, undefined, { numeric: true }));
    const numbers = details.map(d => d.phone);
    const numbersE164 = details.map(d => d.phoneE164);

    await fs.ensureDir(DATA_DIR);
    const safeId = String(groupId).split('@')[0].replace(/[^\w.-]/g, '');
    const stamp = Date.now();
    const base = `group_${safeId}_${stamp}`;

    // Always write debug snapshot so we can see WA payload
    const debugFile = `${base}_debug.json`;
    await fs.writeJson(path.join(DATA_DIR, debugFile), {
      groupId,
      subject: meta.subject,
      addressingMode: meta.addressingMode || null,
      owner: meta.owner || null,
      ownerPn: meta.ownerPn || null,
      totalParticipants: participants.length,
      resolved: numbers.length,
      unresolved,
      unresolvedSamples,
      sampleParticipants: this._sampleRaw(participants, 5),
      extractedAt: new Date().toISOString()
    }, { spaces: 2 });

    // TXT with + (campaign ready)
    const txtPlus = `${base}.txt`;
    await fs.writeFile(
      path.join(DATA_DIR, txtPlus),
      numbersE164.join('\n') + (numbersE164.length ? '\n' : ''),
      'utf8'
    );
    const txtDigits = `${base}_digits.txt`;
    await fs.writeFile(
      path.join(DATA_DIR, txtDigits),
      numbers.join('\n') + (numbers.length ? '\n' : ''),
      'utf8'
    );

    const pdfFile = `${base}.pdf`;
    await this._writePdf(path.join(DATA_DIR, pdfFile), {
      subject: meta.subject || groupId,
      groupId,
      numbersE164,
      totalParticipants: participants.length,
      resolved: numbers.length,
      unresolved
    });

    await fs.writeJson(path.join(DATA_DIR, `${base}.json`), {
      groupId,
      subject: meta.subject,
      addressingMode: meta.addressingMode || null,
      extractedAt: new Date().toISOString(),
      resolved: numbers.length,
      unresolved,
      totalParticipants: participants.length,
      unresolvedSamples,
      members: details
    }, { spaces: 2 });

    return {
      groupId,
      subject: meta.subject,
      count: numbers.length,
      unresolved,
      totalParticipants: participants.length,
      numbers,
      numbersE164,
      unresolvedSamples,
      sampleParticipants: this._sampleRaw(participants, 3),
      file: txtPlus,
      pdfFile,
      debugFile,
      downloadUrl: `/api/downloads/${txtPlus}`,
      downloadUrlDigits: `/api/downloads/${txtDigits}`,
      downloadUrlPdf: `/api/downloads/${pdfFile}`,
      downloadUrlDebug: `/api/downloads/${debugFile}`,
      note: numbers.length
        ? `Resolved ${numbers.length} real phones / ${participants.length} members.`
        : `0 phones resolved. WhatsApp returned LID-only participants for this group. Open debug JSON to inspect raw fields. LID→phone is only available if this account already has a mapping (prior chat/contact).`
    };
  }

  _writePdf(filepath, info) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);
      doc.fontSize(16).text('WhatsApp Group Extract', { align: 'left' });
      doc.moveDown(0.4);
      doc.fontSize(11).fillColor('#333')
        .text(`Group: ${info.subject}`)
        .text(`ID: ${info.groupId}`)
        .text(`Real phones: ${info.resolved} / ${info.totalParticipants}`)
        .text(`Unresolved (LID/unknown): ${info.unresolved}`)
        .text(`Date: ${new Date().toISOString()}`);
      doc.moveDown();
      if (!info.numbersE164.length) {
        doc.fontSize(11).fillColor('#b91c1c')
          .text('No phone numbers could be resolved from this group.');
        doc.moveDown(0.5);
        doc.fontSize(9).fillColor('#666').text(
          'WhatsApp multi-device API often returns Linked Identity (@lid) instead of phone numbers. ' +
          'Those IDs cannot be converted to mobiles unless this session already learned a mapping from prior messages or contacts.'
        );
      } else {
        doc.fontSize(10).fillColor('#000');
        info.numbersE164.forEach((n, i) => {
          doc.text(`${String(i + 1).padStart(4, ' ')}.  ${n}`);
        });
      }
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  async addMembers(sessionId, groupId, numbers) {
    const sock = sessionManager.getSocket(sessionId);
    const results = { success: [], failed: [] };
    const jids = [];
    for (const num of numbers) {
      let n = digitsOnly(num);
      if (n.startsWith('0') && n.length <= 10) n = '972' + n.slice(1);
      if (n.length >= 8 && n.length <= 15) jids.push(n + '@s.whatsapp.net');
    }
    const chunkSize = 5;
    for (let i = 0; i < jids.length; i += chunkSize) {
      const chunk = jids.slice(i, i + chunkSize);
      try {
        const res = await sock.groupParticipantsUpdate(groupId, chunk, 'add');
        for (const r of res || []) {
          if (String(r.status) === '200') results.success.push(r.jid || r);
          else results.failed.push({ jid: r.jid, status: r.status });
        }
      } catch (e) {
        for (const j of chunk) results.failed.push({ jid: j, error: e.message });
      }
      if (i + chunkSize < jids.length) {
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 2500));
      }
    }
    return results;
  }
}

export default new GroupService();
