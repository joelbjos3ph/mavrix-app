require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const path = require('path');

const APP_HOST = process.env.APP_HOST || 'app.mavrix.sg';

const app = express();
app.use(express.json());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST']
}));

// Subdomain routing: app.mavrix.sg → dashboard, everything else → landing page
app.get('/', (req, res, next) => {
  if (req.hostname === APP_HOST) {
    return res.sendFile(path.join(__dirname, 'mavrix-app.html'));
  }
  next(); // falls through to express.static → index.html
});

app.use(express.static('.'));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const users = require('./users');
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  // Always run bcrypt to prevent timing attacks that reveal valid emails
  const hashToCheck = user?.passwordHash ?? '$2b$10$invalidhashpaddinginvalidhashpaddinginvalidhashpad0000';
  const valid = await bcrypt.compare(password, hashToCheck);

  if (!user || !valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = jwt.sign(
    { email: user.email, plan: user.plan, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, plan: user.plan, name: user.name });
});

app.post('/api/generate', requireAuth, async (req, res) => {
  const { prompt } = req.body ?? {};
  if (!prompt || typeof prompt !== 'string' || prompt.length > 4000) {
    return res.status(400).json({ error: 'prompt is required (max 4000 chars).' });
  }
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });
    res.json({ text: message.content[0]?.text ?? '' });
  } catch (err) {
    console.error('Anthropic error:', err.message);
    res.status(502).json({ error: 'Content generation failed. Please try again.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Mavrix server  →  http://localhost:${PORT}`);
  console.log(`Dashboard      →  http://localhost:${PORT}/mavrix-app.html`);
});
