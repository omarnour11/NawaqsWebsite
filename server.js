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
