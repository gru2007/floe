import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Address } from '@ton/core';
import { useTonAddress } from '@tonconnect/ui-react';
import { quoteSell } from '@shared/protocol';
import { useConfig } from '../ctx';
import { curveOf, portfolio, tonBalance, type TokenInfo } from '../lib/chain';
import { compact, fromNano, ton } from '../lib/format';
import { fmtAddress } from '../lib/config';
import { TokenAvatar } from '../components/TokenAvatar';
import { WalletButton } from '../components/WalletButton';

export function Portfolio() {
  const cfg = useConfig();
  const me = useTonAddress(false);
  const owner = useMemo(() => (me ? Address.parse(me) : null), [me]);
  const [rows, setRows] = useState<{ token: TokenInfo; balance: bigint }[] | null>(null);
  const [tonBal, setTonBal] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!owner) return;
    let alive = true;
    setRows(null);
    void tonBalance(owner).then((b) => alive && setTonBal(b)).catch(() => undefined);
    portfolio(cfg, owner)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, [owner, cfg]);

  const valued = (rows ?? []).map((r) => {
    const s = r.token.state;
    const v = quoteSell(curveOf(s), s, s.supply, s.reserve, r.balance).ton;
    return { ...r, value: v };
  });
  const total = valued.reduce((a, r) => a + r.value, 0n);

  return (
    <div className="page">
      <header className="topbar">
        <h1>Портфель</h1>
        <WalletButton />
      </header>
      {!owner ? (
        <div className="empty">
          <b>Кошелёк не подключён</b>
          <p>Подключите TON-кошелёк, чтобы увидеть свои токены Floe.</p>
        </div>
      ) : (
        <>
          <section className="card summary">
            <div className="kv"><span>TON на кошельке</span><b>{tonBal === null ? '…' : ton(tonBal, 3)}</b></div>
            <div className="kv"><span>Токены Floe (если продать сейчас)</span><b>{rows === null ? '…' : ton(total, 3)}</b></div>
          </section>
          {error && <div className="empty -error">{error}</div>}
          <div className="token-list">
            {rows === null && !error && Array.from({ length: 2 }, (_, i) => <div key={i} className="token-card skeleton" />)}
            {rows?.length === 0 && (
              <div className="empty">
                <b>Пока пусто</b>
                <p>Купите токен на главной или создайте свой.</p>
              </div>
            )}
            {valued.map((r) => {
              const a = fmtAddress(r.token.address, cfg.isTestnet);
              return (
                <Link key={a} to={`/t/${a}`} className="token-card">
                  <TokenAvatar meta={r.token.meta} seed={a} />
                  <div className="tc-body">
                    <div className="tc-top">
                      <span className="tc-name">{r.token.meta.name}</span>
                      <span className="tc-sym">${r.token.meta.symbol}</span>
                    </div>
                    <div className="tc-meta">{compact(fromNano(r.balance))} {r.token.meta.symbol}</div>
                  </div>
                  <div className="tc-pct">{compact(fromNano(r.value), 3)} TON</div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
