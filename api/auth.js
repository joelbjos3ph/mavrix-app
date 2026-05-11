import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body   = req.body ?? {};
  const parsed = typeof body === 'string' ? JSON.parse(body) : body;
  const { email, passwordHash } = parsed;

  if (!email || !passwordHash) {
    return res.status(400).json({ error: 'email and passwordHash required' });
  }

  const gasUrl = process.env.GAS_URL;
  const secret = process.env.JWT_SECRET;
  if (!gasUrl) return res.status(500).json({ error: 'GAS_URL not configured on server.' });
  if (!secret) return res.status(500).json({ error: 'JWT_SECRET not configured on server.' });

  // Validate credentials via Google Apps Script
  let gasData;
  try {
    const gasRes = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, passwordHash })
    });
    gasData = await gasRes.json();
  } catch (err) {
    console.error('[auth] GAS fetch failed:', err.message);
    return res.status(502).json({ error: 'Could not reach authentication service.' });
  }

  if (!gasData.success) {
    return res.status(401).json({ error: gasData.error || 'Invalid email or password.' });
  }

  // Issue a signed session token: base64url(email:timestamp).hmac
  const timestamp = Date.now();
  const payload   = Buffer.from(`${email}:${timestamp}`).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const token     = `${payload}.${signature}`;

  console.log('[auth] Issued token for:', email);

  return res.status(200).json({
    token,
    name:      gasData.name      || '',
    plan:      gasData.plan      || 'Starter',
    bizName:   gasData.bizName   || '',
    industry:  gasData.industry  || '',
    audience:  gasData.audience  || '',
    valueProp: gasData.valueProp || '',
    brandTone: gasData.brandTone || ''
  });
}
