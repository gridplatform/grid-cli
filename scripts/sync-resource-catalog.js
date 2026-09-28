#!/usr/bin/env node
/**
 * Add grid-terraform module folders missing from resourceCatalog.ts (one entry per module).
 * Preserves existing entries (semantic aliases, AI API markers, supported status).
 */
const fs = require('fs');
const path = require('path');

const bankRoot = path.resolve(__dirname, '../../grid-terraform');
const catalogPath = path.resolve(__dirname, '../src/generators/terraform/resourceCatalog.ts');

/** @type {Record<string, { exportName: string, defaultStatus: 'planned' | 'coming_soon' }>} */
const PROVIDERS = {
  aws: { exportName: 'AWS_CATALOG', defaultStatus: 'planned' },
  gcp: { exportName: 'GCP_CATALOG', defaultStatus: 'planned' },
  azure: { exportName: 'AZURE_CATALOG', defaultStatus: 'coming_soon' },
  oracle: { exportName: 'ORACLE_CATALOG', defaultStatus: 'planned' },
  ibm: { exportName: 'IBM_CATALOG', defaultStatus: 'planned' },
  alibaba: { exportName: 'ALIBABA_CATALOG', defaultStatus: 'planned' },
  tencent: { exportName: 'TENCENT_CATALOG', defaultStatus: 'planned' },
  huawei: { exportName: 'HUAWEI_CATALOG', defaultStatus: 'planned' },
  ovh: { exportName: 'OVH_CATALOG', defaultStatus: 'planned' },
  'deutsche-telekom': { exportName: 'DEUTSCHE_TELEKOM_CATALOG', defaultStatus: 'planned' },
  ctrls: { exportName: 'CTRLS_CATALOG', defaultStatus: 'planned' },
  yotta: { exportName: 'YOTTA_CATALOG', defaultStatus: 'planned' },
  rancher: { exportName: 'RANCHER_CATALOG', defaultStatus: 'planned' },
  openshift: { exportName: 'OPENSHIFT_CATALOG', defaultStatus: 'planned' },
};

/** Self-hosted LLM module folder names (align with scaffold-provider-banks.js UNMANAGED_LLM). */
const UNMANAGED_LLM = new Set([
  'gpu-instance',
  'gpu-node-pool',
  'nvidia-gpu-operator',
  'nvidia-nim',
  'vllm',
  'huggingface-tgi',
  'triton-inference-server',
  'sglang',
  'tensorrt-llm',
  'kserve',
  'kuberay',
  'ray-cluster',
  'ollama',
  'open-webui',
  'litellm-gateway',
  'milvus',
  'qdrant',
  'weaviate',
  'chroma',
  'pgvector',
  'mlflow',
  'bentoml',
  'deepspeed',
  'llm-inference-endpoint',
  'karpenter',
  'eks-gpu-node-group',
]);

const UNMANAGED_LLM_LABEL_PROVIDERS = new Set(['aws', 'gcp', 'azure']);

function humanize(moduleName) {
  return moduleName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function catalogLabel(providerId, moduleName) {
  const base = humanize(moduleName);
  if (UNMANAGED_LLM_LABEL_PROVIDERS.has(providerId) && UNMANAGED_LLM.has(moduleName)) {
    return `${base} (self-hosted / unmanaged)`;
  }
  return base;
}

function listModules(providerId) {
  const dir = path.join(bankRoot, providerId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(dir, name, 'main.tf')))
    .sort();
}

function modulePathsInCatalog(text, exportName) {
  const re = new RegExp(`export const ${exportName}[^=]*= \\[([\\s\\S]*?)\\n\\];`, 'm');
  const block = text.match(re);
  if (!block) throw new Error(`Catalog block not found: ${exportName}`);
  const paths = new Set();
  for (const m of block[1].matchAll(/modulePath:\s*'([^']+)'/g)) {
    paths.add(m[1]);
  }
  return { block: block[0], inner: block[1], paths };
}

function formatEntry(type, label, modulePath, status) {
  const safeLabel = label.replace(/'/g, "\\'");
  return `  { type: '${type}', label: '${safeLabel}', modulePath: '${modulePath}', status: '${status}' },`;
}

let text = fs.readFileSync(catalogPath, 'utf8');
let totalAdded = 0;

for (const [providerId, { exportName, defaultStatus }] of Object.entries(PROVIDERS)) {
  const modules = listModules(providerId);
  const { block, inner, paths } = modulePathsInCatalog(text, exportName);
  const missing = modules.filter((m) => !paths.has(`${providerId}/${m}`));
  if (!missing.length) continue;

  const lines = missing.map((m) =>
    formatEntry(m, catalogLabel(providerId, m), `${providerId}/${m}`, defaultStatus)
  );
  const newInner = `${inner.trimEnd()}\n\n  // Module bank scaffolds (sync-resource-catalog.js)\n${lines.join('\n')}\n`;
  const newBlock = block.replace(inner, newInner);
  text = text.replace(block, newBlock);
  totalAdded += missing.length;
  console.log(`${providerId}: +${missing.length} catalog entries`);
}

fs.writeFileSync(catalogPath, text);
console.log(`Done. Added ${totalAdded} entries.`);
