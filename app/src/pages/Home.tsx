import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Address } from '@ton/core';
import { useConfig, useToast } from '../ctx';
import { useAw } from '../aw';
import { listTokenAddresses, loadTokens, mcapOf, progressPct, type TokenInfo } from '../lib/chain';
import { TokenCard } from '../components/TokenCard';
import { WalletButton } from '../components/WalletButton';
import { FloeLogo, IconClock, IconFlame, IconPlus, IconQr, IconSearch, IconTarget } from '../icons';
import { fmtAddress } from '../lib/config';
import { SettingsLogo } from '../components/SettingsLogo';

type Tab = 'new' | 'top' | 'near';
const PAGE = 24;

export function Home() {
  const cfg = useConfig();
  const aw = useAw();
  const toast = useToast();
  const navigate = useNavigate();
  const [all, setAll] = useState<Address[] | null>(null);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('new');
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    listTokenAddresses(cfg)
      .then((a) => alive && setAll(a))
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, [cfg]);

  useEffect(() => {
    if (!all) return;
    let alive = true;
    setLoading(true);
    loadTokens(cfg, all.slice(0, shown))
      .then((t) => alive && setTokens(t))
      .catch((e) => alive && setError(String(e?.message ?? e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [all, shown, cfg]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let l = tokens.filter(
      (t) => !needle || t.meta.name?.toLowerCase().includes(needle) || t.meta.symbol?.toLowerCase().includes(needle),
    );
    if (tab === 'top') l = [...l].sort((a, b) => mcapOf(b.state) - mcapOf(a.state));
    if (tab === 'near') l = [...l].filter((t) => progressPct(t.state) < 100).sort((a, b) => progressPct(b.state) - progressPct(a.state));
    return l;
  }, [tokens, tab, q]);

  const king = useMemo(() => [...tokens].sort((a, b) => mcapOf(b.state) - mcapOf(a.state))[0], [tokens]);

  const openAddress = (raw: string) => {
    const s = raw.trim().replace(/^ton:\/\/transfer\//, '').split('?')[0];
    try {
      const a = Address.parse(s);
      navigate(`/t/${fmtAddress(a, cfg.isTestnet)}`);
      return true;
    } catch {
      return false;
    }
  };

  const scan = async () => {
    try {
      const v = await aw.scanQr();
      if (v && !openAddress(v)) toast('В QR-коде нет адреса TON', 'error');
    } catch (e) {
      toast(`Сканер недоступен: ${e instanceof Error ? e.message : e}`, 'error');
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <SettingsLogo size={34} />
          <div>
            <div className="brand-name">Floe</div>
            <div className="brand-sub">TON · {cfg.isTestnet ? 'testnet' : 'mainnet'}</div>
          </div>
        </div>
        <WalletButton />
      </header>

      <Link to="/create" className="hero">
        <div>
          <div className="hero-title">Запусти свой токен</div>
          <div className="hero-sub">Название, логотип, эмиссия и кривая цены — за минуту, без кода</div>
        </div>
        <span className="hero-cta"><IconPlus size={26} /></span>
      </Link>

      {king && (
        <Link to={`/t/${fmtAddress(king.address, cfg.isTestnet)}`} className="king">
          <span className="king-badge"><IconFlame size={16} /> Самый крупный</span>
          <span className="king-name">{king.meta.name} <b>${king.meta.symbol}</b></span>
        </Link>
      )}

      <div className="search">
        <IconSearch size={18} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q.trim().length > 40) openAddress(q);
          }}
          placeholder="Название, тикер или адрес"
          inputMode="search"
          autoCapitalize="off"
          spellCheck={false}
        />
        {aw.canScan && (
          <button className="icon-btn" onClick={() => void scan()} aria-label="Сканировать QR">
            <IconQr size={20} />
          </button>
        )}
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ['new', 'Новые', <IconClock size={16} key="i" />],
            ['top', 'Топ', <IconFlame size={16} key="i" />],
            ['near', 'К цели', <IconTarget size={16} key="i" />],
          ] as const
        ).map(([k, label, icon]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? 'tab -on' : 'tab'}
            onClick={() => {
              setTab(k);
              aw.haptic('select');
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {cfg.factories.length === 0 && (
        <div className="empty">
          <b>Запуск скоро</b>
          <p>В сети {cfg.floe.network} ещё не подключена фабрика токенов. Создание и торговля станут доступны после её запуска.</p>
        </div>
      )}
      {error && <div className="empty -error">Не удалось загрузить данные из блокчейна: {error}</div>}

      <div className="token-list">
        {list.map((t) => (
          <TokenCard key={t.address.toRawString()} t={t} />
        ))}
        {loading && Array.from({ length: 3 }, (_, i) => <div key={i} className="token-card skeleton" />)}
        {!loading && all && all.length === 0 && cfg.factories.length > 0 && (
          <div className="empty">
            <b>Пока ни одного токена</b>
            <p>Станьте первым — создайте свой мем-токен.</p>
          </div>
        )}
      </div>
      {all && shown < all.length && !loading && (
        <button className="btn -secondary -wide" onClick={() => setShown((s) => s + PAGE)}>
          Показать ещё
        </button>
      )}
    </div>
  );
}
