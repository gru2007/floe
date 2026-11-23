export type Network = 'testnet' | 'mainnet';
export interface NetworkConfig {
  factories: string[];
  /** Registry includes historical factories; only this one may create. null disables creation. */
  activeFactory?: string | null;
  toncenterUrl?: string;
  toncenterApiKey?: string;
}
export interface NetworkSettings {
  network?: Network;
  factories?: Partial<Record<Network, string[]>>;
  activeFactories?: Partial<Record<Network, string | null>>;
}
const KEY = 'floe:network-settings:v1';

export function readNetworkSettings(): NetworkSettings {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!value || typeof value !== 'object') return {};
    return {
      network: value.network === 'testnet' || value.network === 'mainnet' ? value.network : undefined,
      factories: Object.fromEntries(['testnet', 'mainnet'].flatMap((network) =>
        Array.isArray(value.factories?.[network]) && value.factories[network].every((a: unknown) => typeof a === 'string')
          ? [[network, value.factories[network]]] : [],
      )),
      activeFactories: Object.fromEntries(['testnet', 'mainnet'].flatMap((network) => {
        const v = value.activeFactories?.[network];
        return typeof v === 'string' || v === null ? [[network, v]] : [];
      })),
    };
  } catch { return {}; }
}

export function saveNetworkSettings(settings: NetworkSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function resetNetworkSettings() { localStorage.removeItem(KEY); }

export function resolveNetworkConfig<T extends NetworkConfig & {
  network: Network;
  networks?: Partial<Record<Network, NetworkConfig>>;
}>(config: T, settings: NetworkSettings): T {
  const network = settings.network ?? config.network;
  const selected = config.networks?.[network];
  const legacy = network === config.network;
  const activeFactory = settings.activeFactories?.[network] !== undefined
    ? settings.activeFactories[network]
    : selected?.activeFactory !== undefined ? selected.activeFactory : legacy ? config.activeFactory : undefined;
  const result = {
    ...config,
    network,
    factories: settings.factories?.[network] ?? selected?.factories ?? (legacy ? config.factories : []),
    toncenterUrl: selected ? selected.toncenterUrl : legacy ? config.toncenterUrl : undefined,
    toncenterApiKey: selected ? selected.toncenterApiKey : legacy ? config.toncenterApiKey : undefined,
  };
  if (activeFactory !== undefined) result.activeFactory = activeFactory;
  else delete result.activeFactory;
  return result;
}
