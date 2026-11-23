import { useState } from 'react';
import { TonConnectButton, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { useAw } from '../aw';
import { Qr } from './Qr';
import { IconClose, IconCopy, IconShare } from '../icons';
import { useToast } from '../ctx';

interface RemoteWallet {
  name: string;
  imageUrl: string;
  universalLink: string;
  bridgeUrl: string;
}

/**
 * Inside the Antarctic Wallet WebView the TON Connect modal may not be able to open an
 * external wallet app (window.open / deep links are up to the host). As a fallback we
 * build the TON Connect link ourselves and offer: QR (scan with another phone),
 * copy, and the wallet's own share sheet (sdk.shareUrl) to hand the link to Tonkeeper.
 */
export function WalletButton() {
  const wallet = useTonWallet();
  const aw = useAw();
  const [open, setOpen] = useState(false);
  return (
    <div className="wallet-btn">
      <TonConnectButton />
      {!wallet && aw.inside && (
        <button className="link-btn" type="button" onClick={() => setOpen(true)}>
          Кошелёк не открывается?
        </button>
      )}
      {open && <ConnectFallback onClose={() => setOpen(false)} />}
    </div>
  );
}

function ConnectFallback({ onClose }: { onClose: () => void }) {
  const [ui] = useTonConnectUI();
  const aw = useAw();
  const toast = useToast();
  const [wallets, setWallets] = useState<RemoteWallet[] | null>(null);
  const [link, setLink] = useState<{ w: RemoteWallet; url: string } | null>(null);

  if (wallets === null) {
    void ui.getWallets().then((ws) =>
      setWallets(
        ws
          .filter((w): w is typeof w & RemoteWallet => 'universalLink' in w && 'bridgeUrl' in w && !!(w as any).bridgeUrl)
          .slice(0, 6) as RemoteWallet[],
      ),
    );
  }

  const pick = (w: RemoteWallet) => {
    const url = ui.connector.connect({ universalLink: w.universalLink, bridgeUrl: w.bridgeUrl }) as unknown as string;
    setLink({ w, url });
    aw.haptic('light');
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="sheet-close" onClick={onClose} aria-label="Закрыть"><IconClose /></button>
        {!link ? (
          <>
            <h3>Подключение кошелька</h3>
            <p className="muted">Выберите TON-кошелёк. Мы покажем ссылку подключения: её можно открыть в кошельке, отсканировать с другого телефона или переслать.</p>
            <div className="wallet-list">
              {(wallets ?? []).map((w) => (
                <button key={w.name} className="wallet-item" onClick={() => pick(w)}>
                  <img src={w.imageUrl} alt="" width={40} height={40} />
                  <span>{w.name}</span>
                </button>
              ))}
              {!wallets && <div className="skeleton" style={{ height: 120 }} />}
            </div>
          </>
        ) : (
          <>
            <h3>{link.w.name}</h3>
            <Qr value={link.url} />
            <p className="muted small">Ссылка одноразовая. После подтверждения в кошельке вернитесь сюда — подключение произойдёт автоматически.</p>
            <div className="row gap">
              <button className="btn -secondary" onClick={() => void navigator.clipboard?.writeText(link.url).then(() => toast('Ссылка скопирована', 'ok'))}>
                <IconCopy size={18} /> Копировать
              </button>
              <button className="btn" onClick={() => void aw.share(link.url, 'Подключить кошелёк к Floe')}>
                <IconShare size={18} /> Открыть / поделиться
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
