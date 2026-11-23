import { Address } from '@ton/core';
import { readNetworkSettings, resolveNetworkConfig, type Network, type NetworkConfig } from './network-settings';

export interface AwConfig {
  id: string;
  name: string;
}

export interface FloeConfig {
  network: Network;
  networks?: Partial<Record<Network, NetworkConfig>>;
  factories: string[];
  toncenterApiKey?: string;
  /** optional: custom toncenter-v3 compatible endpoint */
  toncenterUrl?: string;
  /** 'readonly' inside Antarctic Wallet: catalogue + charts only, trading/creation via web version */
  awMode?: 'full' | 'readonly';
  hiddenTokens: string[];
  blockedWords: string[];
  supportUrl?: string;
  sourceUrl?: string;
}

export interface AppConfig {
  aw: AwConfig;
  floe: FloeConfig;
  factories: Address[];
  hidden: Set<string>;
  isTestnet: boolean;
  appUrl: string;
}

let cached: Promise<AppConfig> | null = null;

export function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;
  cached = (async () => {
    const [aw, defaults] = await Promise.all([
      fetch('./config.json', { cache: 'no-cache' }).then((r) => r.json() as Promise<AwConfig>),
      fetch('./floe.config.json', { cache: 'no-cache' }).then((r) => r.json() as Promise<FloeConfig>),
    ]);
    const floe = resolveNetworkConfig(defaults, readNetworkSettings());
    const factories = (floe.factories ?? []).flatMap((a) => {
      try {
        return [Address.parse(a)];
      } catch {
        console.warn('bad factory address in floe.config.json', a);
        return [];
      }
    });
    const hidden = new Set<string>();
    for (const a of floe.hiddenTokens ?? []) {
      try {
        hidden.add(Address.parse(a).toRawString());
      } catch {
        /* ignore */
      }
    }
    const appUrl = window.location.href.split('#')[0].split('?')[0];
    return {
      aw,
      floe: { ...floe, blockedWords: (floe.blockedWords ?? []).map((w) => w.toLowerCase()) },
      factories,
      hidden,
      isTestnet: floe.network !== 'mainnet',
      appUrl,
    };
  })();
  return cached;
}

/** Friendly form used everywhere in the UI and in TON Connect messages */
export function fmtAddress(a: Address, testnet: boolean, bounceable = true): string {
  return a.toString({ testOnly: testnet, bounceable, urlSafe: true });
}
