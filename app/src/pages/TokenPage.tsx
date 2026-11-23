import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Address } from '@ton/core';
import { useConfig, useToast } from '../ctx';
import { useAw } from '../aw';
import { useSend } from '../tx';
import { curveOf, fillTarget, invalidateToken, loadToken, loadTrades, mcapOf, priceOf, progressPct, tonUsd, type TokenInfo, type Trade } from '../lib/chain';
import { claimTx } from '../lib/tx';
import { ago, compact, formatPrice, fromNano, shortAddr, ton } from '../lib/format';
import { fmtAddress } from '../lib/config';
import { TokenAvatar } from '../components/TokenAvatar';
import { PriceChart } from '../components/PriceChart';
import { TradePanel } from '../components/TradePanel';
import { useReadOnly, WebOnly } from '../components/WebOnly';
import { IconCopy, IconExternal, IconGlobe, IconLock, IconRefresh, IconShare, IconTelegram, IconX, IconCoins } from '../icons';

const TFS = [
  { s: 60, l: '1м' },
  { s: 300, l: '5м' },
  { s: 900, l: '15м' },
  { s: 3600, l: '1ч' },
  { s: 14400, l: '4ч' },
  { s: 86400, l: '1д' },
];

export function TokenPage() {
  const { address } = useParams();
  const cfg = useConfig();
  const aw = useAw();
  const toast = useToast();
  const send = useSend();
  const [t, setT] = useState<TokenInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(true);
  const [tf, setTf] = useState(300);
  const [usd, setUsd] = useState<number | null>(null);
  const readOnly = useReadOnly();

  const addr = useMemo(() => {
    try {
      return Address.parse(address ?? '');
    } catch {
      return null;
    }
  }, [address]);
  const friendly = addr ? fmtAddress(addr, cfg.isTestnet) : '';

  const reload = useCallback(async () => {
    if (!addr) return;
    invalidateToken(addr);
    const tok = await loadToken(cfg, addr, 0).catch(() => null);
    setT(tok);
    setNotFound(!tok);
    if (tok) {
      setTradesLoading(true);
      await loadTrades(cfg, addr, setTrades).catch((e) => console.warn(e));
      setTradesLoading(false);
    }
  }, [addr, cfg]);

  useEffect(() => {
    setT(null);
    setTrades([]);
    void reload();
    void tonUsd().then(setUsd);
  }, [reload]);

  // live-ish refresh while the page is open
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, 30_000);
    return () => clearInterval(id);
  }, [reload]);

  if (!addr) return <div className="page"><div className="empty -error">Неверный адрес токена</div></div>;
  if (notFound) return <div className="page"><div className="empty -error">Токен не найден в Floe (или скрыт модерацией)</div></div>;
  if (!t) return <div className="page"><div className="skeleton" style={{ height: 420, borderRadius: 20 }} /></div>;

  const s = t.state;
  const price = priceOf(s);
  const mcap = mcapOf(s);
  const pct = progressPct(s);
  const first = trades.length ? fromNano(trades[0].ton) : 0;
  const change24 = (() => {
    const dayAgo = Date.now() / 1000 - 86400;
    const old = [...trades].reverse().find((x) => x.time <= dayAgo);
    const c = curveOf(s);
    const p0 = old ? (Number(c.vt) * Number(c.vj)) / Number(c.vj - BigInt(old.supply)) ** 2 : (Number(c.vt) / Number(c.vj));
    return ((price - p0) / p0) * 100;
  })();
  const explorer = `https://${cfg.isTestnet ? 'testnet.' : ''}tonviewer.com/${friendly}`;
  const shareUrl = `${cfg.appUrl}#/t/${friendly}`;

  return (
    <div className="page">
      <section className="token-head">
        <TokenAvatar meta={t.meta} seed={friendly} size={56} />
        <div className="grow">
          <h1>{t.meta.name}</h1>
          <div className="muted">
            ${t.meta.symbol} ·{' '}
            <button
              className="link-btn"
              onClick={() => void navigator.clipboard?.writeText(friendly).then(() => toast('Адрес скопирован', 'ok'))}
            >
              {shortAddr(friendly)} <IconCopy size={14} />
            </button>
          </div>
        </div>
        <button className="icon-btn" onClick={() => void aw.share(shareUrl, `${t.meta.name} ($${t.meta.symbol}) на Floe`)} aria-label="Поделиться">
          <IconShare />
        </button>
      </section>

      <section className="stats">
        <div>
          <span>Цена, TON</span>
          <b>{formatPrice(price)}</b>
          <small className={change24 >= 0 ? 'up' : 'down'}>{change24 >= 0 ? '+' : ''}{change24.toFixed(1)}% за 24ч</small>
        </div>
        <div>
          <span>Капитализация, TON</span>
          <b>{compact(mcap)}</b>
          {usd && <small>≈ ${compact(mcap * usd)}</small>}
        </div>
        <div>
          <span>Резерв, TON</span>
          <b>{compact(fromNano(s.reserve))}</b>
          <small>{pct.toFixed(1)}% от {compact(fromNano(fillTarget(s)))}</small>
        </div>
      </section>
      <div className="progress -big"><span style={{ width: `${Math.max(1, pct)}%` }} /></div>

      <section className="card chart-card">
        <div className="chart-head">
          <div className="chips -small">
            {TFS.map((x) => (
              <button key={x.s} className={tf === x.s ? 'chip -on' : 'chip'} onClick={() => setTf(x.s)}>{x.l}</button>
            ))}
          </div>
          <button className="icon-btn" onClick={() => void reload()} aria-label="Обновить"><IconRefresh size={18} /></button>
        </div>
        <PriceChart trades={trades} curve={curveOf(s)} tf={tf} createdAt={s.createdAt} scheme={aw.scheme} />
        {tradesLoading && <p className="hint center">Загружаем историю сделок из блокчейна…</p>}
      </section>

      {readOnly ? <WebOnly path={`/t/${friendly}`} what="Торговля" /> : <TradePanel t={t} onTraded={() => void reload()} />}

      <section className="card">
        <h2>Сделки</h2>
        {trades.length === 0 && !tradesLoading && <p className="muted">Сделок пока нет. Будьте первым.</p>}
        <div className="trades">
          {[...trades].reverse().slice(0, 40).map((x) => {
            const trader = fmtAddress(Address.parse(x.trader), cfg.isTestnet, false);
            return (
              <div key={`${x.lt}:${x.hash}`} className="trade-row">
                <span className={x.isBuy ? 'tag -buy' : 'tag -sell'}>{x.isBuy ? 'Покупка' : 'Продажа'}</span>
                <span className="mono">{shortAddr(trader)}</span>
                <span>{compact(fromNano(x.ton), 3)} TON</span>
                <span className="muted">{ago(x.time)}</span>
              </div>
            );
          })}
        </div>
        {trades.length > 0 && <p className="hint">Первая сделка: {compact(first, 3)} TON · всего {trades.length}</p>}
      </section>

      <section className="card">
        <h2>О токене</h2>
        {t.meta.description && <p className="desc">{t.meta.description}</p>}
        <div className="links">
          {t.meta.website && /^https:/.test(t.meta.website) && <a href={t.meta.website} target="_blank" rel="noopener noreferrer nofollow"><IconGlobe size={16} /> Сайт</a>}
          {t.meta.telegram && /^https:/.test(t.meta.telegram) && <a href={t.meta.telegram} target="_blank" rel="noopener noreferrer nofollow"><IconTelegram size={16} /> Telegram</a>}
          {t.meta.twitter && /^https:/.test(t.meta.twitter) && <a href={t.meta.twitter} target="_blank" rel="noopener noreferrer nofollow"><IconX size={16} /> X</a>}
          <a href={explorer} target="_blank" rel="noopener noreferrer"><IconExternal size={16} /> Tonviewer</a>
        </div>
        <div className="kv"><span>Эмиссия (макс.)</span><b>{compact(fromNano(s.maxSupply))}</b></div>
        <div className="kv"><span>В обороте</span><b>{compact(fromNano(s.supply))}</b></div>
        <div className="kv"><span>Комиссия автора / платформы</span><b>{s.creatorFeeBps / 100}% / {s.platformFeeBps / 100}%</b></div>
        <div className="kv"><span>Лимит покупки</span><b>{s.maxBuy ? `${compact(fromNano(s.maxBuy))} за сделку` : 'нет'}</b></div>
        <div className="kv"><span>Автор</span><b className="mono">{shortAddr(fmtAddress(s.creator, cfg.isTestnet, false))}</b></div>
        <div className="kv"><span>Создан</span><b>{new Date(s.createdAt * 1000).toLocaleString('ru-RU')}</b></div>
        <p className="guarantee"><IconLock size={16} /> Нет админа и mint-функции; параметры неизменяемы. Токены выпускаются только при покупке у кривой.</p>
      </section>

      {!readOnly && (s.feesCreator > 0n || s.feesPlatform > 0n) && (
        <section className="card">
          <h2>Накопленные комиссии</h2>
          <div className="kv"><span>Автору</span><b>{ton(s.feesCreator, 4)}</b></div>
          <div className="kv"><span>Платформе</span><b>{ton(s.feesPlatform, 4)}</b></div>
          <button
            className="btn -secondary -wide"
            onClick={() => void send(() => claimTx(t, cfg.isTestnet), { watch: t.address, done: 'Комиссии выплачены', onConfirmed: () => void reload() })}
          >
            <IconCoins size={18} /> Выплатить (любой может запустить)
          </button>
        </section>
      )}
    </div>
  );
}
