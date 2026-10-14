import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROVIDER_IDS } from '../../../src/providers/types';
import { catalogFor } from '../../../src/generators/terraform/resourceCatalog';

describe('catalog vocabulary', () => {
  it('type matches module folder unless several types share one module', () => {
    // Shared modules: API peers, or fabric fold-ins (subnet → vpc/network only).
    const sharedModuleBases = new Set([
      'ai-api',
      'cognitive-services',
      'cloud-function',
      'vpc',
      'network',
    ]);

    const violations: string[] = [];
    for (const provider of PROVIDER_IDS) {
      const entries = catalogFor(provider);
      const byBase = new Map<string, string[]>();
      for (const e of entries) {
        const base = e.modulePath.split('/').pop() || e.modulePath;
        const list = byBase.get(base) ?? [];
        list.push(e.type);
        byBase.set(base, list);
      }
      for (const e of entries) {
        const base = e.modulePath.split('/').pop() || e.modulePath;
        if (e.type === base) continue;
        const siblings = byBase.get(base) ?? [];
        if (siblings.length > 1 || sharedModuleBases.has(base)) continue;
        violations.push(`${provider}: type=${e.type} module=${base}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('does not use cross-cloud generic type vm anymore', () => {
    for (const provider of PROVIDER_IDS) {
      expect(catalogFor(provider).some((e) => e.type === 'vm')).toBe(false);
    }
  });
});

describe('deployFlags keys match catalog types (UI file)', () => {
  it('every catalog type exists as a deployFlags key for that provider', () => {
    const ff = readFileSync(
      resolve(__dirname, '../../../../grid-ui/src/config/featureFlags.ts'),
      'utf8'
    );
    const body = ff.match(/export const deployFlags[\s\S]*?= \{([\s\S]*?)\n\};/)?.[1] ?? '';
    const flags = new Map<string, Set<string>>();
    for (const m of body.matchAll(/"([^"]+)":\s*\{([\s\S]*?)\n  \},?/g)) {
      flags.set(m[1], new Set([...m[2].matchAll(/"([^"]+)":\s*(?:true|false)/g)].map((x) => x[1])));
    }

    const missing: string[] = [];
    for (const provider of PROVIDER_IDS) {
      const table = flags.get(provider);
      if (!table) {
        missing.push(`${provider}: (no deployFlags block)`);
        continue;
      }
      for (const e of catalogFor(provider)) {
        if (!table.has(e.type)) missing.push(`${provider}/${e.type}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
