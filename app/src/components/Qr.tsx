import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function Qr({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: 'M' })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [value, size]);
  return src ? <img className="qr" src={src} width={size} height={size} alt="QR" /> : <div className="qr skeleton" style={{ width: size, height: size }} />;
}
