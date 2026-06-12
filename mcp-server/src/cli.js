#!/usr/bin/env node

const command = process.argv[2];

if (command === 'setup') {
  import('./setup.js');
} else {
  import('./index.js');
}
