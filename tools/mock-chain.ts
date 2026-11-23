/**
 * Local demo chain: runs the real FunC contracts in @ton/sandbox, simulates a few days
 * of trading and serves the result through a toncenter-v3 compatible HTTP API.
 * Lets you develop/check the mini app UI without testnet TON.
 *
 *   npx ts-node tools/mock-chain.ts            # prints the factory address, serves :8787
 *   then in app/public/floe.config.json:
 *     "factories": ["<printed address>"], "toncenterUrl": "http://127.0.0.1:8787/api/v3"
 */
import http from 'node:http';
import { Blockchain, BlockchainTransaction, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { compile } from '@ton/blueprint';
import { Factory } from '../wrappers/Factory';
import { Token } from '../wrappers/Token';
import { JettonWallet } from '../wrappers/JettonWallet';
import { buildOnchainMetadata, createTokenValue, designCurve, jettonWalletAddress } from '../shared/protocol';

const PORT = Number(process.env.PORT ?? 8787);

function logoSvg(color: string, letter: string): Buffer {
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${color}"/><text x="32" y="43" font-size="30" text-anchor="middle" font-family="Arial" font-weight="700" fill="#fff">${letter}</text></svg>`,
    );
}

async function main() {
    const bc = await Blockchain.create();
    const txs = new Map<string, BlockchainTransaction[]>();
    const record = (r: { transactions: BlockchainTransaction[] }) => {
        for (const t of r.transactions) {
            const a = new Address(0, Buffer.from(t.address.toString(16).padStart(64, '0'), 'hex')).toRawString();
            if (!txs.has(a)) txs.set(a, []);
            txs.get(a)!.push(t);
        }
    };

    let now = Math.floor(Date.now() / 1000) - 3 * 86400;
    bc.now = now;
    const owner = await bc.treasury('owner');
    const users: SandboxContract<TreasuryContract>[] = [];
    for (let i = 0; i < 8; i++) users.push(await bc.treasury(`user${i}`, { balance: toNano('100000') }));

    const factory = bc.openContract(
        Factory.createFromConfig(
            { owner: owner.address, deployFee: toNano('0.3'), platformFeeBps: 100, tokenCode: await compile('Token'), walletCode: await compile('JettonWallet') },
            await compile('Factory'),
        ),
    );
    record(await factory.sendDeploy(owner.getSender(), toNano('1')));

    const specs = [
        { name: 'Penguin Coin', symbol: 'PENG', color: '#1d74ff', mcap: 1000, k: 5, desc: 'Самый холодный мем на TON.' },
        { name: 'Iceberg', symbol: 'BERG', color: '#12b77a', mcap: 300, k: 10, desc: 'Видна только верхушка.' },
        { name: 'Snow Cat', symbol: 'SCAT', color: '#e5484d', mcap: 2000, k: 3, desc: 'Котик, который любит снег.' },
    ];
    const tokens: SandboxContract<Token>[] = [];
    for (const [i, s] of specs.entries()) {
        const content = buildOnchainMetadata({
            name: s.name,
            symbol: s.symbol,
            description: s.desc,
            decimals: '9',
            image_data: logoSvg(s.color, s.symbol[0]),
            telegram: 'https://t.me/example',
        });
        const curve = designCurve({ maxSupply: 1_000_000_000n, startMcapTon: s.mcap, fillTon: s.mcap * s.k });
        const devBuy = toNano('5');
        const creator = users[i];
        record(await factory.sendCreateToken(creator.getSender(), createTokenValue(toNano('0.3'), devBuy), { creatorFeeBps: 100, devBuy, minOut: 0n, curve, content }));
        tokens.push(bc.openContract(Token.createFromAddress(await factory.getTokenAddress(BigInt(i)))));
        now += 600;
        bc.now = now;
    }

    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const end = Math.floor(Date.now() / 1000) - 60;
    while (now < end) {
        now += Math.floor(120 + rnd() * 1500);
        bc.now = now;
        const token = tokens[Math.floor(rnd() * tokens.length)];
        const u = users[Math.floor(rnd() * users.length)];
        if (rnd() < 0.58) {
            record(await token.sendBuy(u.getSender(), toNano((0.5 + rnd() * 60).toFixed(2))));
        } else {
            const w = bc.openContract(JettonWallet.createFromAddress(await token.getWalletAddress(u.address)));
            const b = await w.getJettonBalance();
            if (b > 0n) record(await w.sendSell(u.getSender(), { amount: (b * BigInt(10 + Math.floor(rnd() * 90))) / 100n }));
        }
    }

    console.log('Factory:', factory.address.toString({ testOnly: true }));
    console.log('Tokens:', tokens.map((t) => t.address.toString({ testOnly: true })).join(', '));
    console.log('Trade transactions:', [...txs.values()].reduce((a, l) => a + l.length, 0));

    const body = (c: Cell | undefined | null) => (c ? c.toBoc().toString('base64') : null);

    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'OPTIONS') return res.end();
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
        try {
            if (url.pathname === '/api/v3/accountStates') {
                const accounts = [];
                for (const a of url.searchParams.getAll('address')) {
                    const addr = Address.parse(a);
                    const c = await bc.getContract(addr);
                    const st = c.accountState;
                    const list = txs.get(addr.toRawString()) ?? [];
                    accounts.push({
                        address: addr.toRawString().toUpperCase(),
                        balance: c.balance.toString(),
                        status: st?.type === 'active' ? 'active' : st?.type === 'frozen' ? 'frozen' : 'uninit',
                        data_boc: st?.type === 'active' ? body(st.state.data) : null,
                        last_transaction_lt: list.length ? list[list.length - 1].lt.toString() : null,
                    });
                }
                return res.end(JSON.stringify({ accounts }));
            }
            if (url.pathname === '/api/v3/transactions') {
                const a = Address.parse(url.searchParams.get('account')!).toRawString();
                const limit = Number(url.searchParams.get('limit') ?? 100);
                const endLt = url.searchParams.get('end_lt');
                let list = [...(txs.get(a) ?? [])].sort((x, y) => (x.lt < y.lt ? 1 : -1));
                if (endLt) list = list.filter((t) => t.lt <= BigInt(endLt));
                const transactions = list.slice(0, limit).map((t) => ({
                    lt: t.lt.toString(),
                    hash: t.hash().toString('base64'),
                    now: t.now,
                    description: { aborted: t.description.type === 'generic' ? t.description.aborted : false },
                    out_msgs: [...t.outMessages.values()].map((m) => ({
                        destination: m.info.type === 'external-out' ? null : m.info.dest.toString(),
                        message_content: { body: body(m.body) },
                    })),
                }));
                return res.end(JSON.stringify({ transactions }));
            }
            if (url.pathname === '/api/v3/jetton/wallets') {
                const owner = Address.parse(url.searchParams.get('owner_address')!);
                const jetton_wallets = [];
                for (const t of tokens) {
                    const { walletCode } = await t.getJettonData();
                    const w = jettonWalletAddress(owner, t.address, walletCode);
                    const bal = await bc.openContract(JettonWallet.createFromAddress(w)).getJettonBalance();
                    if (bal > 0n) jetton_wallets.push({ address: w.toRawString(), jetton: t.address.toRawString(), owner: owner.toRawString(), balance: bal.toString() });
                }
                return res.end(JSON.stringify({ jetton_wallets }));
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'not found' }));
        } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(e) }));
        }
    });
    server.listen(PORT, '127.0.0.1', () => console.log(`toncenter-v3 mock on http://127.0.0.1:${PORT}/api/v3`));
    void beginCell;
}

void main();
