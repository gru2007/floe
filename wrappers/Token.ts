import { Address, beginCell, Cell, Contract, ContractProvider, Sender, SendMode, TupleBuilder } from '@ton/core';
import { buyBody, claimFeesBody, Limits } from '../shared/protocol';

export class Token implements Contract {
    constructor(readonly address: Address) {}

    static createFromAddress(address: Address) {
        return new Token(address);
    }

    /** `tonIn` goes into the trade; BUY_GAS is added on top and its unused part comes back */
    async sendBuy(provider: ContractProvider, via: Sender, tonIn: bigint, minOut = 0n, gas = Limits.BUY_GAS) {
        await provider.internal(via, { value: tonIn + gas, sendMode: SendMode.PAY_GAS_SEPARATELY, body: buyBody(minOut) });
    }

    async sendClaimFees(provider: ContractProvider, via: Sender, value = Limits.CLAIM_VALUE) {
        await provider.internal(via, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: claimFeesBody() });
    }

    async sendRaw(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
        await provider.internal(via, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body });
    }

    async getJettonData(provider: ContractProvider) {
        const r = (await provider.get('get_jetton_data', [])).stack;
        return {
            totalSupply: r.readBigNumber(),
            mintable: r.readBoolean(),
            admin: r.readAddressOpt(),
            content: r.readCell(),
            walletCode: r.readCell(),
        };
    }

    async getWalletAddress(provider: ContractProvider, owner: Address) {
        const tb = new TupleBuilder();
        tb.writeAddress(owner);
        return (await provider.get('get_wallet_address', tb.build())).stack.readAddress();
    }

    async getTokenData(provider: ContractProvider) {
        const r = (await provider.get('get_token_data', [])).stack;
        return {
            inited: r.readNumber(),
            factory: r.readAddress(),
            index: r.readBigNumber(),
            creator: r.readAddress(),
            supply: r.readBigNumber(),
            reserve: r.readBigNumber(),
            vt: r.readBigNumber(),
            vj: r.readBigNumber(),
            maxSupply: r.readBigNumber(),
            maxBuy: r.readBigNumber(),
            creatorFeeBps: r.readNumber(),
            platformFeeBps: r.readNumber(),
            feesCreator: r.readBigNumber(),
            feesPlatform: r.readBigNumber(),
            createdAt: r.readNumber(),
        };
    }

    async getBuyQuote(provider: ContractProvider, tonIn: bigint) {
        const tb = new TupleBuilder();
        tb.writeNumber(tonIn);
        const r = (await provider.get('get_buy_quote', tb.build())).stack;
        return { tokens: r.readBigNumber(), fee: r.readBigNumber() };
    }

    async getSellQuote(provider: ContractProvider, amount: bigint) {
        const tb = new TupleBuilder();
        tb.writeNumber(amount);
        const r = (await provider.get('get_sell_quote', tb.build())).stack;
        return { ton: r.readBigNumber(), fee: r.readBigNumber() };
    }
}
