import { useMemo, useState } from 'react';
import type { ParsedMetadata } from '@shared/protocol';
import { bytesToDataUrl } from '../lib/image';

function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/** On-chain logo (image_data) → https image → generated fallback */
export function TokenAvatar({ meta, seed, size = 44 }: { meta: ParsedMetadata; seed: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = useMemo(() => {
    if (meta.image_data?.length) return bytesToDataUrl(meta.image_data);
    if (meta.image && /^https:\/\//i.test(meta.image)) return meta.image;
    return null;
  }, [meta.image_data, meta.image]);
  const letter = (meta.symbol || meta.name || '?').trim().charAt(0).toUpperCase();
  const h = hue(seed);
  if (src && !broken) {
    return (
      <img
        className="avatar"
        src={src}
        width={size}
        height={size}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="avatar -gen"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg, hsl(${h} 80% 60%), hsl(${(h + 50) % 360} 75% 42%))`,
      }}
    >
      {letter}
    </span>
  );
}
