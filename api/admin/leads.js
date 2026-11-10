import { verifyAdminKey, getLeads } from '../_storage.js';

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

  const leads = getLeads();
  const patients = leads.filter(l => l.role === 'مريض').length;
  const pharmacies = leads.filter(l => l.role === 'صيدلية').length;

  return res.status(200).json({
    success: true,
    total: leads.length,
    patients,
    pharmacies,
    leads
  });
}
