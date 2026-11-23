// Renders public/icon.svg into every icon the app, the wallet catalogue,
// TON Connect, PWA and link previews need.  Run: npm run icons
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const pub = new URL('../public/', import.meta.url);
const svg = readFileSync(new URL('icon.svg', pub), 'utf8');
mkdirSync(new URL('icons/', pub), { recursive: true });

const render = (src, width) => new Resvg(src, { fitTo: { mode: 'width', value: width } }).render().asPng();

const sizes = [16, 32, 48, 64, 96, 128, 180, 192, 256, 512, 1024];
const pngs = {};
for (const s of sizes) {
  pngs[s] = render(svg, s);
  writeFileSync(new URL(`icons/icon-${s}.png`, pub), pngs[s]);
}

// maskable: full-bleed background with the artwork inside the 80% safe zone
const inner = svg.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">', '').replace('</svg>', '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1450c8"/><g transform="translate(51.2 51.2) scale(.8)">${inner}</g></svg>`;
writeFileSync(new URL('icons/icon-maskable-512.png', pub), render(maskable, 512));

// favicon.ico with embedded PNGs (16, 32, 48)
const icoSizes = [16, 32, 48];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = 6 + 16 * icoSizes.length;
const entries = [];
for (const s of icoSizes) {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[s].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[s].length;
  entries.push(e);
}
writeFileSync(new URL('favicon.ico', pub), Buffer.concat([header, ...entries, ...icoSizes.map((s) => pngs[s])]));

// Open Graph preview 1200×630
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1a33"/><stop offset="1" stop-color="#123a80"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <g transform="translate(90 155) scale(.625)">${inner}</g>
  <text x="470" y="290" font-family="Inter, Helvetica, Arial, sans-serif" font-size="110" font-weight="800" fill="#ffffff">Floe</text>
  <text x="474" y="360" font-family="Inter, Helvetica, Arial, sans-serif" font-size="40" fill="#9cc4ff">Мем-токены на TON</text>
  <text x="474" y="420" font-family="Inter, Helvetica, Arial, sans-serif" font-size="30" fill="#7dffb0">создать · торговать · графики</text>
</svg>`;
writeFileSync(new URL('og.png', pub), new Resvg(og, { font: { loadSystemFonts: true } }).render().asPng());

console.log('icons written:', sizes.map((s) => `icon-${s}.png`).join(', '), '+ maskable, favicon.ico, og.png');
