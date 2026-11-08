import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Where the RuneLite plugin writes its export. Override with MAXHIT_DIR if your .runelite lives elsewhere.
const EXPORT_DIR = process.env.MAXHIT_DIR ?? path.join(os.homedir(), '.runelite', 'maxhit');
const ENGINE = path.resolve(__dirname, 'engine');
// The wiki asks API users for a descriptive User-Agent.
const USER_AGENT = process.env.MAXHIT_UA ?? 'maxhit (personal RuneLite companion tool)';
const PRICE_TTL_MS = 5 * 60 * 1000;

function newestExport(account?: string | null): string | null {
  if (!fs.existsSync(EXPORT_DIR)) return null;
  const files = fs.readdirSync(EXPORT_DIR).filter((f) => f.endsWith('.json'));
  if (account) return files.includes(`${account}.json`) ? path.join(EXPORT_DIR, `${account}.json`) : null;
  let best: string | null = null; let bestM = 0;
  for (const f of files) {
    const p = path.join(EXPORT_DIR, f);
    const m = fs.statSync(p).mtimeMs;
    if (m > bestM) { bestM = m; best = p; }
  }
  return best;
}

function localApi(): Plugin {
  let priceCache: { at: number; body: string } | null = null;
  const sse = new Set<import('node:http').ServerResponse>();

  return {
    name: 'maxhit-local-api',
    configureServer(server) {
      // Push "state changed" to the page whenever the plugin rewrites its export
      try {
        fs.mkdirSync(EXPORT_DIR, { recursive: true });
        let t: NodeJS.Timeout | undefined;
        fs.watch(EXPORT_DIR, () => {
          clearTimeout(t);
          t = setTimeout(() => { for (const res of sse) res.write('data: changed\n\n'); }, 200);
        });
      } catch (e) {
        server.config.logger.warn(`[maxhit] cannot watch ${EXPORT_DIR}: ${e}`);
      }

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://local');
        try {
          if (url.pathname === '/api/state') {
            const file = newestExport(url.searchParams.get('account'));
            if (!file) { res.statusCode = 404; res.end(JSON.stringify({ error: `no export in ${EXPORT_DIR}` })); return; }
            res.setHeader('content-type', 'application/json');
            res.end(fs.readFileSync(file));
            return;
          }
          if (url.pathname === '/api/state/events') {
            res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
            res.write('data: hello\n\n');
            sse.add(res);
            req.on('close', () => sse.delete(res));
            return;
          }
          if (url.pathname === '/api/prices' && process.env.MAXHIT_PRICES_FILE) {
            // offline/testing: serve a saved copy of the wiki's /latest response
            res.setHeader('content-type', 'application/json');
            res.end(fs.readFileSync(process.env.MAXHIT_PRICES_FILE));
            return;
          }
          if (url.pathname === '/api/prices') {
            if (!priceCache || Date.now() - priceCache.at > PRICE_TTL_MS) {
              const r = await fetch('https://prices.runescape.wiki/api/v1/osrs/latest', { headers: { 'User-Agent': USER_AGENT } });
              if (!r.ok) throw new Error(`prices API ${r.status}`);
              priceCache = { at: Date.now(), body: await r.text() };
            }
            res.setHeader('content-type', 'application/json');
            res.setHeader('x-fetched-at', String(priceCache.at));
            res.end(priceCache.body);
            return;
          }
          if (url.pathname.startsWith('/img/')) {
            const rel = decodeURIComponent(url.pathname.slice(5));
            const p = path.join(ENGINE, 'cdn', rel);
            if (!p.startsWith(path.join(ENGINE, 'cdn')) || !fs.existsSync(p)) { res.statusCode = 404; res.end(); return; }
            res.setHeader('content-type', 'image/png');
            res.setHeader('cache-control', 'max-age=86400');
            res.end(fs.readFileSync(p));
            return;
          }
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: String(e) }));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // `npm run dev:offline` serves ./prices.json instead of calling the wiki API
  if (mode === 'offline' && !process.env.MAXHIT_PRICES_FILE) process.env.MAXHIT_PRICES_FILE = path.resolve(__dirname, 'prices.json');
  return {
  plugins: [react(), localApi()],
  resolve: {
    alias: { '@': path.join(ENGINE, 'src') },
    preserveSymlinks: true,
  },
  // the engine imports Next's StaticImageData type; nothing at runtime needs Next
  define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development') },
  worker: { format: 'es' },
  server: { port: 5173, fs: { allow: [__dirname, ENGINE] } },
  };
});
