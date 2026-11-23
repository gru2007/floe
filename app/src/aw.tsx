// Antarctic Wallet SDK integration (serverless).
//
// Floe asks the wallet for NO scopes: no user data, no balance, no `pay`.
// Payment intents need a partner backend with a secret, and Floe has no backend
// by design — all value moves on-chain and is signed in the user's TON wallet.
// From the SDK we use: handshake, startParam (deep links to a token), back button,
// theme / language / safe area, background colour, haptics, QR scanner and sharing.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AWCommand, AWScanQrError, AWSDK } from '@antarctic-wallet/aw-sdk';
import type { AppConfig } from './lib/config';

type Haptic = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'select';

export interface AwApi {
  inside: boolean;
  ready: boolean;
  scheme: 'light' | 'dark';
  startParam: string | null;
  canScan: boolean;
  haptic: (h: Haptic) => void;
  scanQr: () => Promise<string | null>;
  share: (url: string, title?: string) => Promise<void>;
}

const Ctx = createContext<AwApi | null>(null);
export const useAw = () => useContext(Ctx)!;

function parentOrigin(): string {
  const q = new URLSearchParams(window.location.search).get('parentOrigin');
  if (q) return q;
  if (window.parent !== window && document.referrer) {
    try {
      return new URL(document.referrer).origin;
    } catch {
      /* ignore */
    }
  }
  return 'https://localhost:3310';
}

const systemScheme = (): 'light' | 'dark' =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const BG = { light: '#f3f6fb', dark: '#0b1a33' };

export function AwProvider({ config, children }: { config: AppConfig; children: ReactNode }) {
  const inside = AWSDK.isInsideWallet();
  const sdkRef = useRef<AWSDK | null>(null);
  const [ready, setReady] = useState(false);
  const [scheme, setScheme] = useState<'light' | 'dark'>(systemScheme());
  const [startParam, setStartParam] = useState<string | null>(null);
  const [canScan, setCanScan] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // one SDK instance for the whole app
  useEffect(() => {
    if (!inside) {
      const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
      const on = () => setScheme(systemScheme());
      mq?.addEventListener?.('change', on);
      return () => mq?.removeEventListener?.('change', on);
    }
    const sdk = new AWSDK({ appId: config.aw.id, scopes: [], parentOrigin: parentOrigin(), persistSession: false });
    sdkRef.current = sdk;
    if (sdk.colorScheme) setScheme(sdk.colorScheme);

    const applyTheme = () => {
      const s = sdk.colorScheme ?? systemScheme();
      setScheme(s);
      sdk.setBackgroundColor(BG[s]);
    };
    sdk.events.on('themeChanged', applyTheme);
    sdk.events.on('sdk.ready', () => {
      setReady(true);
      setStartParam(sdk.startParam);
      setCanScan(sdk.isCommandAvailable(AWCommand.OpenScanQr));
      applyTheme();
    });
    sdk.events.on('sdk.error', ({ message }) => console.warn('[aw] sdk.error', message));
    sdk.events.on('session.expired', () => {
      void sdk.init().catch(() => undefined);
    });
    sdk.backButton.onClick(() => {
      if (window.history.length > 1) navigate(-1);
      else navigate('/');
    });

    void sdk.init().catch((e) => console.warn('[aw] init failed', e));
    return () => {
      try {
        sdk.backButton.hide();
      } catch {
        /* channel may be closed */
      }
      sdk.destroy();
      sdkRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // host back arrow on nested screens, "Close" on the root
  useEffect(() => {
    const sdk = sdkRef.current;
    if (!sdk) return;
    try {
      if (location.pathname === '/') sdk.backButton.hide();
      else sdk.backButton.show();
    } catch {
      /* ignore */
    }
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.dataset.theme = scheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BG[scheme]);
  }, [scheme]);

  const api = useMemo<AwApi>(
    () => ({
      inside,
      ready,
      scheme,
      startParam,
      canScan,
      haptic: (h) => {
        const hf = sdkRef.current?.hapticFeedback;
        if (hf) {
          if (h === 'select') hf.selectionChanged();
          else if (h === 'success' || h === 'warning' || h === 'error') hf.notificationOccurred(h);
          else hf.impactOccurred(h);
        } else if (h !== 'select') {
          navigator.vibrate?.(h === 'error' ? [30, 40, 30] : 15);
        }
      },
      scanQr: async () => {
        const sdk = sdkRef.current;
        if (!sdk || !canScan) return null;
        try {
          return await sdk.scanQr();
        } catch (e) {
          if (e instanceof AWScanQrError && e.errorCode === 'closed') return null;
          throw e;
        }
      },
      share: async (url, title) => {
        // sdk.shareUrl exists from aw-sdk 0.4.5; older builds fall back to Web Share / clipboard
        const sdk = sdkRef.current as (AWSDK & { shareUrl?: (p: { url: string; title?: string }) => Promise<boolean> }) | null;
        if (sdk?.shareUrl) {
          try {
            await sdk.shareUrl({ url, title });
            return;
          } catch {
            /* fall through */
          }
        }
        if (navigator.share) {
          try {
            await navigator.share({ url, title });
            return;
          } catch {
            /* cancelled */
          }
        }
        await navigator.clipboard?.writeText(url);
      },
    }),
    [inside, ready, scheme, startParam, canScan],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
