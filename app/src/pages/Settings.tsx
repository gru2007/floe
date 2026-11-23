import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Address } from '@ton/core';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { useConfig, useToast } from '../ctx';
import { readNetworkSettings, resetNetworkSettings, saveNetworkSettings, type Network } from '../lib/network-settings';

export function Settings() {
  const cfg = useConfig();
  const toast = useToast();
  const [ui] = useTonConnectUI();
  const [network, setNetwork] = useState<Network>(cfg.floe.network);
  const [addresses, setAddresses] = useState(() => {
    const local = readNetworkSettings();
    return Object.fromEntries((['testnet', 'mainnet'] as const).map((n) => [n,
      (local.factories?.[n] ?? cfg.floe.networks?.[n]?.factories ?? (cfg.floe.network === n ? cfg.floe.factories : [])).join('\n'),
    ])) as Record<Network, string>;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const apply = async (reset = false) => {
    setError('');
    try {
      const factories: Partial<Record<Network, string[]>> = {};
      if (!reset) for (const n of ['testnet', 'mainnet'] as const) {
        factories[n] = [...new Set(addresses[n].split(/[\s,;]+/).filter(Boolean).map((a) => {
          try {
            if (Address.isFriendly(a) && Address.parseFriendly(a).isTestOnly && n === 'mainnet') {
              throw new Error('testnet');
            }
            return Address.parse(a).toString({ testOnly: n === 'testnet', bounceable: true });
          } catch { throw new Error(`Некорректный адрес фабрики для ${n}: ${a}`); }
        }))];
      }
      setBusy(true);
      // Disconnect before reload so a restored session cannot silently keep the old chain.
      if (ui.connected) await ui.disconnect();
      if (reset) resetNetworkSettings();
      else saveNetworkSettings({ network, factories });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return <div className="page settings-page">
    <header><h1>Настройки сети</h1><p className="muted">Скрытый экран · действует только на этом устройстве</p></header>
    <section className="card">
      <h2>Сеть TON</h2>
      <div className="settings-networks" role="group" aria-label="Сеть TON">
        {(['testnet', 'mainnet'] as const).map((n) => <button key={n} type="button" className={`btn ${network === n ? '' : '-secondary'}`} aria-pressed={network === n} onClick={() => setNetwork(n)}>{n === 'testnet' ? 'Testnet' : 'Mainnet'}</button>)}
      </div>
      <p className="muted">{network === 'testnet' ? 'Тестовая сеть. Нужны тестовые TON.' : 'Основная сеть. Операции используют настоящие TON.'}</p>
      {(['testnet', 'mainnet'] as const).map((n) => <label className="field" key={n}>
        <span>Фабрики {n} · по одному адресу в строке</span>
        <textarea aria-label={`Фабрики ${n}`} value={addresses[n]} onChange={(e) => setAddresses({ ...addresses, [n]: e.target.value })} rows={3} placeholder="Адрес после развёртывания Factory" spellCheck={false} autoCapitalize="off" />
      </label>)}
      {error && <p role="alert" className="down">{error}</p>}
      <p className="muted">При сохранении кошелёк отключится, а приложение перезагрузится. Подключите кошелёк в выбранной сети.</p>
      <button type="button" className="btn -wide" disabled={busy} onClick={() => void apply()}>Сохранить и перезагрузить</button>
      <button type="button" className="btn -secondary -wide" disabled={busy} onClick={() => void apply(true)}>Вернуть настройки сайта</button>
    </section>
    <section className="card">
      <h2>Что развернуть</h2>
      <p>Один контракт <b>Factory</b> отдельно для testnet и mainnet. Код Token и JettonWallet включается в фабрику при сборке. Токены и кошельки держателей создаются автоматически.</p>
      <p>После развёртывания вставьте адрес в поле нужной сети. Для всех пользователей адреса задаются в конфигурации сайта.</p>
      <button type="button" className="btn -secondary -wide" onClick={() => void navigator.clipboard?.writeText(`npx blueprint run deployFactory --${network} --tonconnect`).then(() => toast('Команда скопирована', 'ok'))}>Скопировать команду для {network}</button>
      <p className="muted">Этот экран доступен по ссылке и не является защитой доступа. Здесь нет секретов или ключей кошелька.</p>
    </section>
    <Link className="btn -secondary -wide" to="/">На главную</Link>
  </div>;
}
