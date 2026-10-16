// O motor em desenvolvimento, com a bridge.
//
// Usa a configuração do próprio motor (editor-v3/vite.config.ts) tal como
// está e só acrescenta: servir a pasta bridge/ em /bridge/ e pôr o <script>
// na página do editor. Corre-se de dentro de editor-v3:
//
//   npx pnpm@11.4.0 exec vite --host --port 5180 --configLoader native --config ../editor-v3-bridge/vite.config.ts
//
// `--configLoader native`: o Node carrega as duas configurações como estão.
// O empacotador do Vite, a partir desta pasta, parte as dependências do motor.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import configDoMotor from '../editor-v3/vite.config.ts';

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bridge');
const ETIQUETA = '<script type="module" src="/bridge/index.js"></script>';

function bridgeDoSied(): Plugin {
  return {
    name: 'sied-bridge',
    configureServer(server) {
      server.middlewares.use('/bridge', (req, res, seguinte) => {
        // Só o que está dentro de bridge/ (módulos e ícones), sem subir de pasta.
        const relativo = path.normalize(decodeURIComponent((req.url ?? '').split('?')[0])).replace(/^([/\\])+/, '');
        const ficheiro = path.join(PASTA, relativo);
        const tipo = { '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(ficheiro)];
        if (!tipo || !ficheiro.startsWith(PASTA) || !fs.existsSync(ficheiro)) return seguinte();
        res.setHeader('Content-Type', tipo);
        res.setHeader('Cache-Control', 'no-cache');
        res.end(fs.readFileSync(ficheiro));
      });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.filename.endsWith('editor.html')) return html;
        return html.replace('</head>', `  ${ETIQUETA}\n  </head>`);
      },
    },
  };
}

export default async (env: ConfigEnv): Promise<UserConfig> => {
  const base = typeof configDoMotor === 'function' ? await configDoMotor(env) : await configDoMotor;
  return { ...base, plugins: [...(base.plugins ?? []), bridgeDoSied()] };
};
