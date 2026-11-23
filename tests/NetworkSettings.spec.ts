import { resolveNetworkConfig } from '../app/src/lib/network-settings';

describe('network isolation', () => {
  const legacy = { network: 'testnet' as const, factories: ['test-factory'], toncenterUrl: 'https://test.example', toncenterApiKey: 'test-key' };
  it('preserves the configured default network', () => {
    expect(resolveNetworkConfig(legacy, {})).toEqual(legacy);
  });
  it('does not reuse testnet factories, RPC or API key on mainnet', () => {
    expect(resolveNetworkConfig(legacy, { network: 'mainnet' })).toMatchObject({
      network: 'mainnet', factories: [], toncenterUrl: undefined, toncenterApiKey: undefined,
    });
  });
  it('uses only the selected network configuration', () => {
    const config = { ...legacy, networks: { mainnet: { factories: ['main-factory'], toncenterUrl: 'https://main.example' } } };
    expect(resolveNetworkConfig(config, { network: 'mainnet' })).toMatchObject({
      factories: ['main-factory'], toncenterUrl: 'https://main.example', toncenterApiKey: undefined,
    });
  });
  it('keeps local factory overrides separate for each network', () => {
    const settings = { network: 'mainnet' as const, factories: { testnet: ['local-test'], mainnet: ['local-main'] } };
    expect(resolveNetworkConfig(legacy, settings).factories).toEqual(['local-main']);
    expect(resolveNetworkConfig(legacy, { ...settings, network: 'testnet' }).factories).toEqual(['local-test']);
  });
  it('allows an empty local override to disable configured factories', () => {
    expect(resolveNetworkConfig(legacy, { factories: { testnet: [] } }).factories).toEqual([]);
  });
});
