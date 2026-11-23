// Minimal toncenter v3 client. Public endpoint, CORS enabled, no backend of ours.
// Without an API key toncenter allows ~1 request/second, so every call goes
// through a single queue and retries on 429.
import { Address, Cell } from '@ton/core';

export interface AccountState {
  address: Address;
  status: 'active' | 'uninit' | 'frozen' | 'nonexist';
  balance: bigint;
  data: Cell | null;
  lastLt: string | null;
}

export interface RawTx {
  lt: string;
  hash: string;
  now: number;
  aborted: boolean;
  externals: Cell[];
}

export interface JettonWalletRow {
  address: Address;
  jetton: Address;
  balance: bigint;
}

class Toncenter {
  private chain: Promise<unknown> = Promise.resolve();
  private last = 0;

  constructor(
    private base: string,
    private key?: string,
  ) {}

  private get gap() {
    return this.key ? 120 : 1100;
  }

  private schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const wait = this.last + this.gap - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      return fn();
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  async get<T>(path: string, params: Record<string, string | number | boolean | string[]>): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
      else qs.append(k, String(v));
    }
    const url = `${this.base}${path}?${qs}`;
    for (let attempt = 0; ; attempt++) {
      const res = await this.schedule(() =>
        fetch(url, { headers: this.key ? { 'X-API-Key': this.key } : undefined }),
      );
      if (res.status === 429 && attempt < 5) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`toncenter ${path}: HTTP ${res.status}`);
      return (await res.json()) as T;
    }
  }
}

let client: Toncenter | null = null;

export function initApi(testnet: boolean, key?: string, baseUrl?: string) {
  const base = baseUrl || (testnet ? 'https://testnet.toncenter.com/api/v3' : 'https://toncenter.com/api/v3');
  client = new Toncenter(base.replace(/\/$/, ''), key || undefined);
}

function api(): Toncenter {
  if (!client) throw new Error('api not initialized');
  return client;
}

const b64cell = (b64: string | null | undefined): Cell | null => {
  if (!b64) return null;
  try {
    return Cell.fromBase64(b64);
  } catch {
    return null;
  }
};

/** Batched: one request per 50 addresses */
export async function getAccountStates(addresses: Address[]): Promise<Map<string, AccountState>> {
  const out = new Map<string, AccountState>();
  for (let i = 0; i < addresses.length; i += 50) {
    const chunk = addresses.slice(i, i + 50);
    const r = await api().get<{ accounts: any[] }>('/accountStates', {
      address: chunk.map((a) => a.toRawString()),
      include_boc: true,
    });
    for (const acc of r.accounts ?? []) {
      const address = Address.parse(acc.address);
      out.set(address.toRawString(), {
        address,
        status: acc.status,
        balance: BigInt(acc.balance ?? 0),
        data: b64cell(acc.data_boc),
        lastLt: acc.last_transaction_lt ?? null,
      });
    }
  }
  for (const a of addresses) {
    if (!out.has(a.toRawString()))
      out.set(a.toRawString(), { address: a, status: 'nonexist', balance: 0n, data: null, lastLt: null });
  }
  return out;
}

export async function getAccountState(address: Address): Promise<AccountState> {
  return (await getAccountStates([address])).get(address.toRawString())!;
}

/** Newest first. `beforeLt` paginates to older transactions. */
export async function getTransactions(account: Address, limit = 100, beforeLt?: bigint): Promise<RawTx[]> {
  const params: Record<string, string | number> = { account: account.toRawString(), limit, sort: 'desc' };
  if (beforeLt !== undefined) params.end_lt = (beforeLt - 1n).toString();
  const r = await api().get<{ transactions: any[] }>('/transactions', params);
  return (r.transactions ?? []).map((t) => ({
    lt: String(t.lt),
    hash: String(t.hash),
    now: Number(t.now),
    aborted: Boolean(t.description?.aborted),
    // external "log" messages; bodies are parsed by opcode, so internal messages are harmless here
    externals: (t.out_msgs ?? [])
      .map((m: any) => b64cell(m.message_content?.body))
      .filter((c: Cell | null): c is Cell => c !== null),
  }));
}

export async function getJettonWallets(owner: Address): Promise<JettonWalletRow[]> {
  const r = await api().get<{ jetton_wallets: any[] }>('/jetton/wallets', {
    owner_address: owner.toRawString(),
    limit: 200,
    exclude_zero_balance: true,
  });
  return (r.jetton_wallets ?? []).map((w) => ({
    address: Address.parse(w.address),
    jetton: Address.parse(w.jetton),
    balance: BigInt(w.balance ?? 0),
  }));
}
