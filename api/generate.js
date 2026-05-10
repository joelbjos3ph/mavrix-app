export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body ?? {};
  const prompt = typeof body === 'string' ? JSON.parse(body).prompt : body.prompt;

  if (!prompt || typeof prompt !== 'string' || prompt.length > 8000) {
    return res.status(400).json({ error: 'prompt is required (max 8000 chars).' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[generate] ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  const requestBody = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  };

  console.log('[generate] Request to Anthropic:', {
    url: 'https://api.anthropic.com/v1/messages',
    model: requestBody.model,
    promptLength: prompt.length,
    apiKeyPrefix: apiKey.substring(0, 10) + '...'
  });

  let anthropicRes;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });
  } catch (err) {
    console.error('[generate] Network error reaching Anthropic:', err.message);
    return res.status(502).json({ error: 'Could not reach Anthropic API.' });
  }

  const data = await anthropicRes.json();

  console.log('[generate] Anthropic response:', {
    status: anthropicRes.status,
    ok: anthropicRes.ok,
    body: JSON.stringify(data)
  });

  if (!anthropicRes.ok) {
    return res.status(502).json({ error: data.error?.message || 'Anthropic API error.' });
  }

  return res.status(200).json({ text: data.content[0]?.text ?? '' });
}
