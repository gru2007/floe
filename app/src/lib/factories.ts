import { Address } from '@ton/core';

/** Legacy configs use the final configured address, never the final reachable factory. */
export function creationFactoryAddress(config: { factories: string[]; activeFactory?: string | null }): Address | null {
  const raw = config.activeFactory === undefined ? config.factories[config.factories.length - 1] : config.activeFactory;
  if (!raw) return null;
  try {
    const active = Address.parse(raw);
    return config.factories.some((f) => Address.parse(f).equals(active)) ? active : null;
  } catch { return null; }
}

export function selectCreationFactory<T extends { address: Address; state: { creationEnabled: boolean } }>(active: Address | null, factories: T[]): T | null {
  if (!active) return null;
  const selected = factories.find((f) => f.address.equals(active));
  return selected?.state.creationEnabled ? selected : null;
}
