#!/usr/bin/env node

const command = process.argv[2];

if (command === 'setup') {
  import('./setup.js').catch(e => { console.error(e); process.exit(1); });
} else {
  import('./index.js').catch(e => { console.error(e); process.exit(1); });
}
