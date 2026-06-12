#!/usr/bin/env node

import { createInterface } from 'readline';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

const CLIENTS = {
  1: {
    name: 'Claude Code',
    key: 'mcpServers',
    configPath() { return join(homedir(), '.claude', 'settings.json'); },
  },
  2: {
    name: 'Claude Desktop',
    key: 'mcpServers',
    configPath() {
      return platform() === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
        : join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
    },
  },
  3: {
    name: 'Cursor',
    key: 'mcpServers',
    configPath() { return join(process.cwd(), '.cursor', 'mcp.json'); },
  },
  4: {
    name: 'VS Code (Copilot)',
    key: 'servers',
    configPath() { return join(process.cwd(), '.vscode', 'mcp.json'); },
  },
  5: {
    name: 'Windsurf',
    key: 'mcpServers',
    configPath() { return join(homedir(), '.codeium', 'windsurf', 'mcp_config.json'); },
  },
};

async function main() {
  console.log('\n  Take Time MCP Server — Setup\n');
  console.log('  This will configure your AI client to connect to Take Time.\n');

  // 1. Credentials
  const email = await ask('  Email (Take Time account): ');
  const password = await ask('  Password: ');

  if (!email || !password) {
    console.log('\n  Error: email and password are required.\n');
    process.exit(1);
  }

  // 2. Test auth
  console.log('\n  Testing authentication...');
  try {
    const { SupabaseClient } = await import('./supabase.js');
    const db = new SupabaseClient('pending');
    await db.loginWithCredentials(email, password);
    console.log('  Authentication successful!\n');
  } catch (e) {
    console.log(`  Authentication failed: ${e.message}`);
    console.log('  Check your email/password and try again.\n');
    process.exit(1);
  }

  // 3. Client selection
  console.log('  Select your AI client:\n');
  Object.entries(CLIENTS).forEach(([num, c]) => {
    console.log(`    ${num}. ${c.name}`);
  });
  console.log();

  const choice = await ask('  Choice (1-5): ');
  const client = CLIENTS[choice];
  if (!client) {
    console.log('\n  Invalid choice.\n');
    process.exit(1);
  }

  // 4. Build config
  const serverPath = new URL('./index.js', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
  const mcpEntry = {
    taketime: {
      command: 'node',
      args: [serverPath],
      env: {
        TAKETIME_EMAIL: email,
        TAKETIME_PASSWORD: password,
      },
    },
  };

  const configPath = client.configPath();
  let config = {};

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch { config = {}; }
  }

  if (!config[client.key]) config[client.key] = {};
  config[client.key].taketime = mcpEntry.taketime;

  // 5. Write config
  const dir = join(configPath, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  console.log(`\n  Config written to: ${configPath}`);
  console.log(`\n  Restart ${client.name} to start using Take Time MCP.\n`);
  console.log('  Try asking: "What do I have scheduled for today?"\n');

  rl.close();
}

main().catch(e => {
  console.error(`  Error: ${e.message}`);
  process.exit(1);
});
