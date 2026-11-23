import { spotPrice, type CurveParams } from '@shared/protocol';
import { formatPrice } from '../lib/format';

/** Price vs. sold supply for the creator's curve (SVG, no chart lib). */
export function CurvePreview({ curve, devBuyPct }: { curve: CurveParams; devBuyPct?: number }) {
  const W = 320;
  const H = 120;
  const N = 48;
  const pts: [number, number][] = [];
  const p0 = spotPrice(curve, 0n);
  const p1 = spotPrice(curve, curve.maxSupply);
  for (let i = 0; i <= N; i++) {
    const s = (curve.maxSupply * BigInt(i)) / BigInt(N);
    const p = spotPrice(curve, s);
    // log scale keeps the start of the curve visible
    const y = Math.log(p / p0) / Math.log(p1 / p0 || 2);
    pts.push([(i / N) * W, H - 8 - y * (H - 16)]);
  }
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const devX = devBuyPct ? (Math.min(100, devBuyPct) / 100) * W : 0;
  return (
    <figure className="curve">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Кривая цены">
        <defs>
          <linearGradient id="cv-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".35" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#cv-fill)" />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        {devX > 0 && <rect x="0" y="0" width={devX} height={H} fill="var(--warn)" opacity=".12" />}
      </svg>
      <figcaption>
        <span>старт {formatPrice(p0)} TON</span>
        <span>×{(p1 / p0).toFixed(1)} к финалу</span>
        <span>финал {formatPrice(p1)} TON</span>
      </figcaption>
    </figure>
  );
}
