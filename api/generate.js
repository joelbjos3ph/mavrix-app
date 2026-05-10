export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body ?? {};
  const parsed = typeof body === 'string' ? JSON.parse(body) : body;

  // Support both { prompt } and { messages, system }
  let messages;
  let system;

  if (parsed.messages && Array.isArray(parsed.messages)) {
    messages = parsed.messages;
    system = parsed.system || undefined;
  } else if (parsed.prompt && typeof parsed.prompt === 'string') {
    messages = [{ role: 'user', content: parsed.prompt }];
  } else {
    return res.status(400).json({ error: 'Request must include either prompt string or messages array.' });
  }

  if (!messages.length) {
    return res.status(400).json({ error: 'messages array cannot be empty.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[generate] ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  const requestBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages,
    ...(system ? { system } : {})
  };

  console.log('[generate] Request to Anthropic:', {
    model: requestBody.model,
    messageCount: messages.length,
    hasSystem: !!system,
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

  if (!anthropicRes.ok) {
    console.error('[generate] Anthropic API error', anthropicRes.status, JSON.stringify(data));
    return res.status(502).json({ error: data.error?.message || 'Anthropic API error.' });
  }

  return res.status(200).json({ text: data.content[0]?.text ?? '' });
}
