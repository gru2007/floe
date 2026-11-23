import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, TupleBuilder } from '@ton/core';
import { createTokenBody, CurveParams, Op } from '../shared/protocol';

export interface FactoryConfig {
    owner: Address;
    deployFee: bigint;
    platformFeeBps: number;
    tokenCode: Cell;
    walletCode: Cell;
}

export function factoryConfigToCell(c: FactoryConfig): Cell {
    return beginCell()
        .storeAddress(c.owner)
        .storeCoins(c.deployFee)
        .storeUint(c.platformFeeBps, 16)
        .storeUint(0, 64)
        .storeRef(c.tokenCode)
        .storeRef(c.walletCode)
        .storeBit(true)
        .storeAddress(null)
        .endCell();
}

export class Factory implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Factory(address);
    }

    static createFromConfig(config: FactoryConfig, code: Cell, workchain = 0) {
        const data = factoryConfigToCell(config);
        const init = { code, data };
        return new Factory(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: beginCell().storeUint(Op.topUp, 32).storeUint(0, 64).endCell() });
    }

    async sendCreateToken(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        p: { creatorFeeBps: number; devBuy: bigint; minOut: bigint; curve: CurveParams; content: Cell; queryId?: bigint },
    ) {
        await provider.internal(via, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: createTokenBody(p) });
    }

    async sendSetConfig(provider: ContractProvider, via: Sender, deployFee: bigint, platformFeeBps: number) {
        await provider.internal(via, {
            value: 50_000_000n,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Op.setConfig, 32).storeUint(0, 64).storeCoins(deployFee).storeUint(platformFeeBps, 16).endCell(),
        });
    }

    async sendChangeOwner(provider: ContractProvider, via: Sender, newOwner: Address) {
        await provider.internal(via, {
            value: 50_000_000n,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Op.changeOwner, 32).storeUint(0, 64).storeAddress(newOwner).endCell(),
        });
    }

    async sendWithdraw(provider: ContractProvider, via: Sender, amount: bigint) {
        await provider.internal(via, {
            value: 50_000_000n,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Op.withdraw, 32).storeUint(0, 64).storeCoins(amount).endCell(),
        });
    }

    async sendRetire(provider: ContractProvider, via: Sender, successor: Address) {
        await provider.internal(via, {
            value: 50_000_000n, sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Op.retireFactory, 32).storeUint(0, 64).storeAddress(successor).endCell(),
        });
    }

    async getFactoryData(provider: ContractProvider) {
        const r = (await provider.get('get_factory_data', [])).stack;
        const data = {
            owner: r.readAddress(),
            deployFee: r.readBigNumber(),
            platformFeeBps: r.readNumber(),
            nextIndex: r.readBigNumber(),
            tokenCode: r.readCell(),
            walletCode: r.readCell(),
        };
        const migrationSupported = r.remaining >= 2;
        return { ...data, migrationSupported,
            creationEnabled: migrationSupported ? r.readNumber() !== 0 : true,
            nextFactory: migrationSupported ? r.readAddressOpt() : null,
        };
    }

    async getTokenAddress(provider: ContractProvider, index: bigint) {
        const tb = new TupleBuilder();
        tb.writeNumber(index);
        return (await provider.get('get_token_address', tb.build())).stack.readAddress();
    }
}
