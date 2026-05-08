#!/usr/bin/env node
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(res => rl.question(q, res));

(async () => {
  const usersPath = path.join(__dirname, '..', 'users.js');

  console.log('\n── Add Mavrix User ──\n');
  const name = (await ask('Name: ')).trim();
  const email = (await ask('Email: ')).trim().toLowerCase();
  const plan = (await ask('Plan (Starter/Pro/Enterprise) [Pro]: ')).trim() || 'Pro';
  const password = await ask('Password: ');
  rl.close();

  if (!name || !email || !password) {
    console.error('\nAll fields are required.');
    process.exit(1);
  }

  delete require.cache[require.resolve(usersPath)];
  const users = require(usersPath);

  if (users.find(u => u.email === email)) {
    console.error(`\nUser ${email} already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  users.push({ name, email, plan, passwordHash });

  const content = `// Manage users with: npm run add-user\nmodule.exports = ${JSON.stringify(users, null, 2)};\n`;
  fs.writeFileSync(usersPath, content);

  console.log(`\nUser "${name}" (${email}) added on ${plan} plan.`);
})();
