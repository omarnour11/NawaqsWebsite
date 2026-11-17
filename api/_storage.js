import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ── Auto-load .env file if present in ROOT_DIR ─────────────────────
const envFile = path.join(ROOT_DIR, '.env');
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
    console.warn('[Storage] Could not auto-load .env:', err.message);
  }
}

const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT || process.env.NETLIFY);
const STORAGE_DIR = IS_SERVERLESS ? os.tmpdir() : ROOT_DIR;
const JSON_FILE = path.join(STORAGE_DIR, 'wishlist_leads.json');
const CSV_FILE = path.join(STORAGE_DIR, 'wishlist_leads.csv');
const SEED_JSON = path.join(ROOT_DIR, 'wishlist_leads.json');

let inMemoryLeads = [];

export function getAdminKey() {
  return (process.env.ADMIN_SECRET_KEY || '0102014+omarO').trim();
}

export function verifyAdminKey(candidate) {
  if (!candidate) return false;
  const adminKey = getAdminKey();
  const c = String(candidate).trim();
  if (c === adminKey) return true;
  if (c.replace(/ /g, '+') === adminKey) return true;
  return false;
}

// ── Database Connection Pool (PostgreSQL / Supabase / Neon) ─────────
let pgPool = null;
let dbTableEnsured = false;

function getDbConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.NEON_DATABASE_URL ||
    ''
  ).trim();
}

function getPgPool() {
  const connString = getDbConnectionString();
  if (!connString) return null;
  if (!pgPool) {
    const isLocal = connString.includes('localhost') || connString.includes('127.0.0.1');
    pgPool = new Pool({
      connectionString: connString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pgPool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]:', err.message);
    });
  }
  return pgPool;
}

function getSeedLeads() {
  try {
    if (fs.existsSync(SEED_JSON)) {
      const data = JSON.parse(fs.readFileSync(SEED_JSON, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (_) {}
  return [];
}

async function ensureDbTable() {
  const pool = getPgPool();
  if (!pool || dbTableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wishlist_leads (
        id VARCHAR(64) PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        role VARCHAR(64) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        phone VARCHAR(64) NOT NULL,
        email VARCHAR(255),
        governorate VARCHAR(128) NOT NULL,
        city_area VARCHAR(128) NOT NULL,
        contact_preference VARCHAR(64) DEFAULT 'whatsapp',
        notes TEXT,
        client_ip VARCHAR(64)
      );
    `);

    // Seed existing leads if table is empty
    const countCheck = await pool.query('SELECT COUNT(*) as count FROM wishlist_leads;');
    const count = parseInt(countCheck.rows[0].count, 10);
    if (count === 0) {
      const seeds = getSeedLeads();
      for (const s of seeds) {
        await pool.query(
          `INSERT INTO wishlist_leads (id, created_at, role, full_name, phone, email, governorate, city_area, contact_preference, notes, client_ip)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING;`,
          [
            s.id,
            s.createdAt || new Date().toISOString(),
            s.role || 'مريض',
            s.fullName,
            s.phone,
            s.email || null,
            s.governorate,
            s.cityArea,
            s.contactPreference || 'whatsapp',
            s.notes || null,
            s.clientIp || '127.0.0.1'
          ]
        );
      }
    }
    dbTableEnsured = true;
  } catch (err) {
    console.error('[Storage DB Init Error]:', err.message);
  }
}

const DEFAULT_GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbx--zvjmKNmPJXMdDgI8zgS3luIvOqff_Ocpyj77SVbo9EAtBE1SZnZgJFKzDXBtR5aSQ/exec';

// ── Google Sheets Webhook Sync ─────────────────────────────────────
async function syncToGoogleSheet(lead) {
  const webhookUrl = (process.env.GOOGLE_SHEET_WEBHOOK_URL || process.env.WEBHOOK_URL || DEFAULT_GOOGLE_SHEET_URL).trim();
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: lead.id,
        createdAt: lead.createdAt,
        role: lead.role,
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email || '',
        governorate: lead.governorate,
        cityArea: lead.cityArea,
        contactPreference: lead.contactPreference,
        notes: lead.notes || '',
        clientIp: lead.clientIp || ''
      })
    });
    if (!res.ok) {
      console.warn('[Google Sheet Sync Status]:', res.status, res.statusText);
    }
  } catch (err) {
    console.warn('[Google Sheet Sync Error]:', err.message);
  }
}

// ── Telegram Notification (Optional) ────────────────────────────────
async function sendTelegramAlert(lead) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId) return;
  try {
    const text =
      `🔔 *تسجيل جديد في منصة نواقص (Nawaqss Leads)*\n\n` +
      `👤 *الاسم:* ${lead.fullName}\n` +
      `🏷️ *الصفة:* ${lead.role}\n` +
      `📱 *رقم الموبايل:* \`${lead.phone}\`\n` +
      `📧 *البريد:* ${lead.email || '-'}\n` +
      `📍 *المحافظة:* ${lead.governorate} · ${lead.cityArea}\n` +
      `💬 *التواصل المفصل:* ${lead.contactPreference}\n` +
      `📝 *ملاحظات:* ${lead.notes || '-'}\n` +
      `🆔 *الكود:* \`${lead.id}\``;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })
    });
  } catch (err) {
    console.warn('[Telegram Alert Error]:', err.message);
  }
}

// ── Local File Storage Fallback ────────────────────────────────────
function getLocalFileLeads() {
  try {
    if (fs.existsSync(JSON_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryLeads = parsed;
        return inMemoryLeads;
      }
    }
    // Fallback to seed in ROOT_DIR
    if (fs.existsSync(SEED_JSON) && SEED_JSON !== JSON_FILE) {
      const parsed = JSON.parse(fs.readFileSync(SEED_JSON, 'utf8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryLeads = parsed;
        return inMemoryLeads;
      }
    }
  } catch (e) {
    console.warn('[Local File Read Warning]:', e.message);
  }
  return inMemoryLeads;
}

export function getStorageInfo() {
  const dbUrl = getDbConnectionString();
  const googleSheetUrl = (process.env.GOOGLE_SHEET_WEBHOOK_URL || process.env.WEBHOOK_URL || DEFAULT_GOOGLE_SHEET_URL).trim();
  return {
    type: dbUrl ? 'postgres' : (IS_SERVERLESS ? 'ephemeral_serverless' : 'file'),
    dbConnected: !!dbUrl,
    googleSheetConnected: !!googleSheetUrl,
    isServerless: IS_SERVERLESS
  };
}

export async function getLeads() {
  const pool = getPgPool();
  if (pool) {
    try {
      await ensureDbTable();
      const res = await pool.query('SELECT * FROM wishlist_leads ORDER BY created_at DESC;');
      const leads = res.rows.map((r) => ({
        id: r.id,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        role: r.role,
        fullName: r.full_name,
        phone: r.phone,
        email: r.email || '',
        governorate: r.governorate,
        cityArea: r.city_area,
        contactPreference: r.contact_preference,
        notes: r.notes || '',
        clientIp: r.client_ip || ''
      }));
      inMemoryLeads = leads;
      return leads;
    } catch (err) {
      console.error('[Storage DB Read Error - Falling back to local]:', err.message);
    }
  }

  return getLocalFileLeads();
}

export async function saveLead(leadData, clientIp) {
  const refId = leadData.id || ('NWQ-WL-' + Math.floor(1000 + Math.random() * 9000));
  const role = (leadData.role || 'مريض').trim();
  const fullName = (leadData.fullName || '').trim();
  const phone = (leadData.phone || '').trim();
  const email = (leadData.email || '').trim() || null;
  const governorate = (leadData.governorate || '').trim();
  const cityArea = (leadData.cityArea || '').trim();
  const contactPreference = (leadData.contactPreference || 'whatsapp').trim();
  const notes = (leadData.notes || '').trim() || null;
  const createdAt = leadData.createdAt || new Date().toISOString();

  const newLead = {
    id: refId,
    createdAt,
    role,
    fullName,
    phone,
    email: email || '',
    governorate,
    cityArea,
    contactPreference,
    notes: notes || '',
    clientIp: clientIp || '127.0.0.1'
  };

  // 1. Save to PostgreSQL if configured
  const pool = getPgPool();
  if (pool) {
    try {
      await ensureDbTable();
      await pool.query(
        `INSERT INTO wishlist_leads (id, created_at, role, full_name, phone, email, governorate, city_area, contact_preference, notes, client_ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           role = EXCLUDED.role,
           full_name = EXCLUDED.full_name,
           phone = EXCLUDED.phone,
           email = EXCLUDED.email,
           governorate = EXCLUDED.governorate,
           city_area = EXCLUDED.city_area,
           contact_preference = EXCLUDED.contact_preference,
           notes = EXCLUDED.notes,
           client_ip = EXCLUDED.client_ip;`,
        [
          newLead.id,
          newLead.createdAt,
          newLead.role,
          newLead.fullName,
          newLead.phone,
          newLead.email || null,
          newLead.governorate,
          newLead.cityArea,
          newLead.contactPreference,
          newLead.notes || null,
          newLead.clientIp
        ]
      );
    } catch (err) {
      console.error('[Storage DB Write Error]:', err.message);
    }
  }

  // 2. Background non-blocking syncs: Google Sheet & Telegram
  syncToGoogleSheet(newLead).catch(() => {});
  sendTelegramAlert(newLead).catch(() => {});

  // 3. Keep in-memory and local files updated
  const leads = await getLeads();
  const existingIdx = leads.findIndex(l => (l.id && l.id === refId) || (l.phone === phone && l.fullName === fullName));
  if (existingIdx >= 0) {
    leads[existingIdx] = { ...leads[existingIdx], ...newLead };
  } else {
    leads.unshift(newLead);
  }
  inMemoryLeads = leads;

  try {
    fs.writeFileSync(JSON_FILE, JSON.stringify(leads, null, 2), 'utf8');
    if (!IS_SERVERLESS && SEED_JSON !== JSON_FILE) {
      fs.writeFileSync(SEED_JSON, JSON.stringify(leads, null, 2), 'utf8');
    }
  } catch (e) {
    console.warn('[Storage File Save Warning]:', e.message);
  }

  return newLead;
}

export async function generateCsv() {
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

  function escapeCsvField(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return '"' + str + '"';
  }

  const leads = await getLeads();
  let csv = '\uFEFF' + CSV_HEADERS.map(escapeCsvField).join(',') + '\r\n';
  for (const l of leads) {
    const row = [
      l.id || '',
      l.createdAt || '',
      l.role || '',
      l.fullName || '',
      l.phone || '',
      l.email || '',
      l.governorate || '',
      l.cityArea || '',
      l.contactPreference || '',
      l.notes || '',
      l.clientIp || ''
    ];
    csv += row.map(escapeCsvField).join(',') + '\r\n';
  }
  return csv;
}
