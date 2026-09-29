import type { ConfigDiff, DesiredUnit, InventoryFile, InventoryUnit } from './types';

/**
 * Diff desired JSON files vs CLI inventory of applied units.
 * Missing JSON + still in inventory ⇒ stale (suggest destroy; never auto-destroy).
 */
export function diffConfig(desired: DesiredUnit[], inventory: InventoryFile): ConfigDiff {
  const byPath = new Map<string, InventoryUnit>();
  for (const u of inventory.units) {
    byPath.set(u.configPath, u);
  }

  const added: ConfigDiff['added'] = [];
  const changed: ConfigDiff['changed'] = [];
  const unchanged: ConfigDiff['unchanged'] = [];
  const seen = new Set<string>();

  for (const d of desired) {
    seen.add(d.configPath);
    const unit = byPath.get(d.configPath);
    if (!unit) {
      added.push(d);
      continue;
    }
    if (unit.contentHash !== d.contentHash) {
      changed.push({ desired: d, unit });
    } else {
      unchanged.push({ desired: d, unit });
    }
  }

  const stale: InventoryUnit[] = [];
  for (const u of inventory.units) {
    if (!seen.has(u.configPath)) {
      stale.push({ ...u, status: 'stale' });
    }
  }

  return { added, changed, unchanged, stale };
}
