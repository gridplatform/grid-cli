import type { ProviderAdapter, ProviderId } from './types';

const registry = new Map<ProviderId, ProviderAdapter>();

export function registerProvider(adapter: ProviderAdapter): void {
  if (registry.has(adapter.id)) {
    throw new Error(`Provider already registered: ${adapter.id}`);
  }
  registry.set(adapter.id, adapter);
}

export function getProvider(id: string): ProviderAdapter {
  const adapter = registry.get(id as ProviderId);
  if (!adapter) {
    const known = [...registry.keys()].sort().join(', ');
    throw new Error(`Unknown provider "${id}". Known providers: ${known}`);
  }
  return adapter;
}

export function listProviders(): ProviderAdapter[] {
  return [...registry.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Resolve a registered provider for generate.
 *
 * `status` on the adapter is discovery metadata for `grid providers` only.
 * Generate is allowed for any registered cloud; whether apply works depends on
 * the module bank entry and credentials — not on UI feature flags.
 */
export function assertProviderCanGenerate(id: string): ProviderAdapter {
  return getProvider(id);
}
