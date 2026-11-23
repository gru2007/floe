import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { THEME, TonConnectUIProvider } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { AwProvider, useAw } from './aw';
import { ConfigCtx, ToastProvider } from './ctx';
import { TxProvider } from './tx';
import { loadConfig, fmtAddress, type AppConfig } from './lib/config';
import { initApi } from './lib/api';
import { Home } from './pages/Home';
import { Create } from './pages/Create';
import { TokenPage } from './pages/TokenPage';
import { Portfolio } from './pages/Portfolio';
import { About } from './pages/About';
import { Settings } from './pages/Settings';
import { FloeLogo, IconHome, IconInfo, IconPlus, IconWallet } from './icons';

/** start_param "t_<address>" opens a token (deep links shared from the app) */
function StartParamRouter({ cfg }: { cfg: AppConfig }) {
  const aw = useAw();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (done || !aw.ready) return;
    setDone(true);
    const p = aw.startParam;
    if (p?.startsWith('t_')) {
      try {
        navigate(`/t/${fmtAddress(Address.parse(p.slice(2)), cfg.isTestnet)}`, { replace: true });
      } catch {
        /* ignore bad param */
      }
    } else if (p === 'create') navigate('/create');
  }, [aw.ready, aw.startParam, done, navigate, cfg.isTestnet]);
  return null;
}

function Shell({ cfg }: { cfg: AppConfig }) {
  const aw = useAw();
  const manifestUrl = new URL('tonconnect-manifest.json', cfg.appUrl).toString();
  return (
    <TonConnectUIProvider
      manifestUrl={manifestUrl}
      language="ru"
      uiPreferences={{ theme: aw.scheme === 'dark' ? THEME.DARK : THEME.LIGHT }}
      actionsConfiguration={{ returnStrategy: 'back' }}
    >
      <ToastProvider>
        <TxProvider>
          <StartParamRouter cfg={cfg} />
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/create" element={<Create />} />
              <Route path="/t/:address" element={<TokenPage />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/about" element={<About />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <nav className="tabbar">
            <NavLink to="/" end onClick={() => aw.haptic('select')}><IconHome /><span>Главная</span></NavLink>
            <NavLink to="/create" onClick={() => aw.haptic('select')}><IconPlus /><span>Создать</span></NavLink>
            <NavLink to="/portfolio" onClick={() => aw.haptic('select')}><IconWallet /><span>Портфель</span></NavLink>
            <NavLink to="/about" onClick={() => aw.haptic('select')}><IconInfo /><span>Инфо</span></NavLink>
          </nav>
        </TxProvider>
      </ToastProvider>
    </TonConnectUIProvider>
  );
}

export function App() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    loadConfig()
      .then((c) => {
        initApi(c.isTestnet, c.floe.toncenterApiKey, c.floe.toncenterUrl);
        setCfg(c);
      })
      .catch((e) => setErr(String(e)));
  }, []);
  if (err) return <div className="splash"><FloeLogo size={64} /><p>Не удалось загрузить конфигурацию: {err}</p></div>;
  if (!cfg) return <div className="splash"><FloeLogo size={64} /></div>;
  return (
    <ConfigCtx.Provider value={cfg}>
      <HashRouter>
        <AwProvider config={cfg}>
          <Shell cfg={cfg} />
        </AwProvider>
      </HashRouter>
    </ConfigCtx.Provider>
  );
}
