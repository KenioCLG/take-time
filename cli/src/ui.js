// Terminal UI helpers — colors, tables, prompts

const ESC = '\x1b[';
export const c = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  italic: `${ESC}3m`,
  underline: `${ESC}4m`,
  // Colors
  red: (s) => `${ESC}31m${s}${ESC}0m`,
  green: (s) => `${ESC}32m${s}${ESC}0m`,
  yellow: (s) => `${ESC}33m${s}${ESC}0m`,
  blue: (s) => `${ESC}34m${s}${ESC}0m`,
  magenta: (s) => `${ESC}35m${s}${ESC}0m`,
  cyan: (s) => `${ESC}36m${s}${ESC}0m`,
  white: (s) => `${ESC}37m${s}${ESC}0m`,
  gray: (s) => `${ESC}90m${s}${ESC}0m`,
  // Bright
  brightGreen: (s) => `${ESC}92m${s}${ESC}0m`,
  brightYellow: (s) => `${ESC}93m${s}${ESC}0m`,
  brightCyan: (s) => `${ESC}96m${s}${ESC}0m`,
  // BG
  bgGreen: (s) => `${ESC}42m${ESC}30m${s}${ESC}0m`,
  bgRed: (s) => `${ESC}41m${ESC}37m${s}${ESC}0m`,
  bgBlue: (s) => `${ESC}44m${ESC}37m${s}${ESC}0m`,
  bgYellow: (s) => `${ESC}43m${ESC}30m${s}${ESC}0m`,
};

export function bold(s) { return `${ESC}1m${s}${ESC}0m`; }
export function dim(s) { return `${ESC}2m${s}${ESC}0m`; }

export function banner() {
  console.log('');
  console.log(c.cyan('  ████████╗ █████╗ ██╗  ██╗███████╗'));
  console.log(c.cyan('  ╚══██╔══╝██╔══██╗██║ ██╔╝██╔════╝'));
  console.log(c.cyan('     ██║   ███████║█████╔╝ █████╗  '));
  console.log(c.cyan('     ██║   ██╔══██║██╔═██╗ ██╔══╝  '));
  console.log(c.cyan('     ██║   ██║  ██║██║  ██╗███████╗'));
  console.log(c.cyan('     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝'));
  console.log(c.blue('          ████████╗██╗███╗   ███╗███████╗'));
  console.log(c.blue('          ╚══██╔══╝██║████╗ ████║██╔════╝'));
  console.log(c.blue('             ██║   ██║██╔████╔██║█████╗  '));
  console.log(c.blue('             ██║   ██║██║╚██╔╝██║██╔══╝  '));
  console.log(c.blue('             ██║   ██║██║ ╚═╝ ██║███████╗'));
  console.log(c.blue('             ╚═╝   ╚═╝╚═╝     ╚═╝╚══════╝'));
  console.log('');
}

export function header(text) {
  console.log('');
  console.log(bold(c.cyan(`  ${text}`)));
  console.log(c.gray('  ' + '─'.repeat(Math.max(text.length, 40))));
}

export function success(text) { console.log(c.green(`  ✓ ${text}`)); }
export function error(text) { console.log(c.red(`  ✗ ${text}`)); }
export function warn(text) { console.log(c.yellow(`  ! ${text}`)); }
export function info(text) { console.log(c.blue(`  ℹ ${text}`)); }

export function table(headers, rows) {
  if (rows.length === 0) {
    console.log(dim('    (empty)'));
    return;
  }

  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, stripAnsi(String(row[i] ?? '')).length), 0);
    return Math.max(stripAnsi(h).length, maxData);
  });

  // Header
  const headerLine = headers.map((h, i) => padRight(h, widths[i])).join('  ');
  console.log(`    ${bold(headerLine)}`);
  console.log(`    ${widths.map(w => '─'.repeat(w)).join('──')}`);

  // Rows
  for (const row of rows) {
    const line = row.map((cell, i) => padRight(String(cell ?? ''), widths[i])).join('  ');
    console.log(`    ${line}`);
  }
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function padRight(str, len) {
  const visible = stripAnsi(str);
  const pad = Math.max(0, len - visible.length);
  return str + ' '.repeat(pad);
}

// Simple progress bar
export function progressBar(current, total, width = 20) {
  const pct = total > 0 ? current / total : 0;
  const filled = Math.round(pct * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const label = `${Math.round(pct * 100)}%`;
  return pct >= 0.8 ? c.green(`${bar} ${label}`) : pct >= 0.5 ? c.yellow(`${bar} ${label}`) : c.red(`${bar} ${label}`);
}

// Heatmap block
export function heatBlock(level) {
  const blocks = ['░', '▒', '▓', '█', '█'];
  const colors = [c.gray, c.gray, c.yellow, c.green, c.brightGreen];
  return colors[level](blocks[level]);
}

// Read line from stdin
import { createInterface } from 'readline';

export function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`  ${question}`, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function promptPassword(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    process.stdout.write(`  ${question}`);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);

    let password = '';
    const onData = (ch) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r') {
        if (stdin.isTTY) stdin.setRawMode(wasRaw || false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(password);
      } else if (c === '\x7f' || c === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (c === '\x03') {
        process.exit(0);
      } else {
        password += c;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

export function confirm(question) {
  return prompt(`${question} (y/N): `).then(a => a.toLowerCase() === 'y');
}
