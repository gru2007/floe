// Shared between contracts tests, deploy scripts and the mini app.
// Mirrors contracts/imports/constants.fc and the curve math in contracts/token.fc.
import { Address, beginCell, Builder, Cell, Dictionary, Slice } from '@ton/core';

export const Op = {
    transfer: 0xf8a7ea5,
    internalTransfer: 0x178d4519,
    excesses: 0xd53276db,
    burn: 0x595f07bc,
    burnNotification: 0x7bdd97de,
    provideWalletAddress: 0x2c76b973,
    takeWalletAddress: 0xd1735400,
    topUp: 0xd372158c,
    createToken: 0x0c7e2a31,
    setConfig: 0x3a8b19d1,
    changeOwner: 0x6501f354,
    withdraw: 0x46ed2e94,
    initToken: 0x5a1e7f02,
    buy: 0x1f3ad9b0,
    claimFees: 0x7c1f0e44,
    platformFee: 0x50f3e1a7,
    creatorFee: 0x43f0e1a7,
    refund: 0x52e7c0d1,
} as const;

export const Event = {
    tokenCreated: 0x6c61756e,
    trade: 0x74726164,
} as const;

export const Errors = {
    notOwner: 73,
    notValidWallet: 74,
    balanceError: 47,
    notEnoughGas: 48,
    notFactory: 80,
    alreadyInitialized: 81,
    notInitialized: 82,
    badParams: 83,
    contentTooBig: 84,
    notEnoughTon: 85,
    wrongOp: 0xffff,
} as const;

export const RefundReason: Record<number, string> = {
    1: 'slippage',
    2: 'max_supply',
    3: 'max_buy',
    4: 'too_small',
};

const TON = 1_000_000_000n;
export const Limits = {
    BPS: 10_000n,
    MAX_CREATOR_FEE_BPS: 500,
    MAX_PLATFORM_FEE_BPS: 200,
    BUY_GAS: 50_000_000n, // 0.05 TON, unused part returns
    SELL_VALUE: 60_000_000n, // attached to a burn (sell), unused part returns
    CLAIM_VALUE: 50_000_000n,
    TOKEN_STORAGE_DEPOSIT: 100_000_000n,
    DEPLOY_GAS: 100_000_000n,
    MIN_TRADE: 10_000_000n,
    MIN_VIRTUAL_TON: 1n * TON,
    MAX_VIRTUAL_TON: 100_000n * TON,
    MIN_MAX_SUPPLY: 1_000_000n * TON,
    MAX_MAX_SUPPLY: 10n ** 27n,
    MAX_CONTENT_CELLS: 400,
    MAX_CONTENT_BITS: 120_000,
    DECIMALS: 9,
} as const;

// ---------------------------------------------------------------- curve

export interface CurveParams {
    vt: bigint; // virtual TON reserve (nanoTON)
    vj: bigint; // virtual token reserve (nano-units)
    maxSupply: bigint;
    maxBuy: bigint; // 0 = unlimited
}

export interface FeeParams {
    creatorFeeBps: number;
    platformFeeBps: number;
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export function splitFees(amount: bigint, fees: FeeParams): { creator: bigint; platform: bigint; total: bigint } {
    const creator = (amount * BigInt(fees.creatorFeeBps)) / Limits.BPS;
    const platform = (amount * BigInt(fees.platformFeeBps)) / Limits.BPS;
    return { creator, platform, total: creator + platform };
}

/** tokens for `netIn` TON (fees already removed) — same rounding as token.fc */
export function curveTokensOut(c: CurveParams, supply: bigint, netIn: bigint): bigint {
    const k = c.vt * c.vj;
    const y = c.vj - supply;
    const x = k / y;
    const yNew = ceilDiv(k, x + netIn);
    return yNew >= y ? 0n : y - yNew;
}

/** TON (before fees) for returning `amount` tokens to the curve */
export function curveTonOut(c: CurveParams, supply: bigint, amount: bigint): bigint {
    const k = c.vt * c.vj;
    const y = c.vj - supply;
    const x = k / y;
    const xNew = ceilDiv(k, y + amount);
    return xNew >= x ? 0n : x - xNew;
}

export function quoteBuy(c: CurveParams, f: FeeParams, supply: bigint, tonIn: bigint) {
    const fee = splitFees(tonIn, f);
    const tokens = curveTokensOut(c, supply, tonIn - fee.total);
    return { tokens, fee: fee.total };
}

export function quoteSell(c: CurveParams, f: FeeParams, supply: bigint, reserve: bigint, amount: bigint) {
    let gross = curveTonOut(c, supply, amount);
    if (gross > reserve) gross = reserve;
    const fee = splitFees(gross, f);
    return { ton: gross - fee.total, fee: fee.total };
}

/** TON needed to buy tokens from `supply` up to `supply + amount` (before fees, exact curve) */
export function costToBuy(c: CurveParams, supply: bigint, amount: bigint): bigint {
    const k = c.vt * c.vj;
    return ceilDiv(k, c.vj - supply - amount) - k / (c.vj - supply);
}

/** Spot price in TON per 1 whole token (float, for display/charts). */
export function spotPrice(c: CurveParams, supply: bigint): number {
    // dx/dy = x / y = k / y^2
    const y = Number(c.vj - supply);
    const k = Number(c.vt) * Number(c.vj);
    return k / (y * y); // nanoTON per nano-token == TON per token
}

export function marketCapTon(c: CurveParams, supply: bigint): number {
    return spotPrice(c, supply) * (Number(c.maxSupply) / 1e9);
}

/**
 * Curve from human inputs.
 * - maxSupply: whole tokens
 * - startMcapTon: market cap (of max supply) at the first trade, in TON
 * - fillTon: TON in the reserve when the whole supply is sold out
 */
export function designCurve(input: { maxSupply: bigint; startMcapTon: number; fillTon: number; maxBuyPct?: number }): CurveParams {
    const maxSupply = input.maxSupply * TON;
    // start price p0 = vt / vj ;  mcap0 = p0 * M  ->  vt = mcap0 * vj / M
    // fill: R(M) = vt * M / (vj - M) = fill
    // => vt = mcap0 * vj / M and mcap0 * vj / (vj - M) = fill  =>  vj = fill * M / (fill - mcap0)
    const mcap0 = BigInt(Math.round(input.startMcapTon * 1e9));
    const fill = BigInt(Math.round(input.fillTon * 1e9));
    if (fill <= mcap0) throw new Error('fillTon must be greater than startMcapTon');
    const vj = (fill * maxSupply) / (fill - mcap0);
    const vt = (mcap0 * vj) / maxSupply;
    const maxBuy = input.maxBuyPct ? (maxSupply * BigInt(Math.round(input.maxBuyPct * 100))) / 10_000n : 0n;
    return { vt, vj, maxSupply, maxBuy };
}

export function validateCurve(c: CurveParams): string | null {
    if (c.vt < Limits.MIN_VIRTUAL_TON) return 'Стартовая капитализация слишком мала (виртуальный резерв < 1 TON)';
    if (c.vt > Limits.MAX_VIRTUAL_TON) return 'Стартовая капитализация слишком велика';
    if (c.maxSupply < Limits.MIN_MAX_SUPPLY) return 'Эмиссия должна быть не меньше 1 000 000';
    if (c.maxSupply > Limits.MAX_MAX_SUPPLY) return 'Эмиссия слишком большая';
    if (c.vj - c.maxSupply < c.maxSupply / 100n) return 'Кривая слишком крутая: увеличьте стартовую капитализацию или уменьшите цель';
    if (c.maxBuy !== 0n && (c.maxBuy < c.maxSupply / 1000n || c.maxBuy > c.maxSupply)) return 'Лимит покупки: от 0.1% до 100%';
    return null;
}

// ---------------------------------------------------------------- messages

/** TON to attach to create_token */
export function createTokenValue(deployFee: bigint, devBuy: bigint): bigint {
    return deployFee + Limits.DEPLOY_GAS + Limits.TOKEN_STORAGE_DEPOSIT + (devBuy > 0n ? devBuy + Limits.BUY_GAS : 0n);
}

export function storeCurve(c: CurveParams): Cell {
    return beginCell().storeCoins(c.vt).storeCoins(c.vj).storeCoins(c.maxSupply).storeCoins(c.maxBuy).endCell();
}

export function createTokenBody(p: { queryId?: bigint; creatorFeeBps: number; devBuy: bigint; minOut: bigint; curve: CurveParams; content: Cell }): Cell {
    return beginCell()
        .storeUint(Op.createToken, 32)
        .storeUint(p.queryId ?? 0n, 64)
        .storeUint(p.creatorFeeBps, 16)
        .storeCoins(p.devBuy)
        .storeCoins(p.minOut)
        .storeRef(storeCurve(p.curve))
        .storeRef(p.content)
        .endCell();
}

export function buyBody(minOut: bigint, queryId: bigint = 0n): Cell {
    return beginCell().storeUint(Op.buy, 32).storeUint(queryId, 64).storeCoins(minOut).endCell();
}

/** Sent to the USER'S jetton wallet: burn == sell to the curve. */
export function sellBody(p: { amount: bigint; responseAddress: Address; minTonOut: bigint; queryId?: bigint }): Cell {
    return beginCell()
        .storeUint(Op.burn, 32)
        .storeUint(p.queryId ?? 0n, 64)
        .storeCoins(p.amount)
        .storeAddress(p.responseAddress)
        .storeMaybeRef(beginCell().storeCoins(p.minTonOut).endCell())
        .endCell();
}

export function transferBody(p: { amount: bigint; to: Address; responseAddress: Address; forwardTon?: bigint; queryId?: bigint }): Cell {
    return beginCell()
        .storeUint(Op.transfer, 32)
        .storeUint(p.queryId ?? 0n, 64)
        .storeCoins(p.amount)
        .storeAddress(p.to)
        .storeAddress(p.responseAddress)
        .storeMaybeRef(null)
        .storeCoins(p.forwardTon ?? 0n)
        .storeBit(false)
        .endCell();
}

export function claimFeesBody(queryId: bigint = 0n): Cell {
    return beginCell().storeUint(Op.claimFees, 32).storeUint(queryId, 64).endCell();
}

// ---------------------------------------------------------------- events

export interface TradeEvent {
    isBuy: boolean;
    trader: Address;
    ton: bigint; // buy: TON in incl. fees, sell: TON out after fees
    jettons: bigint;
    fee: bigint;
    supply: bigint; // after
    reserve: bigint; // after
    time: number;
}

export function parseTradeEvent(body: Cell): TradeEvent | null {
    try {
        const s = body.beginParse();
        if (s.loadUint(32) !== Event.trade) return null;
        return {
            isBuy: s.loadBit(),
            trader: s.loadAddress(),
            ton: s.loadCoins(),
            jettons: s.loadCoins(),
            fee: s.loadCoins(),
            supply: s.loadCoins(),
            reserve: s.loadCoins(),
            time: s.loadUint(32),
        };
    } catch {
        return null;
    }
}

export interface CreatedEvent {
    index: bigint;
    token: Address;
    creator: Address;
    time: number;
}

export function parseCreatedEvent(body: Cell): CreatedEvent | null {
    try {
        const s = body.beginParse();
        if (s.loadUint(32) !== Event.tokenCreated) return null;
        return { index: s.loadUintBig(64), token: s.loadAddress(), creator: s.loadAddress(), time: s.loadUint(32) };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------- TEP-64 on-chain metadata

export type MetadataKey =
    | 'name'
    | 'symbol'
    | 'description'
    | 'image'
    | 'image_data'
    | 'decimals'
    | 'website'
    | 'telegram'
    | 'twitter';

// sha256(key) — precomputed so the browser bundle needs no crypto library
const KEY_HASH: Record<MetadataKey, bigint> = {
    name: 0x82a3537ff0dbce7eec35d69edc3a189ee6f17d82f353a553f9aa96cb0be3ce89n,
    symbol: 0xb76a7ca153c24671658335bbd08946350ffc621fa1c516e7123095d4ffd5c581n,
    description: 0xc9046f7a37ad0ea7cee73355984fa5428982f8b37c8f7bcec91f7ac71a7cd104n,
    image: 0x6105d6cc76af400325e94d588ce511be5bfdbb73b437dc51eca43917d7a43e3dn,
    image_data: 0xd9a88ccec79eef59c84b671136a20ece4cd00caaad5bc47e2c208829154ee9e4n,
    decimals: 0xee80fd2f1e03480e2282363596ee752d7bb27f50776b95086a0279189675923en,
    website: 0x747a8f398395dde8e524d9f983784bd8441c5cfe4307b5a079be5412ee65c314n,
    telegram: 0x3f40462915a3e6026a4d790127b95ded4d870f6ab18d9af2fcbc454168255237n,
    twitter: 0x7352f353c460e74c7ae226952d04f8aa307b12329c5512ec8cb6f1a0f8f9b2cbn,
};
const keyHash = (k: string) => KEY_HASH[k as MetadataKey];

function snake(data: Buffer): Cell {
    // first cell: 0x00 prefix + 126 bytes; next cells: 127 bytes each
    const chunks: Buffer[] = [];
    chunks.push(data.subarray(0, 126));
    for (let i = 126; i < data.length; i += 127) chunks.push(data.subarray(i, i + 127));
    let tail: Cell | null = null;
    for (let i = chunks.length - 1; i >= 1; i--) {
        const b: Builder = beginCell().storeBuffer(chunks[i]);
        if (tail) b.storeRef(tail);
        tail = b.endCell();
    }
    const head = beginCell().storeUint(0, 8).storeBuffer(chunks[0]);
    if (tail) head.storeRef(tail);
    return head.endCell();
}

function readSnake(s: Slice): Buffer {
    const parts: Buffer[] = [];
    let cur: Slice | null = s;
    while (cur) {
        parts.push(cur.loadBuffer(cur.remainingBits >> 3));
        cur = cur.remainingRefs ? cur.loadRef().beginParse() : null;
    }
    return Buffer.concat(parts);
}

export function buildOnchainMetadata(meta: Partial<Record<MetadataKey, string | Buffer>>): Cell {
    const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
    for (const [k, v] of Object.entries(meta)) {
        if (v === undefined || v === '' || (Buffer.isBuffer(v) && v.length === 0)) continue;
        dict.set(keyHash(k), snake(Buffer.isBuffer(v) ? v : Buffer.from(v, 'utf8')));
    }
    return beginCell().storeUint(0, 8).storeDict(dict).endCell();
}

export type ParsedMetadata = Partial<Record<Exclude<MetadataKey, 'image_data'>, string>> & { image_data?: Buffer; uri?: string };

const KNOWN_KEYS: MetadataKey[] = ['name', 'symbol', 'description', 'image', 'image_data', 'decimals', 'website', 'telegram', 'twitter'];

export function parseMetadata(content: Cell): ParsedMetadata {
    const s = content.beginParse();
    const prefix = s.loadUint(8);
    if (prefix === 1) return { uri: s.loadStringTail() };
    const dict = s.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
    const out: ParsedMetadata = {};
    for (const k of KNOWN_KEYS) {
        const v = dict.get(keyHash(k));
        if (!v) continue;
        const vs = v.beginParse();
        if (vs.remainingBits >= 8 && vs.preloadUint(8) === 0) vs.skip(8);
        const buf = readSnake(vs);
        if (k === 'image_data') out.image_data = buf;
        else (out as Record<string, string>)[k] = buf.toString('utf8');
    }
    return out;
}

export function contentSize(content: Cell): { cells: number; bits: number } {
    const seen = new Set<string>();
    let bits = 0;
    const walk = (c: Cell) => {
        const h = c.hash().toString('hex');
        if (seen.has(h)) return;
        seen.add(h);
        bits += c.bits.length;
        c.refs.forEach(walk);
    };
    walk(content);
    return { cells: seen.size, bits };
}

// ---------------------------------------------------------------- raw storage parsers
// The mini app reads contract storage (one batched indexer call) and does all the
// math locally — no get-method calls, no backend.

export interface TokenState extends CurveParams, FeeParams {
    factory: Address;
    index: bigint;
    creator: Address;
    supply: bigint;
    reserve: bigint;
    feesCreator: bigint;
    feesPlatform: bigint;
    createdAt: number;
    content: Cell;
    walletCode: Cell;
}

export function parseTokenData(data: Cell): TokenState | null {
    const ds = data.beginParse();
    if (!ds.loadBit()) return null; // not initialized yet
    const factory = ds.loadAddress();
    const index = ds.loadUintBig(64);
    const supply = ds.loadCoins();
    const reserve = ds.loadCoins();
    const feesCreator = ds.loadCoins();
    const feesPlatform = ds.loadCoins();
    const ps = ds.loadRef().beginParse();
    const content = ds.loadRef();
    const walletCode = ds.loadRef();
    const creator = ps.loadAddress();
    const creatorFeeBps = ps.loadUint(16);
    const platformFeeBps = ps.loadUint(16);
    const createdAt = ps.loadUint(32);
    const cs = ps.loadRef().beginParse();
    return {
        factory, index, supply, reserve, feesCreator, feesPlatform, content, walletCode,
        creator, creatorFeeBps, platformFeeBps, createdAt,
        vt: cs.loadCoins(), vj: cs.loadCoins(), maxSupply: cs.loadCoins(), maxBuy: cs.loadCoins(),
    };
}

export interface FactoryState {
    owner: Address;
    deployFee: bigint;
    platformFeeBps: number;
    nextIndex: bigint;
    tokenCode: Cell;
    walletCode: Cell;
}

export function parseFactoryData(data: Cell): FactoryState {
    const s = data.beginParse();
    return {
        owner: s.loadAddress(),
        deployFee: s.loadCoins(),
        platformFeeBps: s.loadUint(16),
        nextIndex: s.loadUintBig(64),
        tokenCode: s.loadRef(),
        walletCode: s.loadRef(),
    };
}

function stateInitAddress(code: Cell, data: Cell, workchain = 0): Address {
    const si = beginCell().storeUint(0, 2).storeMaybeRef(code).storeMaybeRef(data).storeUint(0, 1).endCell();
    return new Address(workchain, si.hash());
}

/** Same as factory get_token_address(index) — computed locally */
export function tokenAddress(factory: Address, index: bigint, tokenCode: Cell): Address {
    const data = beginCell().storeUint(0, 1).storeAddress(factory).storeUint(index, 64).endCell();
    return stateInitAddress(tokenCode, data);
}

/** Same as token get_wallet_address(owner) — computed locally */
export function jettonWalletAddress(owner: Address, token: Address, walletCode: Cell): Address {
    const data = beginCell().storeCoins(0).storeAddress(owner).storeAddress(token).endCell();
    return stateInitAddress(walletCode, data);
}

export function parseWalletBalance(data: Cell): bigint {
    return data.beginParse().loadCoins();
}
