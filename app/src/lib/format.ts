const SUB = '₀₁₂₃₄₅₆₇₈₉';

/** 0.000001234 -> 0.0₅1234 (compact notation common for memecoin prices) */
export function formatPrice(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '0';
  if (v >= 1000) return v.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
  if (v >= 1) return v.toLocaleString('ru-RU', { maximumFractionDigits: 4 });
  if (v >= 0.001) return v.toLocaleString('ru-RU', { maximumFractionDigits: 6 });
  const exp = Math.floor(Math.log10(v));
  const zeros = -exp - 1;
  const digits = Math.round(v * 10 ** (-exp + 3)).toString().slice(0, 4).replace(/0+$/, '') || '0';
  const sub = String(zeros).split('').map((d) => SUB[Number(d)]).join('');
  return `0,0${sub}${digits}`;
}

export function compact(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const units: [number, string][] = [
    [1e12, ' трлн'],
    [1e9, ' млрд'],
    [1e6, ' млн'],
    [1e3, ' тыс'],
  ];
  for (const [n, s] of units) if (abs >= n) return (v / n).toLocaleString('ru-RU', { maximumFractionDigits: digits }) + s;
  return v.toLocaleString('ru-RU', { maximumFractionDigits: abs < 1 ? 4 : digits });
}

/** nano units -> number */
export const fromNano = (v: bigint | string): number => Number(BigInt(v)) / 1e9;

/** "1,5" / "1.5" -> 1500000000n; null if invalid */
export function toNanoSafe(s: string): bigint | null {
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (!/^\d*(\.\d{0,9})?$/.test(t) || t === '' || t === '.') return null;
  const [i, f = ''] = t.split('.');
  return BigInt(i || '0') * 1_000_000_000n + BigInt((f + '000000000').slice(0, 9));
}

export function nanoToInput(v: bigint, maxFrac = 4): string {
  const i = v / 1_000_000_000n;
  const f = (v % 1_000_000_000n).toString().padStart(9, '0').slice(0, maxFrac).replace(/0+$/, '');
  return f ? `${i}.${f}` : `${i}`;
}

export const ton = (v: bigint | string | number, digits = 2) =>
  `${compact(typeof v === 'number' ? v : fromNano(v), digits)} TON`;

export function shortAddr(s: string): string {
  return s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

export function ago(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s} с`;
  if (s < 3600) return `${Math.floor(s / 60)} мин`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч`;
  return `${Math.floor(s / 86400)} д`;
}
