import { defineConfig, Plugin } from 'vite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

/** Dev-only endpoint: the dev panel's "Save look to rosters.json" writes a player's appearance into the roster file. */
function saveLookPlugin(): Plugin {
  return {
    name: 'save-look',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/save-look', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const { team, name, appearance } = JSON.parse(body);
            const file = 'src/data/rosters.json';
            const doc = JSON.parse(readFileSync(file, 'utf8'));
            const p = doc.teams?.[team]?.find((x: any) => x.name === name);
            if (!p) { res.statusCode = 404; res.end('player not found'); return; }
            p.appearance = appearance;
            writeFileSync(file, JSON.stringify(doc, null, 1));
            res.end('ok');
          } catch (e) { res.statusCode = 400; res.end(String(e)); }
        });
      });
    },
  };
}

/** Dev-only endpoint: the pixel editor's "Save to repo" writes src/art/celebs/celeb_NN.png. */
function saveArtPlugin(): Plugin {
  return {
    name: 'save-art',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/save-art', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const { name, png } = JSON.parse(body);
            if (!/^celeb_\d{2}$/.test(name) || typeof png !== 'string' || !png.startsWith('data:image/png;base64,')) throw new Error('bad request');
            mkdirSync('src/art/celebs', { recursive: true });
            writeFileSync(`src/art/celebs/${name}.png`, Buffer.from(png.slice('data:image/png;base64,'.length), 'base64'));
            res.end('ok');
          } catch (e) { res.statusCode = 400; res.end(String(e)); }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  server: { port: 5173, watch: { ignored: ['**/src/data/rosters.json', '**/src/art/**'] } },
  plugins: [saveLookPlugin(), saveArtPlugin()],
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
