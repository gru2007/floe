import { Address, Contract, ContractProvider, Sender, SendMode } from '@ton/core';
import { Limits, sellBody, transferBody } from '../shared/protocol';

export class JettonWallet implements Contract {
    constructor(readonly address: Address) {}

    static createFromAddress(address: Address) {
        return new JettonWallet(address);
    }

    async sendSell(provider: ContractProvider, via: Sender, p: { amount: bigint; minTonOut?: bigint; value?: bigint }) {
        await provider.internal(via, {
            value: p.value ?? Limits.SELL_VALUE,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: sellBody({ amount: p.amount, responseAddress: via.address!, minTonOut: p.minTonOut ?? 0n }),
        });
    }

    async sendTransfer(provider: ContractProvider, via: Sender, p: { amount: bigint; to: Address; value?: bigint; forwardTon?: bigint }) {
        await provider.internal(via, {
            value: p.value ?? 100_000_000n,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: transferBody({ amount: p.amount, to: p.to, responseAddress: via.address!, forwardTon: p.forwardTon }),
        });
    }

    async getJettonBalance(provider: ContractProvider) {
        const state = await provider.getState();
        if (state.state.type !== 'active') return 0n;
        return (await provider.get('get_wallet_data', [])).stack.readBigNumber();
    }
}
