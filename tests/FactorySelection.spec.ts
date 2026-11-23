import { Address } from '@ton/core';
import { creationFactoryAddress, selectCreationFactory } from '../app/src/lib/factories';

describe('factory migration in the client', () => {
    const old = new Address(0, Buffer.alloc(32, 1));
    const next = new Address(0, Buffer.alloc(32, 2));
    const registry = [old.toRawString(), next.toRawString()];
    const loaded = [
        { address: old, state: { creationEnabled: true } },
        { address: next, state: { creationEnabled: true } },
    ];
    it('keeps historical addresses while only selecting the explicit active factory', () => {
        const cfg = { factories: registry, activeFactory: next.toString() };
        expect(creationFactoryAddress(cfg)!.equals(next)).toBe(true);
        expect(selectCreationFactory(creationFactoryAddress(cfg), loaded)?.address.equals(next)).toBe(true);
        expect(cfg.factories).toEqual(registry);
    });
    it('never falls back to an old reachable factory if the active factory is missing', () => {
        expect(selectCreationFactory(next, [loaded[0]])).toBeNull();
    });
    it('never falls back when the active factory was retired on-chain', () => {
        expect(selectCreationFactory(next, [loaded[0], { address: next, state: { creationEnabled: false } }])).toBeNull();
    });
    it('supports explicit creation shutdown without removing any token history', () => {
        expect(creationFactoryAddress({ factories: registry, activeFactory: null })).toBeNull();
        expect(selectCreationFactory(null, loaded)).toBeNull();
    });
    it('uses the final configured address for legacy configs, even if it is unreachable', () => {
        const active = creationFactoryAddress({ factories: registry });
        expect(active!.equals(next)).toBe(true);
        expect(selectCreationFactory(active, [loaded[0]])).toBeNull();
    });
    it('rejects an active address outside the registry or an invalid address', () => {
        expect(creationFactoryAddress({ factories: [old.toRawString()], activeFactory: next.toRawString() })).toBeNull();
        expect(creationFactoryAddress({ factories: registry, activeFactory: 'bad' })).toBeNull();
    });
});
