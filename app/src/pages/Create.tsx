import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Address } from '@ton/core';
import { useTonAddress } from '@tonconnect/ui-react';
import {
  buildOnchainMetadata,
  contentSize,
  createTokenValue,
  designCurve,
  Limits,
  quoteBuy,
  tokenAddress,
  validateCurve,
  type CurveParams,
} from '@shared/protocol';
import { useConfig, useToast } from '../ctx';
import { useAw } from '../aw';
import { useSend } from '../tx';
import { loadCreationFactory, loadFactories, loadTokens } from '../lib/chain';
import { createTx, slippageMin } from '../lib/tx';
import { compressLogo, bytesToDataUrl } from '../lib/image';
import { compact, formatPrice, toNanoSafe, ton } from '../lib/format';
import { fmtAddress } from '../lib/config';
import { CurvePreview } from '../components/CurvePreview';
import { useReadOnly, WebOnly } from '../components/WebOnly';
import { WalletButton } from '../components/WalletButton';
import { IconUpload, IconGlobe, IconTelegram, IconX, IconShield, IconLock } from '../icons';
import type { FactoryState } from '@shared/protocol';

const SUPPLY_PRESETS = [1_000_000n, 100_000_000n, 1_000_000_000n, 10_000_000_000n];
const STEEPNESS = [
  { k: 3, label: 'Плавная', hint: 'цена ×9' },
  { k: 5, label: 'Средняя', hint: 'цена ×25' },
  { k: 10, label: 'Крутая', hint: 'цена ×100' },
];
const MAX_BUY = [0, 0.5, 1, 2, 5];

const isHttps = (s: string) => !s || /^https:\/\/[^\s]+\.[^\s]+$/i.test(s);

export function Create() {
  const cfg = useConfig();
  const aw = useAw();
  const toast = useToast();
  const send = useSend();
  const navigate = useNavigate();
  const me = useTonAddress(false);

  const [factory, setFactory] = useState<{ address: Address; state: FactoryState } | null>(null);
  const [loadingFactory, setLoadingFactory] = useState(true);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [logo, setLogo] = useState<Uint8Array | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [website, setWebsite] = useState('');
  const [telegram, setTelegram] = useState('');
  const [twitter, setTwitter] = useState('');
  const [supply, setSupply] = useState<bigint>(1_000_000_000n);
  const [startMcap, setStartMcap] = useState('1000');
  const [steep, setSteep] = useState(5);
  const [creatorFee, setCreatorFee] = useState(1);
  const [maxBuyPct, setMaxBuyPct] = useState(0);
  const [devBuy, setDevBuy] = useState('');
  const [busy, setBusy] = useState(false);
  const readOnly = useReadOnly();

  useEffect(() => {
    let alive = true;
    setLoadingFactory(true);
    loadCreationFactory(cfg)
      .then((value) => { if (alive) setFactory(value); })
      .catch(() => { if (alive) setFactory(null); })
      .finally(() => { if (alive) setLoadingFactory(false); });
    return () => { alive = false; };
  }, [cfg]);

  const curve: CurveParams | null = useMemo(() => {
    const m = Number(startMcap.replace(',', '.'));
    if (!Number.isFinite(m) || m <= 0) return null;
    try {
      return designCurve({ maxSupply: supply, startMcapTon: m, fillTon: m * steep, maxBuyPct: maxBuyPct || undefined });
    } catch {
      return null;
    }
  }, [supply, startMcap, steep, maxBuyPct]);

  const curveError = curve ? validateCurve(curve) : 'Укажите стартовую капитализацию';
  const devBuyNano = devBuy ? toNanoSafe(devBuy) : 0n;
  const fees = { creatorFeeBps: Math.round(creatorFee * 100), platformFeeBps: factory?.state.platformFeeBps ?? 0 };
  const devQuote = curve && devBuyNano ? quoteBuy(curve, fees, 0n, devBuyNano) : null;
  const devPct = devQuote && curve ? Number((devQuote.tokens * 10000n) / curve.maxSupply) / 100 : 0;

  const content = useMemo(
    () =>
      buildOnchainMetadata({
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description: description.trim(),
        decimals: '9',
        image_data: logo ? Buffer.from(logo) : undefined,
        image: imageUrl.trim(),
        website: website.trim(),
        telegram: telegram.trim(),
        twitter: twitter.trim(),
      }),
    [name, symbol, description, logo, imageUrl, website, telegram, twitter],
  );
  const size = contentSize(content);

  const errors: string[] = [];
  if (!name.trim()) errors.push('Введите название');
  if (!/^[A-Z0-9]{2,10}$/.test(symbol.trim().toUpperCase())) errors.push('Тикер: 2–10 латинских букв или цифр');
  if (![website, telegram, twitter, imageUrl].every(isHttps)) errors.push('Ссылки должны начинаться с https://');
  if (curveError) errors.push(curveError);
  if (devBuy && (devBuyNano === null || devBuyNano < Limits.MIN_TRADE)) errors.push('Первая покупка — от 0.01 TON');
  if (devQuote && curve && devQuote.tokens > curve.maxSupply) errors.push('Первая покупка больше всей эмиссии');
  if (devQuote && curve && curve.maxBuy && devQuote.tokens > curve.maxBuy) errors.push('Первая покупка превышает лимит на сделку');
  if (size.cells > Limits.MAX_CONTENT_CELLS || size.bits > Limits.MAX_CONTENT_BITS) errors.push('Слишком большие метаданные — уменьшите описание или логотип');
  if (!factory) errors.push(cfg.activeFactory ? 'Активная фабрика недоступна или закрыта для создания токенов' : 'Создание токенов отключено');

  const total = factory ? createTokenValue(factory.state.deployFee, devBuyNano ?? 0n) : 0n;

  const onLogo = async (f: File | undefined) => {
    if (!f) return;
    try {
      const { bytes } = await compressLogo(f);
      setLogo(bytes);
      aw.haptic('light');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const submit = async () => {
    if (errors.length || !factory || !curve) return;
    setBusy(true);
    try {
      const current = await loadCreationFactory(cfg);
      if (!current) { setFactory(null); toast('Активная фабрика недоступна или закрыта. Обновите настройки.', 'error'); return; }
      if (current.state.deployFee !== factory.state.deployFee || current.state.platformFeeBps !== factory.state.platformFeeBps) {
        setFactory(current); toast('Комиссии фабрики изменились. Проверьте их и повторите создание.', 'info'); return;
      }
      const before = current.state.nextIndex;
      const ok = await send(
        () =>
          createTx(
            factory.address,
            factory.state.deployFee,
            {
              creatorFeeBps: fees.creatorFeeBps,
              devBuy: devBuyNano ?? 0n,
              minOut: devQuote ? slippageMin(devQuote.tokens, 5) : 0n,
              curve,
              content,
            },
            cfg.isTestnet,
          ),
        {
          watch: factory.address,
          pending: 'Токен создаётся…',
          done: 'Токен создан!',
          onConfirmed: async () => {
            const [f] = (await loadFactories({ ...cfg, factories: [factory.address] })) ?? [];
            if (!f) return;
            const candidates: Address[] = [];
            for (let i = f.state.nextIndex - 1n; i >= before; i--) candidates.push(tokenAddress(f.address, i, f.state.tokenCode));
            await new Promise((r) => setTimeout(r, 4000)); // let the token's own transaction land
            const ts = await loadTokens(cfg, candidates, 0);
            const mine = ts.find((t) => me && t.state.creator.equals(Address.parse(me))) ?? ts[0];
            if (mine) navigate(`/t/${fmtAddress(mine.address, cfg.isTestnet)}`);
          },
        },
      );
      if (!ok) return;
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setBusy(false); }
  };

  if (readOnly) {
    return (
      <div className="page">
        <header className="topbar"><h1>Новый токен</h1></header>
        <WebOnly path="/create" what="Создание токенов" />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Новый токен</h1>
        <WalletButton />
      </header>
      {!loadingFactory && !factory && <div className="empty" role="status">
        <b>{cfg.activeFactory ? 'Создание токенов временно недоступно' : 'Создание новых токенов приостановлено'}</b>
        <p>Существующие токены остаются доступны для покупки, продажи и перевода.</p>
        <Link to="/">Открыть каталог</Link>
      </div>}

      <section className="card">
        <div className="logo-row">
          <label className="logo-drop">
            {logo ? <img src={bytesToDataUrl(logo) ?? ''} alt="Логотип" /> : <IconUpload size={30} />}
            <input type="file" accept="image/*" onChange={(e) => void onLogo(e.target.files?.[0])} hidden />
          </label>
          <div className="grow">
            <label className="field">
              <span>Название</span>
              <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Penguin Coin" />
            </label>
            <label className="field">
              <span>Тикер</span>
              <input
                value={symbol}
                maxLength={10}
                onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="PENG"
                autoCapitalize="characters"
              />
            </label>
          </div>
        </div>
        <p className="hint">Логотип сжимается на устройстве до {128}×{128} и хранится прямо в блокчейне — без серверов и IPFS{logo ? ` (${logo.length} байт)` : ''}.</p>
        <label className="field">
          <span>Описание</span>
          <textarea value={description} maxLength={300} rows={3} onChange={(e) => setDescription(e.target.value)} placeholder="О чём этот мем?" />
        </label>
        <details className="more">
          <summary>Ссылки и логотип по URL</summary>
          <label className="field -icon"><IconGlobe size={18} /><input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://сайт" inputMode="url" /></label>
          <label className="field -icon"><IconTelegram size={18} /><input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="https://t.me/…" inputMode="url" /></label>
          <label className="field -icon"><IconX size={18} /><input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="https://x.com/…" inputMode="url" /></label>
          <label className="field -icon"><IconUpload size={18} /><input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/logo.png (необязательно)" inputMode="url" /></label>
        </details>
      </section>

      <section className="card">
        <h2>Эмиссия и цена</h2>
        <div className="field"><span>Максимальная эмиссия</span></div>
        <div className="chips">
          {SUPPLY_PRESETS.map((s) => (
            <button key={s.toString()} className={supply === s ? 'chip -on' : 'chip'} onClick={() => setSupply(s)}>
              {compact(Number(s), 0)}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Стартовая капитализация, TON</span>
          <input value={startMcap} onChange={(e) => setStartMcap(e.target.value)} inputMode="decimal" />
        </label>
        <div className="field"><span>Крутизна кривой</span></div>
        <div className="chips">
          {STEEPNESS.map((s) => (
            <button key={s.k} className={steep === s.k ? 'chip -on' : 'chip'} onClick={() => setSteep(s.k)}>
              {s.label} <small>{s.hint}</small>
            </button>
          ))}
        </div>
        {curve && !curveError && (
          <>
            <CurvePreview curve={curve} devBuyPct={devPct} />
            <p className="hint">
              Стартовая цена {formatPrice(Number(curve.vt) / Number(curve.vj))} TON. Когда будет продана вся эмиссия, в резерве кривой окажется ≈{' '}
              {compact(Number(startMcap) * steep)} TON. Продать токены обратно кривой можно в любой момент.
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Правила токена</h2>
        <label className="field">
          <span>Комиссия автора с каждой сделки: <b>{creatorFee.toFixed(1)}%</b></span>
          <input type="range" min={0} max={5} step={0.1} value={creatorFee} onChange={(e) => setCreatorFee(Number(e.target.value))} />
        </label>
        <div className="field"><span>Лимит покупки за одну сделку (анти-снайпер)</span></div>
        <div className="chips">
          {MAX_BUY.map((p) => (
            <button key={p} className={maxBuyPct === p ? 'chip -on' : 'chip'} onClick={() => setMaxBuyPct(p)}>
              {p ? `${p}%` : 'Нет'}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Первая покупка автора, TON (необязательно)</span>
          <input value={devBuy} onChange={(e) => setDevBuy(e.target.value)} inputMode="decimal" placeholder="0" />
        </label>
        {devQuote && <p className="hint">Вы получите ≈ {compact(Number(devQuote.tokens) / 1e9)} {symbol || 'токенов'} ({devPct.toFixed(2)}% эмиссии) — все видят это на графике.</p>}
        <ul className="guarantees">
          <li><IconLock size={16} /> Нет админа и функции mint: новые токены появляются только при покупке у кривой.</li>
          <li><IconShield size={16} /> Параметры неизменяемы после запуска. Резерв кривой всегда покрывает продажу.</li>
        </ul>
      </section>

      <section className="card summary">
        <div className="kv"><span>Плата за создание</span><b>{factory ? ton(factory.state.deployFee, 3) : '…'}</b></div>
        <div className="kv"><span>Депозит хранения контракта</span><b>{ton(Limits.TOKEN_STORAGE_DEPOSIT, 2)}</b></div>
        <div className="kv"><span>Газ (излишек вернётся)</span><b>{ton(Limits.DEPLOY_GAS + (devBuyNano ? Limits.BUY_GAS : 0n), 2)}</b></div>
        {devBuyNano ? <div className="kv"><span>Первая покупка</span><b>{ton(devBuyNano, 3)}</b></div> : null}
        {factory && <div className="kv"><span>Комиссия платформы со сделок</span><b>{(factory.state.platformFeeBps / 100).toLocaleString('ru-RU')}%</b></div>}
        <div className="kv -total"><span>Итого к отправке</span><b>{ton(total, 3)}</b></div>
        {errors.length > 0 && <p className="form-error">{errors[0]}</p>}
        <button className="btn -wide -big" disabled={busy || errors.length > 0} onClick={() => void submit()}>
          {busy ? 'Ожидание кошелька…' : 'Создать токен'}
        </button>
        <p className="hint center">Создавая токен, вы подтверждаете, что не нарушаете чужие права и законы. Запрещены токены, выдающие себя за известные проекты, бренды или людей.</p>
      </section>
    </div>
  );
}
