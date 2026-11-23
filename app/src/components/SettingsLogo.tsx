import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FloeLogo } from '../icons';

export function SettingsLogo({ size }: { size: number }) {
  const taps = useRef({ count: 0, last: 0 });
  const navigate = useNavigate();
  return <button type="button" className="settings-logo" aria-label="Floe" onClick={() => {
    const now = Date.now();
    taps.current.count = now - taps.current.last < 1500 ? taps.current.count + 1 : 1;
    taps.current.last = now;
    if (taps.current.count >= 7) { taps.current.count = 0; navigate('/settings'); }
  }}><FloeLogo size={size} /></button>;
}
