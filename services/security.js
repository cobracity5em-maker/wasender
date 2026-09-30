/**
 * Security middleware — headers, rate limits, basic hardening
 */
const loginHits = new Map(); // ip -> { count, resetAt }
const apiHits = new Map();

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

function prune(map, now) {
  for (const [k, v] of map) {
    if (v.resetAt < now) map.delete(k);
  }
}

/**
 * Rate limit: max N requests per windowMs per IP for a given bucket map
 */
function rateLimit({ windowMs = 60_000, max = 60, map = apiHits, message = 'rate_limited' } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    if (Math.random() < 0.02) prune(map, now);
    const ip = clientIp(req);
    let row = map.get(ip);
    if (!row || row.resetAt < now) {
      row = { count: 0, resetAt: now + windowMs };
      map.set(ip, row);
    }
    row.count++;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - row.count)));
    if (row.count > max) {
      return res.status(429).json({ success: false, error: message });
    }
    next();
  };
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // CSP: allow self + inline for existing UI (no CDN required)
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self' ws: wss:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; ')
  );
  // Don't advertise stack
  res.removeHeader('X-Powered-By');
  next();
}

/** Block common probe paths */
function blockProbes(req, res, next) {
  const p = (req.path || '').toLowerCase();
  const blocked = [
    '/.env', '/.git', '/wp-admin', '/wp-login', '/phpmyadmin',
    '/admin.php', '/xmlrpc.php', '/server-status', '/config.json',
    '/.aws', '/actuator', '/vendor/phpunit'
  ];
  if (blocked.some(b => p === b || p.startsWith(b + '/'))) {
    return res.status(404).end();
  }
  next();
}

export default {
  clientIp,
  rateLimit,
  securityHeaders,
  blockProbes,
  loginHits
};
