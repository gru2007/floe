// High-level read layer: everything is read straight from the chain and computed locally.
import { Address } from '@ton/core';
import {
  CurveParams,
  FactoryState,
  jettonWalletAddress,
  parseFactoryData,
  ParsedMetadata,
  parseMetadata,
  parseTokenData,
  parseTradeEvent,
  parseWalletBalance,
  spotPrice,
  tokenAddress,
  TokenState,
} from '@shared/protocol';
import { getAccountState, getAccountStates, getJettonWallets, getTransactions } from './api';
import type { AppConfig } from './config';

export interface TokenInfo {
  address: Address;
  state: TokenState;
  meta: ParsedMetadata;
  balance: bigint; // TON on the contract
  lastLt: string | null;
}

export interface Trade {
  lt: string;
  hash: string;
  isBuy: boolean;
  trader: string; // raw
  ton: string; // bigint as string (for localStorage)
  jettons: string;
  supply: string;
  reserve: string;
  time: number;
}

export const curveOf = (s: TokenState): CurveParams => ({ vt: s.vt, vj: s.vj, maxSupply: s.maxSupply, maxBuy: s.maxBuy });

/** Reserve when the whole supply is sold out */
export function fillTarget(s: TokenState): bigint {
  return (s.vt * s.maxSupply) / (s.vj - s.maxSupply);
}

export function progressPct(s: TokenState): number {
  const t = fillTarget(s);
  return t === 0n ? 0 : Math.min(100, Number((s.reserve * 10000n) / t) / 100);
}

export const priceOf = (s: TokenState) => spotPrice(curveOf(s), s.supply);
export const mcapOf = (s: TokenState) => priceOf(s) * (Number(s.maxSupply) / 1e9);

// ---------------------------------------------------------------- factories

const factoryCache = new Map<string, { at: number; v: FactoryState }>();

export async function loadFactories(cfg: AppConfig): Promise<{ address: Address; state: FactoryState }[]> {
  if (cfg.factories.length === 0) return [];
  const fresh = cfg.factories.every((f) => {
    const c = factoryCache.get(f.toRawString());
    return c && Date.now() - c.at < 15_000;
  });
  if (!fresh) {
    const states = await getAccountStates(cfg.factories);
    for (const f of cfg.factories) {
      const st = states.get(f.toRawString());
      if (st?.data) factoryCache.set(f.toRawString(), { at: Date.now(), v: parseFactoryData(st.data) });
    }
  }
  return cfg.factories
    .filter((f) => factoryCache.has(f.toRawString()))
    .map((f) => ({ address: f, state: factoryCache.get(f.toRawString())!.v }));
}

/** Newest tokens first, across all configured factories. Pure computation. */
export async function listTokenAddresses(cfg: AppConfig): Promise<Address[]> {
  const factories = await loadFactories(cfg);
  const out: { a: Address; idx: bigint }[] = [];
  for (const f of factories) {
    for (let i = f.state.nextIndex - 1n; i >= 0n; i--) {
      out.push({ a: tokenAddress(f.address, i, f.state.tokenCode), idx: i });
    }
  }
  return out.filter((x) => !cfg.hidden.has(x.a.toRawString())).map((x) => x.a);
}

// ---------------------------------------------------------------- tokens

const tokenCache = new Map<string, { at: number; v: TokenInfo | null }>();

function isBlocked(cfg: AppConfig, meta: ParsedMetadata): boolean {
  const text = `${meta.name ?? ''} ${meta.symbol ?? ''} ${meta.description ?? ''}`.toLowerCase();
  return cfg.floe.blockedWords.some((w) => w && text.includes(w));
}

export async function loadTokens(cfg: AppConfig, addresses: Address[], maxAgeMs = 10_000): Promise<TokenInfo[]> {
  const need = addresses.filter((a) => {
    const c = tokenCache.get(a.toRawString());
    return !c || Date.now() - c.at > maxAgeMs;
  });
  if (need.length) {
    const states = await getAccountStates(need);
    for (const a of need) {
      const st = states.get(a.toRawString());
      let v: TokenInfo | null = null;
      try {
        const parsed = st?.data ? parseTokenData(st.data) : null;
        if (parsed && cfg.factories.some((f) => f.equals(parsed.factory))) {
          const meta = parseMetadata(parsed.content);
          if (!isBlocked(cfg, meta)) v = { address: a, state: parsed, meta, balance: st!.balance, lastLt: st!.lastLt };
        }
      } catch (e) {
        console.warn('cannot parse token', a.toString(), e);
      }
      tokenCache.set(a.toRawString(), { at: Date.now(), v });
    }
  }
  return addresses
    .map((a) => tokenCache.get(a.toRawString())?.v ?? null)
    .filter((x): x is TokenInfo => x !== null && !cfg.hidden.has(x.address.toRawString()));
}

export async function loadToken(cfg: AppConfig, address: Address, maxAgeMs = 4_000): Promise<TokenInfo | null> {
  return (await loadTokens(cfg, [address], maxAgeMs))[0] ?? null;
}

export function invalidateToken(address: Address) {
  tokenCache.delete(address.toRawString());
}

// ---------------------------------------------------------------- balances

export async function tonBalance(owner: Address): Promise<bigint> {
  return (await getAccountState(owner)).balance;
}

export async function jettonBalance(token: TokenInfo, owner: Address): Promise<bigint> {
  const w = jettonWalletAddress(owner, token.address, token.state.walletCode);
  const st = await getAccountState(w);
  return st.status === 'active' && st.data ? parseWalletBalance(st.data) : 0n;
}

export async function portfolio(cfg: AppConfig, owner: Address): Promise<{ token: TokenInfo; balance: bigint }[]> {
  const rows = await getJettonWallets(owner);
  if (!rows.length) return [];
  const tokens = await loadTokens(cfg, rows.map((r) => r.jetton), 30_000);
  const out: { token: TokenInfo; balance: bigint }[] = [];
  for (const t of tokens) {
    const row = rows.find((r) => r.jetton.equals(t.address));
    // trust only wallets whose address matches the token's wallet code (no fake wallets)
    if (row && jettonWalletAddress(owner, t.address, t.state.walletCode).equals(row.address) && row.balance > 0n) {
      out.push({ token: t, balance: row.balance });
    }
  }
  return out;
}

// ---------------------------------------------------------------- trades (for charts)
// Cached in localStorage per token; each visit fetches only newer transactions.

interface TradeCache {
  v: 1;
  trades: Trade[]; // oldest -> newest
  newestLt: string | null;
  oldestLt: string | null;
  complete: boolean; // reached the deploy transaction
}

const cacheKey = (cfg: AppConfig, a: Address) => `floe:trades:${cfg.isTestnet ? 't' : 'm'}:${a.toRawString()}`;

function readCache(cfg: AppConfig, a: Address): TradeCache {
  try {
    const raw = localStorage.getItem(cacheKey(cfg, a));
    if (raw) {
      const c = JSON.parse(raw) as TradeCache;
      if (c.v === 1) return c;
    }
  } catch {
    /* storage may be unavailable in iframes */
  }
  return { v: 1, trades: [], newestLt: null, oldestLt: null, complete: false };
}

function writeCache(cfg: AppConfig, a: Address, c: TradeCache) {
  try {
    localStorage.setItem(cacheKey(cfg, a), JSON.stringify({ ...c, trades: c.trades.slice(-5000) }));
  } catch {
    /* quota or disabled storage: charts still work, just refetch */
  }
}

function txToTrades(txs: Awaited<ReturnType<typeof getTransactions>>): Trade[] {
  const out: Trade[] = [];
  for (const tx of txs) {
    if (tx.aborted) continue;
    for (const body of tx.externals) {
      const e = parseTradeEvent(body);
      if (!e) continue;
      out.push({
        lt: tx.lt,
        hash: tx.hash,
        isBuy: e.isBuy,
        trader: e.trader.toRawString(),
        ton: e.ton.toString(),
        jettons: e.jettons.toString(),
        supply: e.supply.toString(),
        reserve: e.reserve.toString(),
        time: e.time || tx.now,
      });
    }
  }
  return out;
}

/**
 * Loads trade history. Calls `onProgress` with the full (oldest->newest) list as pages arrive.
 * Stops after `maxPages` pages of old history per call; the cache continues next time.
 */
export async function loadTrades(
  cfg: AppConfig,
  token: Address,
  onProgress: (t: Trade[]) => void,
  maxPages = 20,
): Promise<Trade[]> {
  const cache = readCache(cfg, token);
  if (cache.trades.length) onProgress(cache.trades);

  // 1) newer than cache
  const newer: Trade[] = [];
  let before: bigint | undefined;
  let pages = 0;
  let reachedCache = cache.newestLt === null;
  let topLt: string | null = null;
  while (pages < maxPages) {
    const txs = await getTransactions(token, 100, before);
    pages++;
    if (!txs.length) {
      if (cache.newestLt === null) cache.complete = true;
      break;
    }
    if (!topLt) topLt = txs[0].lt;
    const fresh = cache.newestLt ? txs.filter((t) => BigInt(t.lt) > BigInt(cache.newestLt!)) : txs;
    newer.push(...txToTrades(fresh));
    if (cache.newestLt === null) cache.oldestLt = txs[txs.length - 1].lt;
    if (fresh.length < txs.length) {
      reachedCache = true;
      break;
    }
    before = BigInt(txs[txs.length - 1].lt);
    if (txs.length < 100) {
      if (cache.newestLt === null) cache.complete = true;
      reachedCache = true;
      break;
    }
    if (cache.newestLt === null) {
      cache.trades = [...newer].reverse();
      onProgress(cache.trades);
    }
  }
  if (newer.length || topLt) {
    if (cache.newestLt === null) {
      cache.trades = [...newer].reverse();
    } else if (reachedCache) {
      cache.trades = [...cache.trades, ...newer.reverse()];
    } else {
      // too many new trades to bridge the gap: restart history from the top
      cache.trades = [...newer].reverse();
      cache.complete = false;
      cache.oldestLt = before !== undefined ? before.toString() : null;
    }
    if (topLt) cache.newestLt = topLt;
  }

  // 2) older history, if not complete yet
  while (!cache.complete && cache.oldestLt && pages < maxPages) {
    const txs = await getTransactions(token, 100, BigInt(cache.oldestLt));
    pages++;
    if (!txs.length) {
      cache.complete = true;
      break;
    }
    cache.trades = [...txToTrades(txs).reverse(), ...cache.trades];
    cache.oldestLt = txs[txs.length - 1].lt;
    if (txs.length < 100) cache.complete = true;
    onProgress(cache.trades);
  }

  // de-duplicate (lt+hash) and keep order
  const seen = new Set<string>();
  cache.trades = cache.trades.filter((t) => {
    const k = `${t.lt}:${t.hash}:${t.jettons}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  writeCache(cfg, token, cache);
  onProgress(cache.trades);
  return cache.trades;
}

// ---------------------------------------------------------------- tx confirmation polling

/** Waits until the account's last transaction changes (or timeout). */
export async function waitForChange(address: Address, prevLt: string | null, timeoutMs = 90_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const st = await getAccountState(address);
      if (st.lastLt && st.lastLt !== prevLt) return true;
    } catch {
      /* keep polling */
    }
  }
  return false;
}

// ---------------------------------------------------------------- TON/USD (optional, public API)

let usdCache: { at: number; v: number | null } | null = null;
export async function tonUsd(): Promise<number | null> {
  if (usdCache && Date.now() - usdCache.at < 300_000) return usdCache.v;
  try {
    const r = await fetch('https://tonapi.io/v2/rates?tokens=ton&currencies=usd');
    const j = await r.json();
    const v = Number(j?.rates?.TON?.prices?.USD);
    usdCache = { at: Date.now(), v: Number.isFinite(v) ? v : null };
  } catch {
    usdCache = { at: Date.now(), v: null };
  }
  return usdCache.v;
}
