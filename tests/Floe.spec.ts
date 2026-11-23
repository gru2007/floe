import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { compile } from '@ton/blueprint';
import '@ton/test-utils';
import { Factory } from '../wrappers/Factory';
import { Token } from '../wrappers/Token';
import { JettonWallet } from '../wrappers/JettonWallet';
import {
    buildOnchainMetadata,
    buyBody,
    CurveParams,
    createTokenValue,
    designCurve,
    Errors,
    Event,
    Limits,
    Op,
    parseCreatedEvent,
    parseMetadata,
    parseTradeEvent,
    quoteBuy,
    quoteSell,
    validateCurve,
    tokenAddress,
    jettonWalletAddress,
    parseTokenData,
    parseFactoryData,
} from '../shared/protocol';

const DEPLOY_FEE = toNano('0.5');
const PLATFORM_FEE_BPS = 100; // 1%
const CREATOR_FEE_BPS = 100; // 1%

describe('Floe memepad', () => {
    let factoryCode: Cell;
    let tokenCode: Cell;
    let walletCode: Cell;

    beforeAll(async () => {
        factoryCode = await compile('Factory');
        tokenCode = await compile('Token');
        walletCode = await compile('JettonWallet');
    });

    let bc: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let creator: SandboxContract<TreasuryContract>;
    let alice: SandboxContract<TreasuryContract>;
    let bob: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<Factory>;
    let curve: CurveParams;
    const fees = { creatorFeeBps: CREATOR_FEE_BPS, platformFeeBps: PLATFORM_FEE_BPS };
    const meta = () =>
        buildOnchainMetadata({
            name: 'Penguin Coin',
            symbol: 'PENG',
            description: 'Cold memes only',
            decimals: '9',
            image_data: Buffer.alloc(3000, 7),
            telegram: 'https://t.me/peng',
        });

    beforeEach(async () => {
        bc = await Blockchain.create();
        owner = await bc.treasury('owner');
        creator = await bc.treasury('creator');
        alice = await bc.treasury('alice');
        bob = await bc.treasury('bob');
        factory = bc.openContract(
            Factory.createFromConfig({ owner: owner.address, deployFee: DEPLOY_FEE, platformFeeBps: PLATFORM_FEE_BPS, tokenCode, walletCode }, factoryCode),
        );
        const r = await factory.sendDeploy(owner.getSender(), toNano('1'));
        curve = designCurve({ maxSupply: 1_000_000_000n, startMcapTon: 1000, fillTon: 5000 });
        expect(validateCurve(curve)).toBeNull();
    });

    async function createToken(devBuy = 0n, minOut = 0n, c: CurveParams = curve) {
        const value = createTokenValue(DEPLOY_FEE, devBuy);
        const { nextIndex } = await factory.getFactoryData();
        const res = await factory.sendCreateToken(creator.getSender(), value, { creatorFeeBps: CREATOR_FEE_BPS, devBuy, minOut, curve: c, content: meta() });
        const address = await factory.getTokenAddress(nextIndex);
        return { res, token: bc.openContract(Token.createFromAddress(address)) };
    }

    const walletOf = async (token: SandboxContract<Token>, who: Address) =>
        bc.openContract(JettonWallet.createFromAddress(await token.getWalletAddress(who)));

    const curveOf = async (token: SandboxContract<Token>) => {
        const d = await token.getTokenData();
        return { c: { vt: d.vt, vj: d.vj, maxSupply: d.maxSupply, maxBuy: d.maxBuy }, d };
    };

    const tradeEvents = (res: any) =>
        res.externals.map((e: any) => parseTradeEvent(e.body)).filter((x: any) => x !== null);

    async function expectMintNotification(res: any, token: SandboxContract<Token>, recipient: Address, amount: bigint, queryId = 0n) {
        const wallet = await walletOf(token, recipient);
        // TonAPI's JettonMintFromMaster pattern needs master -> jetton wallet -> owner notify.
        expect(res.transactions).toHaveTransaction({
            from: token.address, to: wallet.address, op: Op.internalTransfer, success: true,
            body: beginCell().storeUint(Op.internalTransfer, 32).storeUint(queryId, 64)
                .storeCoins(amount).storeAddress(token.address).storeAddress(recipient)
                .storeCoins(1n).storeBit(false).endCell(),
        });
        expect(res.transactions).toHaveTransaction({
            from: wallet.address, to: recipient, op: Op.transferNotification, value: 1n,
            body: beginCell().storeUint(Op.transferNotification, 32).storeUint(queryId, 64)
                .storeCoins(amount).storeAddress(token.address).storeBit(false).endCell(),
        });
        expect(res.transactions).toHaveTransaction({
            from: wallet.address, to: recipient, op: Op.excesses,
            body: beginCell().storeUint(Op.excesses, 32).storeUint(queryId, 64).endCell(),
        });
    }

    it('creates a token with immutable params and no admin', async () => {
        const { res, token } = await createToken();
        expect(res.transactions).toHaveTransaction({ from: factory.address, to: token.address, deploy: true, success: true });
        const jd = await token.getJettonData();
        expect(jd.totalSupply).toBe(0n);
        expect(jd.admin).toBeNull();
        expect(jd.mintable).toBe(true);
        expect(res.transactions).not.toHaveTransaction({ from: token.address, op: Op.internalTransfer });
        expect(res.transactions).not.toHaveTransaction({ to: creator.address, op: Op.transferNotification });
        const m = parseMetadata(jd.content);
        expect(m.name).toBe('Penguin Coin');
        expect(m.symbol).toBe('PENG');
        expect(m.image_data!.length).toBe(3000);
        expect(m.telegram).toBe('https://t.me/peng');

        const { d } = await curveOf(token);
        expect(d.creator.equals(creator.address)).toBe(true);
        expect(d.factory.equals(factory.address)).toBe(true);
        expect(d.vt).toBe(curve.vt);
        expect(d.platformFeeBps).toBe(PLATFORM_FEE_BPS);

        const created = res.externals.map((e: any) => parseCreatedEvent(e.body)).find(Boolean)!;
        expect(created.token.equals(token.address)).toBe(true);
        expect(created.creator.equals(creator.address)).toBe(true);
        expect((await factory.getFactoryData()).nextIndex).toBe(1n);

        // token keeps the storage deposit, factory keeps the deploy fee
        expect((await bc.getContract(token.address)).balance).toBeGreaterThanOrEqual(Limits.TOKEN_STORAGE_DEPOSIT - toNano('0.001'));
        expect((await bc.getContract(factory.address)).balance).toBeGreaterThan(toNano('1') + DEPLOY_FEE - toNano('0.01'));
    });

    it('rejects bad params and underpaid creation', async () => {
        const bad = { ...curve, vj: curve.maxSupply }; // asymptote
        let r = await factory.sendCreateToken(creator.getSender(), toNano('1'), { creatorFeeBps: 100, devBuy: 0n, minOut: 0n, curve: bad, content: meta() });
        expect(r.transactions).toHaveTransaction({ to: factory.address, success: false, exitCode: Errors.badParams });
        r = await factory.sendCreateToken(creator.getSender(), toNano('1'), { creatorFeeBps: 501, devBuy: 0n, minOut: 0n, curve, content: meta() });
        expect(r.transactions).toHaveTransaction({ to: factory.address, success: false, exitCode: Errors.badParams });
        r = await factory.sendCreateToken(creator.getSender(), toNano('0.6'), { creatorFeeBps: 100, devBuy: 0n, minOut: 0n, curve, content: meta() });
        expect(r.transactions).toHaveTransaction({ to: factory.address, success: false, exitCode: Errors.notEnoughTon });
        const huge = buildOnchainMetadata({ name: 'X', image_data: Buffer.alloc(16_000, 1) });
        r = await factory.sendCreateToken(creator.getSender(), toNano('2'), { creatorFeeBps: 100, devBuy: 0n, minOut: 0n, curve, content: huge });
        expect(r.transactions).toHaveTransaction({ to: factory.address, success: false, exitCode: Errors.contentTooBig });
        expect((await factory.getFactoryData()).nextIndex).toBe(0n);
    });

    it('dev buy at launch', async () => {
        const devBuy = toNano('10');
        const q = quoteBuy(curve, fees, 0n, devBuy);
        const { token } = await createToken(devBuy, q.tokens);
        const w = await walletOf(token, creator.address);
        expect(await w.getJettonBalance()).toBe(q.tokens);
        expect((await token.getJettonData()).totalSupply).toBe(q.tokens);
    });

    it('buy produces a standard mint notification with matching amount and query id', async () => {
        const { token } = await createToken();
        const tonIn = toNano('25');
        const q = quoteBuy(curve, fees, 0n, tonIn);
        const queryId = 1795405623302n; // regression: the real TEST purchase had no owner notification
        const res = await token.sendRaw(alice.getSender(), tonIn + Limits.BUY_GAS, buyBody(q.tokens, queryId));
        await expectMintNotification(res, token, alice.address, q.tokens, queryId);
        expect(await (await walletOf(token, alice.address)).getJettonBalance()).toBe(q.tokens);
        expect((await token.getJettonData()).totalSupply).toBe(q.tokens);
    });

    it('notifies every purchase into an existing jetton wallet without double crediting', async () => {
        const { token } = await createToken();
        const first = await token.sendBuy(alice.getSender(), toNano('10'));
        const before = (await token.getJettonData()).totalSupply;
        await expectMintNotification(first, token, alice.address, before);
        const secondQuote = quoteBuy(curve, fees, before, toNano('5'));
        const second = await token.sendBuy(alice.getSender(), toNano('5'), secondQuote.tokens);
        await expectMintNotification(second, token, alice.address, secondQuote.tokens);
        expect((await token.getJettonData()).totalSupply).toBe(before + secondQuote.tokens);
        expect(await (await walletOf(token, alice.address)).getJettonBalance()).toBe(before + secondQuote.tokens);
    });

    it('creator first buy at token creation uses the same standard mint notification', async () => {
        const devBuy = toNano('10');
        const q = quoteBuy(curve, fees, 0n, devBuy);
        const { token, res } = await createToken(devBuy, q.tokens);
        await expectMintNotification(res, token, creator.address, q.tokens);
        expect(await (await walletOf(token, creator.address)).getJettonBalance()).toBe(q.tokens);
    });

    it('rejected creator first buy does not produce a mint notification or a balance', async () => {
        const devBuy = toNano('10');
        const q = quoteBuy(curve, fees, 0n, devBuy);
        const { token, res } = await createToken(devBuy, q.tokens + 1n);
        expect(res.transactions).not.toHaveTransaction({ from: token.address, op: Op.internalTransfer });
        expect(res.transactions).not.toHaveTransaction({ to: creator.address, op: Op.transferNotification });
        expect(res.transactions).toHaveTransaction({ from: token.address, to: creator.address, op: Op.refund });
        expect((await token.getJettonData()).totalSupply).toBe(0n);
        expect(await (await walletOf(token, creator.address)).getJettonBalance()).toBe(0n);
    });

    it('buy matches local and on-chain quotes, returns excess gas, emits trade log', async () => {
        const { token } = await createToken();
        const tonIn = toNano('25');
        const local = quoteBuy(curve, fees, 0n, tonIn);
        const onchain = await token.getBuyQuote(tonIn);
        expect(onchain.tokens).toBe(local.tokens);
        expect(onchain.fee).toBe(local.fee);

        const before = await alice.getBalance();
        const res = await token.sendBuy(alice.getSender(), tonIn, local.tokens);
        expect(res.transactions).toHaveTransaction({ from: token.address, deploy: true, success: true });
        expect(res.transactions).toHaveTransaction({ to: alice.address, op: Op.excesses });
        const w = await walletOf(token, alice.address);
        expect(await w.getJettonBalance()).toBe(local.tokens);
        const spent = before - (await alice.getBalance());
        expect(spent).toBeLessThan(tonIn + toNano('0.03')); // gas overhead < 0.03 TON
        const ev = tradeEvents(res);
        expect(ev).toHaveLength(1);
        expect(ev[0].isBuy).toBe(true);
        expect(ev[0].jettons).toBe(local.tokens);
        expect(ev[0].trader.equals(alice.address)).toBe(true);
        const { d } = await curveOf(token);
        expect(d.reserve).toBe(tonIn - local.fee);
        expect(ev[0].reserve).toBe(d.reserve);
        console.log('buy: gas overhead', Number(spent - tonIn) / 1e9, 'TON');
    });

    it('buy below min_out is refunded', async () => {
        const { token } = await createToken();
        const tonIn = toNano('5');
        const q = quoteBuy(curve, fees, 0n, tonIn);
        const before = await alice.getBalance();
        const res = await token.sendBuy(alice.getSender(), tonIn, q.tokens + 1n);
        expect(res.transactions).toHaveTransaction({ from: token.address, to: alice.address, op: Op.refund });
        expect(before - (await alice.getBalance())).toBeLessThan(toNano('0.02'));
        expect((await token.getJettonData()).totalSupply).toBe(0n);
        expect(res.transactions).not.toHaveTransaction({ from: token.address, op: Op.internalTransfer });
        expect(res.transactions).not.toHaveTransaction({ to: alice.address, op: Op.transferNotification });
    });

    it('respects max buy per tx and max supply', async () => {
        const c = designCurve({ maxSupply: 1_000_000_000n, startMcapTon: 1000, fillTon: 5000, maxBuyPct: 1 });
        const { token } = await createToken(0n, 0n, c);
        let res = await token.sendBuy(alice.getSender(), toNano('100'));
        expect(res.transactions).toHaveTransaction({ from: token.address, to: alice.address, op: Op.refund, body: beginCell().storeUint(Op.refund, 32).storeUint(0, 64).storeUint(3, 8).endCell() });

        const { token: t2 } = await createToken();
        const tooMuch = toNano('6000'); // fill target is 5000 TON
        res = await t2.sendBuy(alice.getSender(), tooMuch);
        expect(res.transactions).toHaveTransaction({ from: t2.address, to: alice.address, op: Op.refund, body: beginCell().storeUint(Op.refund, 32).storeUint(0, 64).storeUint(2, 8).endCell() });
    });

    it('sell matches quote; slippage bounce restores balance', async () => {
        const { token } = await createToken();
        await token.sendBuy(alice.getSender(), toNano('50'));
        const w = await walletOf(token, alice.address);
        const bal = await w.getJettonBalance();
        const half = bal / 2n;
        const { c, d } = await curveOf(token);
        const q = quoteSell(c, fees, d.supply, d.reserve, half);
        const onchain = await token.getSellQuote(half);
        expect(onchain.ton).toBe(q.ton);

        // slippage
        let res = await w.sendSell(alice.getSender(), { amount: half, minTonOut: q.ton + 1n });
        expect(res.transactions).toHaveTransaction({ from: w.address, to: token.address, success: false, exitCode: Errors.notEnoughTon });
        expect(await w.getJettonBalance()).toBe(bal);

        const before = await alice.getBalance();
        res = await w.sendSell(alice.getSender(), { amount: half, minTonOut: q.ton });
        expect(res.transactions).toHaveTransaction({ from: token.address, to: alice.address, success: true });
        const received = (await alice.getBalance()) - before;
        expect(received).toBeGreaterThan(q.ton - toNano('0.03'));
        expect(received).toBeLessThanOrEqual(q.ton);
        expect(await w.getJettonBalance()).toBe(bal - half);
        const ev = tradeEvents(res);
        expect(ev[0].isBuy).toBe(false);
        expect(ev[0].ton).toBe(q.ton);
        console.log('sell: gas overhead', Number(q.ton - received) / 1e9, 'TON');
    });

    it('stays solvent under random trading; everyone can exit', async () => {
        const { token } = await createToken(toNano('3'));
        const users = [creator, alice, bob, await bc.treasury('carol'), await bc.treasury('dave')];
        let seed = 42;
        const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
        for (let i = 0; i < 60; i++) {
            const u = users[Math.floor(rnd() * users.length)];
            if (rnd() < 0.6) {
                await token.sendBuy(u.getSender(), toNano((1 + rnd() * 80).toFixed(2)));
            } else {
                const w = await walletOf(token, u.address);
                const b = await w.getJettonBalance();
                if (b > 0n) await w.sendSell(u.getSender(), { amount: (b * BigInt(Math.floor(rnd() * 100) + 1)) / 100n });
            }
            const { d } = await curveOf(token);
            const bal = (await bc.getContract(token.address)).balance;
            expect(bal).toBeGreaterThanOrEqual(d.reserve + d.feesCreator + d.feesPlatform);
        }
        for (const u of users) {
            const w = await walletOf(token, u.address);
            const b = await w.getJettonBalance();
            if (b > 0n) {
                const r = await w.sendSell(u.getSender(), { amount: b });
                expect(r.transactions).toHaveTransaction({ from: token.address, to: u.address, success: true });
            }
        }
        const { d } = await curveOf(token);
        expect(d.supply).toBe(0n);
        expect(d.reserve).toBeGreaterThanOrEqual(0n);
        const bal = (await bc.getContract(token.address)).balance;
        expect(bal).toBeGreaterThanOrEqual(d.reserve + d.feesCreator + d.feesPlatform);
        console.log('rounding surplus left in reserve:', d.reserve.toString(), 'nanoTON');
    });

    it('fees: anyone can trigger claim, money goes to creator and factory', async () => {
        const { token } = await createToken();
        await token.sendBuy(alice.getSender(), toNano('100'));
        const { d } = await curveOf(token);
        expect(d.feesCreator).toBe(toNano('1'));
        expect(d.feesPlatform).toBe(toNano('1'));
        const cBefore = await creator.getBalance();
        const fBefore = (await bc.getContract(factory.address)).balance;
        const res = await token.sendClaimFees(bob.getSender());
        expect(res.transactions).toHaveTransaction({ from: token.address, to: creator.address, op: Op.creatorFee, value: toNano('1') });
        expect(res.transactions).toHaveTransaction({ from: token.address, to: factory.address, op: Op.platformFee, success: true });
        expect((await creator.getBalance()) - cBefore).toBeGreaterThan(toNano('0.999'));
        expect((await bc.getContract(factory.address)).balance - fBefore).toBeGreaterThan(toNano('0.99'));
        const after = await curveOf(token);
        expect(after.d.feesCreator).toBe(0n);
    });

    it('wallet: transfers work freely; strangers cannot burn; factory-only init', async () => {
        const { token } = await createToken();
        await token.sendBuy(alice.getSender(), toNano('10'));
        const wa = await walletOf(token, alice.address);
        const bal = await wa.getJettonBalance();
        let res = await wa.sendTransfer(alice.getSender(), { amount: bal / 3n, to: bob.address, forwardTon: 1n });
        expect(res.transactions).toHaveTransaction({ to: bob.address, op: 0x7362d09c });
        const wb = await walletOf(token, bob.address);
        expect(await wb.getJettonBalance()).toBe(bal / 3n);

        res = await wa.sendSell(bob.getSender(), { amount: 1n });
        expect(res.transactions).toHaveTransaction({ to: wa.address, success: false, exitCode: Errors.notOwner });

        const fakeInit = beginCell().storeUint(Op.initToken, 32).storeUint(0, 64).endCell();
        res = await token.sendRaw(alice.getSender(), toNano('1'), fakeInit);
        expect(res.transactions).toHaveTransaction({ to: token.address, success: false, exitCode: Errors.alreadyInitialized });

        // burn_notification from a non-wallet is rejected
        const fakeBurn = beginCell().storeUint(Op.burnNotification, 32).storeUint(0, 64).storeCoins(1000n).storeAddress(alice.address).storeAddress(alice.address).storeMaybeRef(null).endCell();
        res = await token.sendRaw(alice.getSender(), toNano('1'), fakeBurn);
        expect(res.transactions).toHaveTransaction({ to: token.address, success: false, exitCode: Errors.notValidWallet });
    });

    it('factory admin ops are owner-only', async () => {
        let r = await factory.sendSetConfig(alice.getSender(), 0n, 0);
        expect(r.transactions).toHaveTransaction({ to: factory.address, success: false, exitCode: Errors.notOwner });
        r = await factory.sendSetConfig(owner.getSender(), toNano('1'), 300);
        expect(r.transactions).toHaveTransaction({ to: factory.address, success: false, exitCode: Errors.badParams });
        r = await factory.sendSetConfig(owner.getSender(), toNano('1'), 150);
        expect((await factory.getFactoryData()).platformFeeBps).toBe(150);

        await createToken(); // adds 1 TON deploy fee
        const before = await owner.getBalance();
        r = await factory.sendWithdraw(owner.getSender(), toNano('1000'));
        expect(r.transactions).toHaveTransaction({ from: factory.address, to: owner.address, success: true });
        expect((await bc.getContract(factory.address)).balance).toBeGreaterThanOrEqual(toNano('0.19'));
        expect((await owner.getBalance()) > before).toBe(true);
    });

    it('local address/storage parsers match get-methods (used by the mini app)', async () => {
        const { token } = await createToken(toNano('2'));
        const fd = await factory.getFactoryData();
        expect(tokenAddress(factory.address, 0n, fd.tokenCode).equals(token.address)).toBe(true);
        const st = parseTokenData((await bc.getContract(token.address)).accountState!.type === 'active'
            ? ((await bc.getContract(token.address)).accountState as any).state.data
            : Cell.EMPTY)!;
        const d = await token.getTokenData();
        expect(st.supply).toBe(d.supply);
        expect(st.reserve).toBe(d.reserve);
        expect(st.vj).toBe(d.vj);
        expect(st.creator.equals(d.creator)).toBe(true);
        const w = jettonWalletAddress(creator.address, token.address, st.walletCode);
        expect(w.equals(await token.getWalletAddress(creator.address))).toBe(true);
        const fs = parseFactoryData(((await bc.getContract(factory.address)).accountState as any).state.data);
        expect(fs.nextIndex).toBe(1n);
    });

    it('TEP-89 provide_wallet_address', async () => {
        const { token } = await createToken();
        const body = beginCell().storeUint(Op.provideWalletAddress, 32).storeUint(0, 64).storeAddress(bob.address).storeBit(false).endCell();
        const res = await token.sendRaw(alice.getSender(), toNano('0.05'), body);
        const expected = await token.getWalletAddress(bob.address);
        expect(res.transactions).toHaveTransaction({
            from: token.address,
            to: alice.address,
            body: beginCell().storeUint(Op.takeWalletAddress, 32).storeUint(0, 64).storeAddress(expected).storeMaybeRef(null).endCell(),
        });
    });
});
