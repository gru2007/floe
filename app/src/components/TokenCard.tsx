import { Link } from 'react-router-dom';
import { TokenAvatar } from './TokenAvatar';
import { mcapOf, progressPct, type TokenInfo } from '../lib/chain';
import { ago, compact } from '../lib/format';
import { fmtAddress } from '../lib/config';
import { useConfig } from '../ctx';

export function TokenCard({ t }: { t: TokenInfo }) {
  const cfg = useConfig();
  const addr = fmtAddress(t.address, cfg.isTestnet);
  const pct = progressPct(t.state);
  return (
    <Link to={`/t/${addr}`} className="token-card">
      <TokenAvatar meta={t.meta} seed={addr} />
      <div className="tc-body">
        <div className="tc-top">
          <span className="tc-name">{t.meta.name || 'Без названия'}</span>
          <span className="tc-sym">${t.meta.symbol || '???'}</span>
        </div>
        <div className="tc-meta">
          <span>кап. {compact(mcapOf(t.state))} TON</span>
          <span className="dotsep">·</span>
          <span>{ago(t.state.createdAt)}</span>
        </div>
        <div className="progress" aria-label={`Распродано ${pct.toFixed(1)}%`}>
          <span style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
      </div>
      <div className="tc-pct">{pct.toFixed(pct < 10 ? 1 : 0)}%</div>
    </Link>
  );
}
