import crypto from 'crypto';

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  try {
    const dot = token.lastIndexOf('.');
    if (dot < 1) return false;
    const payload   = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    const secret    = process.env.JWT_SECRET;
    if (!secret) return false;
    const expected  = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (signature.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
    const decoded   = Buffer.from(payload, 'base64url').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    if (lastColon < 0) return false;
    const timestamp = parseInt(decoded.slice(lastColon + 1), 10);
    if (isNaN(timestamp)) return false;
    return (Date.now() - timestamp) < 24 * 60 * 60 * 1000;
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers['x-session-token'];
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in again.' });
  }

  const gasUrl = process.env.GAS_URL;
  if (!gasUrl) return res.status(500).json({ error: 'GAS_URL not configured on server.' });

  const body   = req.body ?? {};
  const parsed = typeof body === 'string' ? JSON.parse(body) : body;

  let gasRes;
  try {
    gasRes = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    });
  } catch (err) {
    console.error('[account] GAS fetch failed:', err.message);
    return res.status(502).json({ error: 'Could not reach data service.' });
  }

  let data;
  try {
    data = await gasRes.json();
  } catch {
    return res.status(502).json({ error: 'Invalid response from data service.' });
  }

  return res.status(200).json(data);
}
