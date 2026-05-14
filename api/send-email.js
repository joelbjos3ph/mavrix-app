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

// Strip HTML tags to produce a plain-text fallback
function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Truncate subject to 50 characters to stay clear of length-based filters
function safeSubject(subject) {
  const s = subject.trim();
  return s.length <= 50 ? s : s.slice(0, 47) + '…';
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

  const body   = req.body ?? {};
  const parsed = typeof body === 'string' ? JSON.parse(body) : body;
  const { contacts, subject, html, fromName } = parsed;

  if (!contacts?.length || !subject || !html) {
    return res.status(400).json({ error: 'contacts, subject, and html are required.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured on server.' });
  }

  const from         = `${fromName || 'Mavrix'} <hello@mavrix.sg>`;
  const finalSubject = safeSubject(subject);

  // List-Unsubscribe points to a mailto so mailbox providers recognise it
  const unsubscribeEmail = 'unsubscribe@mavrix.sg';

  const results = [];
  for (const contact of contacts) {
    try {
      const firstName         = (contact.name || '').split(' ')[0] || 'there';
      const personalizedHtml  = html.replace(/\{\{name\}\}/g, firstName);
      const personalizedText  = htmlToText(personalizedHtml);

      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from,
          to: [contact.email],
          subject: finalSubject,
          html: personalizedHtml,
          text: personalizedText,
          headers: {
            'List-Unsubscribe':       `<mailto:${unsubscribeEmail}?subject=unsubscribe>`,
            'List-Unsubscribe-Post':  'List-Unsubscribe=One-Click',
            'X-Mailer':               'Mavrix Platform 1.0'
          }
        })
      });
      const data = await r.json();
      results.push({ email: contact.email, ok: r.ok, id: data.id, error: data.message });
    } catch (err) {
      results.push({ email: contact.email, ok: false, error: err.message });
    }
  }

  const sent = results.filter(r => r.ok).length;
  return res.status(200).json({ sent, total: contacts.length, results });
}
