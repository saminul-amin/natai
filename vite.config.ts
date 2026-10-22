import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

// Writes precache-manifest.json listing every emitted file, so the service worker can cache the
// whole game on its first install and the PWA works offline after one visit (DESIGN.md 8.1).
function precacheManifest(): Plugin {
  return {
    name: 'natai-precache-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const publicFiles = [
        './',
        'index.html',
        'manifest.webmanifest',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable-512.png',
        'og-image.png',
      ];
      const version = Date.now().toString(36);
      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.json',
        source: JSON.stringify({ version, files: [...new Set([...publicFiles, ...files])] }),
      });
    },
  };
}

// Development only: the page can POST a captured frame to /__shot?name=… and it lands in
// test-results/dev-shots/, so frames from a hidden or headless browser can be inspected.
function devShots(): Plugin {
  return {
    name: 'natai-dev-shots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const name = (url.searchParams.get('name') ?? 'shot').replace(/[^a-z0-9_-]/gi, '');
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const dir = path.resolve('test-results/dev-shots');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  // Relative base so the same build works at a GitHub Pages project path or any static host.
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
  },
  plugins: [precacheManifest(), devShots()],
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    // Several specs simulate whole duels or days at 120 Hz; slower CI runners need more than the 5 s default.
    testTimeout: 30_000,
  },
});
