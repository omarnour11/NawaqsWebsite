import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP_DIR = os.tmpdir();
const JSON_FILE = path.join(TMP_DIR, 'nawaqss_leads.json');

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

export function getLeads() {
  try {
    if (fs.existsSync(JSON_FILE)) {
      const data = fs.readFileSync(JSON_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        inMemoryLeads = parsed;
        return inMemoryLeads;
      }
    }
  } catch (e) {
    console.error('Error reading leads:', e);
  }
  return inMemoryLeads;
}

export function saveLead(leadData, clientIp) {
  const leads = getLeads();
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
    email,
    governorate,
    cityArea,
    contactPreference,
    notes,
    clientIp: clientIp || '127.0.0.1'
  };

  const existingIdx = leads.findIndex(l => (l.id && l.id === refId) || (l.phone === phone && l.fullName === fullName));
  if (existingIdx >= 0) {
    leads[existingIdx] = { ...leads[existingIdx], ...newLead };
  } else {
    leads.unshift(newLead);
  }

  inMemoryLeads = leads;

  try {
    fs.writeFileSync(JSON_FILE, JSON.stringify(leads, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving leads to file:', e);
  }

  return newLead;
}

export function generateCsv() {
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

  const leads = getLeads();
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
