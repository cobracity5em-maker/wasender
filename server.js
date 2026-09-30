import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import fs from 'fs-extra';
import multer from 'multer';
import security from './services/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

process.on('uncaughtException', (e) => console.error('[FATAL]', e));
process.on('unhandledRejection', (e) => console.error('[REJECTION]', e));

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
await fs.ensureDir(DATA_DIR);
await fs.ensureDir(UPLOADS_DIR);
await fs.ensureDir(path.join(__dirname, 'sessions'));

let sessionManager, warmerService, messagingService, groupService, contactService, mailboxService, campaignsService, analyticsService, authService;
try {
  sessionManager = (await import('./services/sessionManager.js')).default;
  warmerService = (await import('./services/warmer.js')).default;
  messagingService = (await import('./services/messaging.js')).default;
  groupService = (await import('./services/groups.js')).default;
  contactService = (await import('./services/contacts.js')).default;
  mailboxService = (await import('./services/mailbox.js')).default;
  campaignsService = (await import('./services/campaigns.js')).default;
  analyticsService = (await import('./services/analytics.js')).default;
  authService = (await import('./services/auth.js')).default;
  await authService.ready();
  console.log('[INIT] services ok');
  try { analyticsService?.track?.({ category: 'system', action: 'boot', success: true }); } catch {}
} catch (e) {
  console.error('[INIT]', e.message);
}


app.use(security.securityHeaders);
app.use(security.blockProbes);
app.use(cors({ origin: false })); // same-origin only — browser clients on same host
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use((req, res, next) => { console.log(req.method, req.url); next(); });
app.use(express.static(PUBLIC_DIR));

// Auth gate for API
app.use(security.rateLimit({ windowMs: 60_000, max: 180 }));
app.use(async (req, res, next) => {
  if (!authService) return next();
  return authService.middleware()(req, res, next);
});

const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 20 * 1024 * 1024 } });
io.on('connection', (s) => { console.log('[SOCKET]', s.id); s.on('join-session', (id) => s.join('session-' + id)); });
sessionManager?.setIO?.(io);
warmerService?.setIO?.(io);
mailboxService?.setIO?.(io);
campaignsService?.setIO?.(io);

const ok = (res, data) => res.json({ success: true, ...data });
const fail = (res, e, c = 500) => { console.error('[API]', e?.message || e); res.status(c).json({ success: false, error: e?.message || String(e) }); };


// ——— Auth ———
app.post('/api/auth/login',
  security.rateLimit({ windowMs: 60_000, max: 10, map: security.loginHits, message: 'rate_limited' }),
  async (req, res) => {
  try {
    const { username, password, deviceId, deviceLabel } = req.body || {};
    const result = await authService.login(username, password, deviceId, deviceLabel, security.clientIp(req));
    if (result.error) return res.status(result.status || 401).json({ success: false, error: result.error, meta: result.meta });
    ok(res, { token: result.token, user: result.user, deviceId: result.deviceId });
  } catch (e) { fail(res, e); }
});
app.get('/api/auth/me', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'unauthorized' });
    ok(res, { user: authService.publicUser(req.user) });
  } catch (e) { fail(res, e); }
});
app.post('/api/auth/logout', async (req, res) => {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    await authService.logout(token);
    ok(res, {});
  } catch (e) { fail(res, e); }
});
app.post('/api/auth/change-password', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'unauthorized' });
    await authService.changePassword(req.user.id, req.body?.oldPassword, req.body?.newPassword);
    ok(res, {});
  } catch (e) { fail(res, e, e.message === 'invalid_credentials' ? 401 : 400); }
});

// ——— Admin ———
app.get('/api/admin/users', async (req, res) => {
  try { ok(res, { users: authService.listUsers() }); } catch (e) { fail(res, e); }
});
app.post('/api/admin/users', async (req, res) => {
  try { ok(res, { user: await authService.createUser(req.body || {}) }); }
  catch (e) { fail(res, e, 400); }
});
app.patch('/api/admin/users/:id', async (req, res) => {
  try { ok(res, { user: await authService.updateUser(req.params.id, req.body || {}) }); }
  catch (e) { fail(res, e, e.message === 'not_found' ? 404 : 400); }
});
app.delete('/api/admin/users/:id', async (req, res) => {
  try { ok(res, await authService.deleteUser(req.params.id)); }
  catch (e) { fail(res, e, e.message === 'not_found' ? 404 : 400); }
});
app.post('/api/admin/users/:id/revoke-device', async (req, res) => {
  try { ok(res, { user: await authService.revokeDevice(req.params.id, req.body?.deviceId) }); }
  catch (e) { fail(res, e, 400); }
});

app.get('/api/health', (req, res) => ok(res, { uptime: process.uptime(), sessions: sessionManager?.getActiveCount?.() ?? 0, warmer: warmerService?.getStatus?.()?.active ?? false, mailbox: mailboxService?.getStats?.() ?? {} }));
app.get('/api/sessions', async (req, res) => { try { ok(res, { sessions: await sessionManager.listSessions() }); } catch (e) { fail(res, e); } });
app.post('/api/sessions', async (req, res) => { try { const { name, label } = req.body || {}; if (!name) return fail(res, new Error('name required'), 400); const session = await sessionManager.createSession(String(name).trim(), label || name); try { analyticsService?.track?.({ category: 'session', action: 'create', success: true, meta: { name } }); } catch {}; ok(res, { session }); } catch (e) { fail(res, e); } });
app.post('/api/sessions/:id/start', async (req, res) => { try { const r = await sessionManager.startSession(req.params.id); try { analyticsService?.track?.({ category: 'session', action: 'start', sessionId: req.params.id, success: true }); } catch {}; ok(res, r); } catch (e) { fail(res, e); } });
app.post('/api/sessions/:id/stop', async (req, res) => { try { await sessionManager.stopSession(req.params.id); ok(res, {}); } catch (e) { fail(res, e); } });
app.delete('/api/sessions/:id', async (req, res) => { try { await sessionManager.deleteSession(req.params.id); ok(res, {}); } catch (e) { fail(res, e); } });
app.get('/api/sessions/:id/status', async (req, res) => { try { ok(res, { status: await sessionManager.getStatus(req.params.id) }); } catch (e) { fail(res, e); } });
app.get('/api/sessions/:id/qr', async (req, res) => { try { ok(res, { qr: await sessionManager.getQR(req.params.id) }); } catch (e) { fail(res, e); } });
app.post('/api/send', async (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = body.sessionId || (Array.isArray(body.sessionIds) ? body.sessionIds[0] : null);
    const { to, message } = body;
    if (!sessionId || !to || !message) return fail(res, new Error('missing'), 400);
    const result = await messagingService.sendMessage(sessionId, to, message, {
      delayMs: body.delay || 0,
      humanTyping: body.humanTyping !== false,
      emojiVary: !!body.emojiVary,
      safeProfile: body.safeProfile || 'balanced',
      delayMin: body.delayMin,
      delayMax: body.delayMax,
      maxPerHour: body.maxPerHour,
      maxPerDay: body.maxPerDay,
      quietStart: body.quietStart,
      quietEnd: body.quietEnd
    });
    ok(res, { result });
  } catch (e) { fail(res, e); }
});
app.post('/api/send-bulk', async (req, res) => {
  try {
    const body = req.body || {};
    const sessionIds = body.sessionIds || body.sessionId;
    const list = Array.isArray(body.numbers) ? body.numbers : String(body.numbers || '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const opts = {
      delayMin: body.delayMin || 12,
      delayMax: body.delayMax || 40,
      humanTyping: body.humanTyping !== false,
      emojiVary: body.emojiVary !== false,
      stopAt: body.stopAt || null,
      safeProfile: body.safeProfile || 'balanced',
      maxPerHour: body.maxPerHour,
      maxPerDay: body.maxPerDay,
      quietStart: body.quietStart || '',
      quietEnd: body.quietEnd || ''
    };
    // schedule?
    if (body.scheduleEnabled && body.startAt) {
      const startAt = body.startAt;
      const job = {
        sessionIds: Array.isArray(sessionIds) ? sessionIds : [sessionIds],
        numbers: list,
        message: body.message,
        ...opts,
        startAt,
        stopAt: body.stopAt || null
      };
      const sched = messagingService.scheduleBulk(job);
      return ok(res, { scheduled: true, ...sched });
    }
    ok(res, { result: await messagingService.sendBulk(sessionIds, list, body.message, opts) });
  } catch (e) { fail(res, e); }
});
app.post('/api/send-bulk-file'
, upload.single('file'), async (req, res) => { try { const content = await fs.readFile(req.file.path, 'utf8'); const list = content.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean); ok(res, { result: await messagingService.sendBulk(req.body.sessionId, list, req.body.message, { delayMin: 12, delayMax: 40, safeProfile: req.body.safeProfile || 'balanced', humanTyping: true }), count: list.length }); } catch (e) { fail(res, e); } });
app.get('/api/sessions/:id/groups', async (req, res) => { try { ok(res, { groups: await groupService.listGroups(req.params.id) }); } catch (e) { fail(res, e); } });
app.post('/api/groups/extract', async (req, res) => { try { ok(res, await groupService.extractMembers(req.body.sessionId, req.body.groupId)); } catch (e) { fail(res, e); } });
app.post('/api/groups/add-members', async (req, res) => { try { const list = Array.isArray(req.body.numbers) ? req.body.numbers : String(req.body.numbers || '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean); ok(res, { result: await groupService.addMembers(req.body.sessionId, req.body.groupId, list) }); } catch (e) { fail(res, e); } });
app.post('/api/groups/add-members-file', upload.single('file'), async (req, res) => { try { const content = await fs.readFile(req.file.path, 'utf8'); const list = content.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean); ok(res, { result: await groupService.addMembers(req.body.sessionId, req.body.groupId, list), count: list.length }); } catch (e) { fail(res, e); } });
app.get('/api/warmer/status', (req, res) => { try { ok(res, { status: warmerService.getStatus() }); } catch (e) { fail(res, e); } });
app.post('/api/warmer/start', async (req, res) => { try { const body = req.body || {}; const status = await warmerService.start({ sessionIds: body.sessionIds || [], mode: body.mode, intervalMin: body.intervalMin, intervalMax: body.intervalMax }); ok(res, { status }); } catch (e) { fail(res, e); } });
app.post('/api/warmer/stop', (req, res) => { try { warmerService.stop(); ok(res, {}); } catch (e) { fail(res, e); } });
app.get('/api/mailbox/chats', (req, res) => {
  try {
    const sessionId = req.query.sessionId || null;
    const type = req.query.type || null;
    const limit = Number(req.query.limit) || 200;
    ok(res, {
      chats: mailboxService.getChats({ sessionId, type, limit }),
      stats: mailboxService.getStats()
    });
  } catch (e) { fail(res, e); }
});
app.get('/api/mailbox/messages', (req, res) => {
  try {
    const { chatJid, sessionId } = req.query;
    const limit = Number(req.query.limit) || 200;
    if (chatJid) {
      ok(res, { messages: mailboxService.getMessages(chatJid, { sessionId: sessionId || null, limit }) });
    } else {
      ok(res, { messages: mailboxService.getAllRecent(limit) });
    }
  } catch (e) { fail(res, e); }
});
app.post('/api/mailbox/read', (req, res) => {
  try {
    if (req.body?.chatJid) mailboxService.markRead(req.body.chatJid);
    ok(res, {});
  } catch (e) { fail(res, e); }
});
app.get('/api/mailbox/stats', (req, res) => {
  try { ok(res, { stats: mailboxService.getStats() }); } catch (e) { fail(res, e); }
});
app.post('/api/mailbox/clear', async (req, res) => {
  try { ok(res, await mailboxService.clearAll()); } catch (e) { fail(res, e); }
});
app.post('/api/mailbox/reply', upload.single('media'), async (req, res) => {
  try {
    const sessionId = req.body?.sessionId;
    const chatJid = req.body?.chatJid;
    const message = req.body?.message || '';
    if (!sessionId || !chatJid) return fail(res, new Error('missing sessionId/chatJid'), 400);
    const mediaPath = req.file?.path || null;
    const mimetype = req.file?.mimetype || null;
    const result = await mailboxService.reply(sessionId, chatJid, message, mediaPath, mimetype);
    ok(res, { result });
  } catch (e) { fail(res, e); }
});
app.get('/api/campaigns', (req, res) => { try { ok(res, { campaigns: campaignsService.list() }); } catch (e) { fail(res, e); } });
app.get('/api/campaigns/:id', (req, res) => { try { const c = campaignsService.get(req.params.id); if (!c) return fail(res, new Error('not found'), 404); ok(res, { campaign: c }); } catch (e) { fail(res, e); } });
app.post('/api/campaigns', async (req, res) => { try { const body = { ...(req.body || {}) }; if (typeof body.numbers === 'string') body.numbers = body.numbers.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean); ok(res, { campaign: await campaignsService.create(body) }); } catch (e) { fail(res, e); } });
app.put('/api/campaigns/:id', async (req, res) => { try { const body = { ...(req.body || {}) }; if (typeof body.numbers === 'string') body.numbers = body.numbers.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean); ok(res, { campaign: await campaignsService.update(req.params.id, body) }); } catch (e) { fail(res, e); } });
app.delete('/api/campaigns/:id', async (req, res) => { try { await campaignsService.delete(req.params.id); ok(res, {}); } catch (e) { fail(res, e); } });
app.post('/api/campaigns/:id/start', async (req, res) => { try { ok(res, await campaignsService.start(req.params.id)); } catch (e) { fail(res, e); } });
app.post('/api/campaigns/:id/stop', (req, res) => { try { ok(res, { stopped: campaignsService.stop(req.params.id) }); } catch (e) { fail(res, e); } });
app.post('/api/campaigns/from-file', upload.single('file'), async (req, res) => { try { const content = await fs.readFile(req.file.path, 'utf8'); const numbers = content.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean); ok(res, { campaign: await campaignsService.create({ ...(req.body || {}), numbers }), count: numbers.length }); } catch (e) { fail(res, e); } });
app.post('/api/check-numbers', async (req, res) => { try { const list = Array.isArray(req.body.numbers) ? req.body.numbers : String(req.body.numbers || '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean); ok(res, { result: await contactService.checkNumbers(req.body.sessionId, list) }); } catch (e) { fail(res, e); } });
app.get('/api/downloads/:filename', (req, res) => { const file = path.join(DATA_DIR, path.basename(req.params.filename)); if (fs.existsSync(file)) res.download(file); else fail(res, new Error('not found'), 404); });

app.get('/api/analytics/summary', (req, res) => {
  try {
    const since = req.query.since || null;
    ok(res, { summary: analyticsService?.summary?.({ since }) || {} });
  } catch (e) { fail(res, e); }
});
app.get('/api/analytics/events', (req, res) => {
  try {
    const events = analyticsService?.query?.({
      category: req.query.category || null,
      action: req.query.action || null,
      sessionId: req.query.sessionId || null,
      since: req.query.since || null,
      until: req.query.until || null,
      limit: req.query.limit || 200
    }) || [];
    ok(res, { events });
  } catch (e) { fail(res, e); }
});
app.post('/api/analytics/clear', async (req, res) => {
  try { ok(res, await (analyticsService?.clear?.() || { ok: true })); } catch (e) { fail(res, e); }
});
app.get('/api/stats/overview', async (req, res) => {
  try {
    let sessions = [];
    try { sessions = await sessionManager.listSessions(); } catch { sessions = []; }
    const online = sessions.filter(s => s.online || ['connected','open','online','ready'].includes(String(s.status||'').toLowerCase()) || !!s.phone).length;
    let mb = {};
    try { mb = mailboxService?.getStats?.() || {}; } catch { mb = {}; }
    let warmer = {};
    try { warmer = warmerService?.getStatus?.() || {}; } catch { warmer = {}; }
    let camps = [];
    try { camps = campaignsService?.list?.() || []; } catch { camps = []; }
    const runningCamps = camps.filter(c => c.running).length;
    let summary = {};
    try { summary = analyticsService?.summary?.({}) || {}; } catch { summary = {}; }
    // heartbeat so UI never looks "dead"
    try { analyticsService?.track?.({ category: 'system', action: 'stats_poll', success: true }); } catch {}
    ok(res, {
      uptime: process.uptime(),
      sessions: { total: sessions.length, online },
      mailbox: mb,
      warmer: { running: !!warmer.running },
      campaigns: { total: camps.length, running: runningCamps },
      analytics: summary
    });
  } catch (e) {
    console.error('[stats/overview]', e);
    ok(res, {
      uptime: process.uptime(),
      sessions: { total: 0, online: 0 },
      mailbox: {},
      warmer: { running: false },
      campaigns: { total: 0, running: 0 },
      analytics: { totalEvents: 0, success: 0, fail: 0, today: 0, byCategory: {}, byAction: {} }
    });
  }
});




app.post('/api/contacts/harvest', async (req, res) => {
  try {
    const sessionId = req.body?.sessionId;
    const mode = req.body?.mode || 'all';
    if (!sessionId) return fail(res, new Error('sessionId required'), 400);
    // full harvest fills internal maps; listByMode filters by source
    try { await sessionManager.harvestContacts?.(sessionId); } catch {}
    const rows = await contactService.listByMode(sessionId, mode);
    console.log('[API] contacts harvest', sessionId, 'mode=', mode, 'count=', rows.length);
    ok(res, { count: rows.length, contacts: rows, mode });
  } catch (e) { fail(res, e); }
});

app.get('/api/contacts/:sessionId', async (req, res) => {
  try {
    const mode = req.query.mode || 'all';
    const sessionId = req.params.sessionId;
    const rows = await contactService.listByMode(sessionId, mode);
    ok(res, { contacts: rows, count: rows.length, mode });
  } catch (e) { fail(res, e); }
});
app.post('/api/contacts/export', async (req, res) => {
  try {
    const { sessionId, mode = 'all', format = 'txt' } = req.body || {};
    if (!sessionId) return fail(res, new Error('sessionId required'), 400);
    const result = await contactService.exportList(sessionId, { mode, format });
    ok(res, result);
  } catch (e) { fail(res, e); }
});
app.post('/api/contacts/import', async (req, res) => {
  try {
    const { sessionId, text = '', check = false } = req.body || {};
    if (!sessionId) return fail(res, new Error('sessionId required'), 400);
    ok(res, await contactService.importNumbers(sessionId, text, { check: !!check }));
  } catch (e) { fail(res, e); }
});
app.post('/api/contacts/import-file', upload.single('file'), async (req, res) => {
  try {
    const sessionId = req.body?.sessionId;
    if (!sessionId) return fail(res, new Error('sessionId required'), 400);
    const content = await fs.promises.readFile(req.file.path, 'utf8');
    ok(res, await contactService.importNumbers(sessionId, content, { check: req.body?.check === '1' || req.body?.check === true }));
  } catch (e) { fail(res, e); }
});


app.get('/', (req, res) => { const p = path.join(PUBLIC_DIR, 'index.html'); if (fs.existsSync(p)) res.sendFile(p); else res.send('<h1>WASender</h1>'); });
app.get('*', (req, res) => { if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not found' }); const p = path.join(PUBLIC_DIR, 'index.html'); if (fs.existsSync(p)) res.sendFile(p); else res.status(404).send('not found'); });
server.on('error', (err) => console.error('[SERVER]', err.code, err.message));
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('========================================');
  console.log('  WASender v2 RUNNING');
  console.log('  listening 0.0.0.0:' + PORT);
  console.log('========================================');
  console.log('');
});
