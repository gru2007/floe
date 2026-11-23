import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';

/**
 * TON Connect needs an absolute manifest URL that wallets can fetch.
 * APP_URL is set by the GitHub Pages workflow (https://<user>.github.io/<repo>/).
 */
function tonConnectManifest(): Plugin {
  const make = (url: string) =>
    JSON.stringify(
      {
        url,
        name: 'Floe',
        iconUrl: new URL('icons/icon-180.png', url).toString(),
        termsOfUseUrl: new URL('#/about', url).toString(),
        privacyPolicyUrl: new URL('#/about', url).toString(),
      },
      null,
      2,
    );
  return {
    name: 'tonconnect-manifest',
    configureServer(server) {
      server.middlewares.use('/tonconnect-manifest.json', (req, res) => {
        const host = req.headers.host ?? '127.0.0.1:5185';
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(make(`https://${host}/`));
      });
    },
    generateBundle() {
      let url = process.env.APP_URL || 'https://example.github.io/floe/';
      if (!url.endsWith('/')) url += '/';
      this.emitFile({ type: 'asset', fileName: 'tonconnect-manifest.json', source: make(url) });
    },
  };
}

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [react(), tonConnectManifest(), ...(command === 'serve' ? [basicSsl()] : [])],
  define: { global: 'globalThis' },
  resolve: {
    // shared/protocol.ts lives outside app/: make it use app's @ton/core copy
    dedupe: ['@ton/core', 'buffer'],
    alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) },
  },
  server: {
    host: '127.0.0.1',
    port: 5185,
    cors: true,
    fs: { allow: ['..'] },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
}));
