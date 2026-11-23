// Logo is compressed on the device and stored ON-CHAIN (TEP-64 image_data),
// so no image hosting / IPFS pinning service is needed.

export const LOGO_SIZE = 128;
export const LOGO_MAX_BYTES = 9000;

function canvasToBytes(canvas: HTMLCanvasElement, type: string, q: number): Promise<Uint8Array | null> {
  return new Promise((resolve) =>
    canvas.toBlob(
      async (b) => {
        if (!b || b.type !== type) return resolve(null);
        resolve(new Uint8Array(await b.arrayBuffer()));
      },
      type,
      q,
    ),
  );
}

export async function compressLogo(file: File): Promise<{ bytes: Uint8Array; mime: string }> {
  if (!file.type.startsWith('image/')) throw new Error('Нужен файл изображения');
  if (file.size > 15 * 1024 * 1024) throw new Error('Файл больше 15 МБ');
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = LOGO_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, LOGO_SIZE, LOGO_SIZE);
  bmp.close?.();

  for (const type of ['image/webp', 'image/jpeg']) {
    for (const q of [0.86, 0.75, 0.62, 0.5, 0.38]) {
      const bytes = await canvasToBytes(canvas, type, q);
      if (bytes && bytes.length <= LOGO_MAX_BYTES) return { bytes, mime: type };
      if (!bytes) break; // type not supported by this browser
    }
  }
  throw new Error('Не удалось сжать картинку — попробуйте другую');
}

export function sniffMime(b: Uint8Array): string {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'image/webp';
  if (b[0] === 0x3c) return 'image/svg+xml';
  return 'application/octet-stream';
}

export function bytesToDataUrl(b: Uint8Array): string | null {
  const mime = sniffMime(b);
  if (mime === 'application/octet-stream') return null;
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return `data:${mime};base64,${btoa(s)}`;
}
