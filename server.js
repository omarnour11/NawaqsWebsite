/**
 * Nawaqss Wishlist & Waitlist Server (Production-Ready ESM)
 * Zero-dependency Node.js HTTP server (ES Module).
 * Serves static landing page, admin portal, and securely appends leads to CSV and JSON.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = __dirname;

// Auto-load .env file if present (zero external dependencies)
const envFile = path.join(BASE_DIR, '.env');
if (fs.existsSync(envFile)) {
  try {
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line && !line.startsWith('#') && line.includes('=')) {
        const idx = line.indexOf('=');
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  } catch (err) {
    console.warn('[Warning] Could not load .env:', err.message);
  }
}

const PORT = parseInt(process.env.PORT || '8080', 10);
const ADMIN_KEY = (process.env.ADMIN_SECRET_KEY || '0102014+omarO').trim();

const CSV_FILE = path.join(BASE_DIR, 'wishlist_leads.csv');
const JSON_FILE = path.join(BASE_DIR, 'wishlist_leads.json');

const CSV_HEADERS = [
  'كود الطلب',
  'تاريخ التسجيل (UTC)',
  'الصفة',
  'الاسم بالكامل',
  'رقم الموبايل',
  'البريد الإلكتروني',
  'المحافظة',
  'المدينة أو المنطقة',
  'طريقة التواصل المفضلة',
  'ملاحظات إضافية',
  'IP العميل'
];

function initStorage() {
  if (!fs.existsSync(CSV_FILE)) {
    // Write UTF-8 BOM (\uFEFF) so Excel opens Arabic text correctly
    const headerRow = '\uFEFF' + CSV_HEADERS.map(h => `"${h}"`).join(',') + '\r\n';
    fs.writeFileSync(CSV_FILE, headerRow, 'utf8');
    console.log(`[Storage] Initialized CSV: ${CSV_FILE}`);
  }
  if (!fs.existsSync(JSON_FILE)) {
    fs.writeFileSync(JSON_FILE, JSON.stringify([], null, 2), 'utf8');
    console.log(`[Storage] Initialized JSON: ${JSON_FILE}`);
  }
}

function escapeCsvField(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

function appendLead(leadData, clientIp) {
  const refId = leadData.id || `NWQ-WL-${Date.now().toString().slice(-6)}`;
  const createdAt = leadData.createdAt || new Date().toISOString();
  const role = leadData.role || 'مريض';
  const fullName = (leadData.fullName || '').trim();
  const phone = (leadData.phone || '').trim();
  const email = (leadData.email || '').trim();
  const gov = (leadData.governorate || '').trim();
  const city = (leadData.cityArea || '').trim();
  const contactPref = (leadData.contactPreference || 'whatsapp').trim();
  const notes = (leadData.notes || '').trim();

  const row = [
    refId,
    createdAt,
    role,
    fullName,
    phone,
    email,
    gov,
    city,
    contactPref,
    notes,
    clientIp
  ].map(escapeCsvField).join(',') + '\r\n';

  // 1. Append to CSV
  fs.appendFileSync(CSV_FILE, row, 'utf8');

  // 2. Append to JSON
  let records = [];
  try {
    const raw = fs.readFileSync(JSON_FILE, 'utf8');
    records = JSON.parse(raw);
  } catch (e) {
    records = [];
  }

  const newRecord = {
    id: refId,
    createdAt,
    role,
    fullName,
    phone,
    email,
    governorate: gov,
    cityArea: city,
    contactPreference: contactPref,
    notes,
    clientIp
  };
  records.push(newRecord);
  fs.writeFileSync(JSON_FILE, JSON.stringify(records, null, 2), 'utf8');

  return newRecord;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8'
};

function verifyAdminKey(candidate) {
  if (!candidate || !ADMIN_KEY) return false;
  const clean = candidate.trim();
  return clean === ADMIN_KEY || clean.replace(/ /g, '+') === ADMIN_KEY;
}

const server = http.createServer((req, res) => {
  // Use WHATWG URL API to avoid DEP0169 deprecation warning
  const baseURL = `http://${req.headers.host || 'localhost'}`;
  const parsedUrl = new URL(req.url, baseURL);
  const pathname = parsedUrl.pathname;
  const query = Object.fromEntries(parsedUrl.searchParams.entries());

  // ── Alias /admin -> admin.html ──
  if (pathname === '/admin' || pathname === '/admin/') {
    res.writeHead(302, { 'Location': '/admin.html' });
    res.end();
    return;
  }

  // ── POST /api/wishlist ──
  if (req.method === 'POST' && pathname === '/api/wishlist') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        if (clientIp.includes(',')) {
          clientIp = clientIp.split(',')[0].trim();
        }
        const saved = appendLead(data, clientIp);

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: true,
          message: 'تم تسجيل بياناتك بنجاح في قائمة الوصول المبكر لمنصة Nawaqss',
          lead: saved
        }));
        console.log(`[Lead] ${saved.role}: ${saved.fullName} (${saved.phone}) - ${saved.governorate}`);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // ── Protected Admin CSV Export ──
  if (req.method === 'GET' && (pathname === '/api/admin/export' || pathname === '/api/wishlist/export')) {
    const reqKey = (query.key || '').trim();
    if (!verifyAdminKey(reqKey)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'غير مصرح: مفتاح الإدارة غير صحيح أو مفقود. استخدم ?key=YOUR_KEY' }));
      return;
    }

    initStorage();
    const stat = fs.statSync(CSV_FILE);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="nawaqss_wishlist_leads.csv"',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    const readStream = fs.createReadStream(CSV_FILE);
    readStream.pipe(res);
    return;
  }

  // ── Protected Admin Leads Data API ──
  if (req.method === 'GET' && pathname === '/api/admin/leads') {
    const reqKey = (query.key || '').trim();
    if (!verifyAdminKey(reqKey)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'المفتاح السري غير صحيح' }));
      return;
    }

    initStorage();
    let records = [];
    try {
      records = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
    } catch (_) {}

    const reversed = [...records].reverse();
    const stats = {
      success: true,
      total: records.length,
      patients: records.filter(r => r.role === 'مريض').length,
      pharmacies: records.filter(r => r.role === 'صيدلية').length,
      leads: reversed
    };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify(stats));
    return;
  }

  // ── Public Safe Stats ──
  if (req.method === 'GET' && pathname === '/api/wishlist/stats') {
    initStorage();
    let records = [];
    try {
      records = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
    } catch (_) {}

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ totalLeads: records.length }));
    return;
  }

  // ── High-speed In-Memory Asset Cache (Guarantees Vercel & Serverless delivery) ──
  if (pathname === '/assets/app-icon.png' || pathname === '/public/assets/app-icon.png') {
    const imgBuf = Buffer.from('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', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': imgBuf.length,
      'Cache-Control': 'public, max-age=31536000, immutable'
    });
    res.end(imgBuf);
    return;
  }

  // ── Static Files Serving ──
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  const filePath = path.join(BASE_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found - Nawaqss');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

initStorage();
server.listen(PORT, () => {
  console.log('='.repeat(65));
  console.log(`✨ Nawaqss Wishlist Production Server is running on port: ${PORT}`);
  console.log(`🌐 Public Landing Page:  http://localhost:${PORT}/`);
  console.log(`🔐 Protected Admin:       http://localhost:${PORT}/admin.html`);
  console.log(`🔑 Current Admin Key:     ${ADMIN_KEY}`);
  console.log(`📁 Leads CSV:            ${CSV_FILE}`);
  console.log(`📁 Leads JSON:           ${JSON_FILE}`);
  console.log('='.repeat(65));
});
