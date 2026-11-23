import { useEffect, useMemo, useState } from 'react';
import { Address } from '@ton/core';
import { useTonAddress } from '@tonconnect/ui-react';
import { costToBuy, Limits, quoteBuy, quoteSell } from '@shared/protocol';
import { useConfig, useToast } from '../ctx';
import { useAw } from '../aw';
import { useSend } from '../tx';
import { curveOf, jettonBalance, tonBalance, type TokenInfo } from '../lib/chain';
import { buyTx, sellTx, sendTx, slippageMin } from '../lib/tx';
import { compact, fromNano, nanoToInput, toNanoSafe } from '../lib/format';
import { IconQr, IconSend, IconSwap } from '../icons';
import { jettonWalletAddress } from '@shared/protocol';

type Mode = 'buy' | 'sell' | 'send';
const SLIPPAGES = [1, 3, 5, 10, 20];

export function TradePanel({ t, onTraded }: { t: TokenInfo; onTraded: () => void }) {
  const cfg = useConfig();
  const aw = useAw();
  const toast = useToast();
  const send = useSend();
  const me = useTonAddress(false);
  const owner = useMemo(() => (me ? Address.parse(me) : null), [me]);
  const [mode, setMode] = useState<Mode>('buy');
  const [amount, setAmount] = useState('');
  const [to, setTo] = useState('');
  const [slip, setSlip] = useState(5);
  const [tonBal, setTonBal] = useState<bigint | null>(null);
  const [jetBal, setJetBal] = useState<bigint | null>(null);
  const [tick, setTick] = useState(0);
  const sym = t.meta.symbol || 'TOKEN';
  const curve = curveOf(t.state);
  const fees = { creatorFeeBps: t.state.creatorFeeBps, platformFeeBps: t.state.platformFeeBps };

  useEffect(() => {
    if (!owner) {
      setTonBal(null);
      setJetBal(null);
      return;
    }
    let alive = true;
    void tonBalance(owner).then((b) => alive && setTonBal(b)).catch(() => undefined);
    void jettonBalance(t, owner).then((b) => alive && setJetBal(b)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [owner, t, tick]);

  const nano = toNanoSafe(amount) ?? 0n;
  const remaining = t.state.maxSupply - t.state.supply;
  const maxTonIn = useMemo(() => {
    // TON that buys the rest of the supply (or the per-trade limit), before fees
    const cap = t.state.maxBuy && t.state.maxBuy < remaining ? t.state.maxBuy : remaining;
    if (cap <= 0n) return 0n;
    const net = costToBuy(curve, t.state.supply, cap);
    const feeBps = BigInt(fees.creatorFeeBps + fees.platformFeeBps);
    return (net * 10000n) / (10000n - feeBps) - 1n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const quote = useMemo(() => {
    if (nano <= 0n) return null;
    if (mode === 'buy') {
      const q = quoteBuy(curve, fees, t.state.supply, nano);
      return { out: q.tokens, fee: q.fee };
    }
    if (mode === 'sell') {
      const q = quoteSell(curve, fees, t.state.supply, t.state.reserve, nano);
      return { out: q.ton, fee: q.fee };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, nano, t]);

  let error: string | null = null;
  if (mode === 'buy' && nano > 0n) {
    if (nano < Limits.MIN_TRADE) error = 'Минимум 0.01 TON';
    else if (remaining <= 0n) error = 'Вся эмиссия распродана — можно только продавать';
    else if (quote && t.state.maxBuy && quote.out > t.state.maxBuy) error = `Лимит одной покупки — ${compact(fromNano(t.state.maxBuy))} ${sym}`;
    else if (quote && quote.out > remaining) error = `Осталось только ${compact(fromNano(remaining))} ${sym}`;
    else if (tonBal !== null && nano + Limits.BUY_GAS > tonBal) error = 'Недостаточно TON';
  }
  if (mode === 'sell' && nano > 0n) {
    if (jetBal !== null && nano > jetBal) error = `Недостаточно ${sym}`;
    else if (tonBal !== null && Limits.SELL_VALUE > tonBal) error = 'Нужно ~0.06 TON на газ';
    else if (quote && quote.out <= 0n) error = 'Слишком маленькая сумма';
  }
  let toAddr: Address | null = null;
  if (mode === 'send' && to) {
    try {
      toAddr = Address.parse(to.trim());
    } catch {
      error = 'Неверный адрес';
    }
    if (jetBal !== null && nano > jetBal) error = `Недостаточно ${sym}`;
  }

  const refresh = () => {
    setTick((x) => x + 1);
    onTraded();
  };

  const submit = async () => {
    if (error || nano <= 0n) return;
    if (mode === 'buy' && quote) {
      await send(() => buyTx(t, nano, slippageMin(quote.out, slip), cfg.isTestnet), { watch: t.address, done: `Куплено ${sym}`, onConfirmed: refresh });
    } else if (mode === 'sell' && quote && owner) {
      await send(() => sellTx(t, owner, nano, slippageMin(quote.out, slip), cfg.isTestnet), { watch: t.address, done: `${sym} продано`, onConfirmed: refresh });
    } else if (mode === 'sell' || mode === 'send') {
      if (!owner) return void send(() => { throw new Error('Подключите кошелёк'); });
      if (mode === 'send' && toAddr) {
        await send(() => sendTx(t, owner, toAddr!, nano, cfg.isTestnet), {
          watch: jettonWalletAddress(owner, t.address, t.state.walletCode),
          done: 'Отправлено',
          onConfirmed: refresh,
        });
      }
    }
  };

  const setPct = (p: number) => {
    aw.haptic('select');
    if (mode === 'buy') {
      if (tonBal === null) return;
      let v = ((tonBal - Limits.BUY_GAS - 20_000_000n) * BigInt(p)) / 100n;
      if (v > maxTonIn) v = maxTonIn;
      setAmount(v > 0n ? nanoToInput(v) : '');
    } else if (jetBal !== null) {
      setAmount(nanoToInput((jetBal * BigInt(p)) / 100n, 9));
    }
  };

  const scan = async () => {
    try {
      const v = await aw.scanQr();
      if (v) setTo(v.replace(/^ton:\/\/transfer\//, '').split('?')[0]);
    } catch (e) {
      toast(String(e), 'error');
    }
  };

  return (
    <section className="card trade">
      <div className="seg">
        {(['buy', 'sell', 'send'] as Mode[]).map((m) => (
          <button
            key={m}
            className={`seg-item ${mode === m ? `-on -${m}` : ''}`}
            onClick={() => {
              setMode(m);
              setAmount('');
              aw.haptic('select');
            }}
          >
            {m === 'buy' ? 'Купить' : m === 'sell' ? 'Продать' : 'Отправить'}
          </button>
        ))}
      </div>

      {mode === 'send' && (
        <label className="field -icon">
          <IconSend size={18} />
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Адрес получателя" spellCheck={false} autoCapitalize="off" />
          {aw.canScan && (
            <button className="icon-btn" type="button" onClick={() => void scan()} aria-label="Сканировать QR">
              <IconQr size={18} />
            </button>
          )}
        </label>
      )}

      <label className="amount">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" inputMode="decimal" />
        <span>{mode === 'buy' ? 'TON' : sym}</span>
      </label>
      <div className="balance-row">
        <span>
          Баланс: {mode === 'buy' ? (tonBal === null ? '—' : `${compact(fromNano(tonBal), 3)} TON`) : jetBal === null ? '—' : `${compact(fromNano(jetBal), 2)} ${sym}`}
        </span>
        <span className="chips -small">
          {[25, 50, 100].map((p) => (
            <button key={p} className="chip" onClick={() => setPct(p)}>{p === 100 ? 'Макс' : `${p}%`}</button>
          ))}
        </span>
      </div>

      {quote && mode !== 'send' && (
        <div className="quote">
          <div className="kv"><span><IconSwap size={14} /> Вы получите ≈</span><b>{mode === 'buy' ? `${compact(fromNano(quote.out), 2)} ${sym}` : `${compact(fromNano(quote.out), 4)} TON`}</b></div>
          <div className="kv"><span>Минимум (проскальзывание {slip}%)</span><b>{mode === 'buy' ? `${compact(fromNano(slippageMin(quote.out, slip)), 2)} ${sym}` : `${compact(fromNano(slippageMin(quote.out, slip)), 4)} TON`}</b></div>
          <div className="kv"><span>Комиссии (автор {t.state.creatorFeeBps / 100}% + платформа {t.state.platformFeeBps / 100}%)</span><b>{compact(fromNano(quote.fee), 4)} TON</b></div>
          <div className="kv"><span>Газ сети (излишек вернётся)</span><b>~{mode === 'buy' ? '0,05' : '0,06'} TON</b></div>
        </div>
      )}

      {mode !== 'send' && (
        <div className="slippage">
          <span>Проскальзывание</span>
          {SLIPPAGES.map((s) => (
            <button key={s} className={slip === s ? 'chip -on' : 'chip'} onClick={() => setSlip(s)}>{s}%</button>
          ))}
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
      <button className={`btn -wide -big -${mode}`} disabled={!!error || nano <= 0n || (mode === 'send' && !toAddr)} onClick={() => void submit()}>
        {mode === 'buy' ? `Купить ${sym}` : mode === 'sell' ? `Продать ${sym}` : `Отправить ${sym}`}
      </button>
      {!owner && <p className="hint center">Для сделки подключите TON-кошелёк (Tonkeeper, MyTonWallet и др.)</p>}
    </section>
  );
}
