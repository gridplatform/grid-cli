#!/usr/bin/env node
'use strict';

/**
 * `grid` launcher — always runs the fast compiled CLI.
 *
 * You don't pick dist vs tsx: this rebuilds when src is newer, then runs node.
 * That way everyday `grid …` stays quick without thinking about build artifacts.
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const distEntry = path.join(root, 'dist', 'index.js');
const srcRoot = path.join(root, 'src');

function newestMtime(dir) {
  let newest = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      newest = Math.max(newest, newestMtime(full));
      continue;
    }
    if (!ent.isFile()) continue;
    try {
      newest = Math.max(newest, fs.statSync(full).mtimeMs);
    } catch {
      /* ignore */
    }
  }
  return newest;
}

function needsRebuild() {
  if (!fs.existsSync(distEntry)) return true;
  const distM = fs.statSync(distEntry).mtimeMs;
  if (newestMtime(srcRoot) > distM) return true;
  try {
    if (fs.statSync(path.join(root, 'package.json')).mtimeMs > distM) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function rebuild() {
  const tscLocal = path.join(root, 'node_modules', '.bin', 'tsc');
  const cmd = fs.existsSync(tscLocal) ? tscLocal : 'tsc';
  const result = spawnSync(cmd, ['-p', root], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
  if (!fs.existsSync(distEntry)) {
    console.error('grid: build finished but dist/index.js is missing');
    process.exit(1);
  }
}

if (needsRebuild()) {
  rebuild();
}

require(distEntry);
