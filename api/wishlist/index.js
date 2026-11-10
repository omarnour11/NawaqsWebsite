import { saveLead, getLeads } from '../_storage.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { body = {}; }
    }
    body = body || {};

    const fullName = (body.fullName || '').trim();
    const phone = (body.phone || '').trim();

    if (!fullName || !phone) {
      return res.status(400).json({ error: 'الاسم بالكامل ورقم الهاتف مطلوبان' });
    }

    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '127.0.0.1';
    const saved = saveLead(body, clientIp);
    return res.status(200).json({ success: true, lead: saved });
  }

  if (req.method === 'GET') {
    const leads = getLeads();
    return res.status(200).json({ success: true, total: leads.length });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
