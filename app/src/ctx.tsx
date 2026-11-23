import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { AppConfig } from './lib/config';

export const ConfigCtx = createContext<AppConfig | null>(null);
export const useConfig = () => useContext(ConfigCtx)!;

type Tone = 'ok' | 'error' | 'info';
interface ToastItem {
  id: number;
  text: string;
  tone: Tone;
}
const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), tone === 'error' ? 6000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast -${t.tone}`} onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
