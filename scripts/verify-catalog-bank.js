#!/usr/bin/env node
/**
 * Verify resourceCatalog modulePaths exist under grid-terraform.
 * Exit 1 if any "ready" path is missing.
 */
const fs = require('fs');
const path = require('path');

const bankRoot = path.resolve(__dirname, '../../grid-terraform');
const catalogPath = path.resolve(__dirname, '../src/generators/terraform/resourceCatalog.ts');
const text = fs.readFileSync(catalogPath, 'utf8');

const entries = [...text.matchAll(/\{\s*type:\s*'([^']+)'[\s\S]*?modulePath:\s*'([^']+)'[\s\S]*?status:\s*'([^']+)'/g)].map(
  (m) => ({ type: m[1], modulePath: m[2], status: m[3] })
);

const missing = [];
const present = [];
for (const e of entries) {
  const mainTf = path.join(bankRoot, e.modulePath, 'main.tf');
  if (fs.existsSync(mainTf)) present.push(e);
  else missing.push(e);
}

console.log(`Catalog entries: ${entries.length}`);
console.log(`Bank-ready (main.tf): ${present.length}`);
console.log(`Missing main.tf: ${missing.length}`);
if (missing.length) {
  console.log('\nMissing modules:');
  for (const e of missing) {
    console.log(`  [${e.status}] ${e.type} -> ${e.modulePath}`);
  }
}
process.exit(missing.length ? 1 : 0);
