import { verifyAdminKey, generateCsv } from '../_storage.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const key = req.query?.key || (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : '');
  if (!verifyAdminKey(key)) {
    return res.status(401).json({ error: 'Unauthorized: Admin key is invalid' });
  }

  const csv = generateCsv();
  const filename = 'nawaqss_wishlist_leads_' + new Date().toISOString().slice(0, 10) + '.csv';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  return res.status(200).send(csv);
}
