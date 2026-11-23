import { useConfig } from '../ctx';
import { useAw } from '../aw';
import { IconExternal } from '../icons';

/** true when the operator chose catalogue-only mode for the Antarctic Wallet build */
export function useReadOnly(): boolean {
  const cfg = useConfig();
  const aw = useAw();
  return aw.inside && cfg.floe.awMode === 'readonly';
}

export function WebOnly({ path, what }: { path: string; what: string }) {
  const cfg = useConfig();
  const aw = useAw();
  const url = `${cfg.appUrl}#${path}`;
  return (
    <section className="card center">
      <p className="muted">{what} доступно в веб-версии Floe с вашим TON-кошельком.</p>
      <button className="btn -wide" onClick={() => void aw.share(url, 'Floe')}>
        <IconExternal size={18} /> Открыть в браузере
      </button>
    </section>
  );
}
