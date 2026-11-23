import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { useAw } from './aw';
import { useConfig, useToast } from './ctx';
import { RiskGate, riskAccepted } from './components/RiskGate';
import { waitForChange } from './lib/chain';
import { getAccountState } from './lib/api';
import type { TcRequest } from './lib/tx';

interface SendOpts {
  /** account whose new transaction confirms the action */
  watch?: Address;
  pending?: string;
  done?: string;
  onConfirmed?: () => void;
}

type Send = (build: () => TcRequest, opts?: SendOpts) => Promise<boolean>;

const Ctx = createContext<Send>(async () => false);
export const useSend = () => useContext(Ctx);

export function TxProvider({ children }: { children: ReactNode }) {
  const [ui] = useTonConnectUI();
  const aw = useAw();
  const toast = useToast();
  const cfg = useConfig();
  const [gate, setGate] = useState(false);
  const gateResolve = useRef<((ok: boolean) => void) | null>(null);

  const ensureRisk = () =>
    riskAccepted()
      ? Promise.resolve(true)
      : new Promise<boolean>((resolve) => {
          gateResolve.current = resolve;
          setGate(true);
        });

  const send = useCallback<Send>(
    async (build, opts = {}) => {
      if (!(await ensureRisk())) return false;
      if (!ui.connected) {
        await ui.openModal();
        toast('Подключите TON-кошелёк, затем повторите действие', 'info');
        return false;
      }
      const network = cfg.isTestnet ? '-3' : '-239';
      if (ui.account?.chain !== network) {
        toast(`Переключите TON-кошелёк в ${cfg.floe.network} и подключите заново`, 'error');
        return false;
      }
      let req: TcRequest;
      try {
        req = build();
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'error');
        return false;
      }
      let prevLt: string | null = null;
      if (opts.watch) prevLt = (await getAccountState(opts.watch).catch(() => null))?.lastLt ?? null;
      try {
        aw.haptic('medium');
        toast('Подтвердите транзакцию в кошельке', 'info');
        await ui.sendTransaction({ ...req, network }, { modals: ['before', 'error'], notifications: [] });
      } catch (e) {
        aw.haptic('warning');
        const msg = e instanceof Error ? e.message : String(e);
        toast(/reject|declin|cancel/i.test(msg) ? 'Транзакция отклонена' : `Ошибка: ${msg}`, 'error');
        return false;
      }
      aw.haptic('success');
      toast(opts.pending ?? 'Транзакция отправлена, ждём подтверждения сети…', 'ok');
      if (opts.watch) {
        void waitForChange(opts.watch, prevLt).then((ok) => {
          if (ok) {
            toast(opts.done ?? 'Готово', 'ok');
            opts.onConfirmed?.();
          } else {
            toast('Сеть отвечает медленно — обновите страницу позже', 'info');
          }
        });
      }
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ui, aw, toast, cfg],
  );

  return (
    <Ctx.Provider value={send}>
      {children}
      {gate && (
        <RiskGate
          onAccept={() => {
            setGate(false);
            gateResolve.current?.(true);
          }}
          onCancel={() => {
            setGate(false);
            gateResolve.current?.(false);
          }}
        />
      )}
    </Ctx.Provider>
  );
}
