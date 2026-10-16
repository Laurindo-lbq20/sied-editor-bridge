#!/usr/bin/env node
// Põe a bridge no motor compilado. Corre depois do build do motor e do
// vercel-postbuild, de dentro da pasta do motor (para achar o esbuild dele):
//
//   node ../editor-v3-bridge/depois-do-build.mjs dist
//
// Junta os módulos de bridge/ num só ficheiro compacto (dist/bridge/index.js),
// copia os ícones e acrescenta o <script> a dist/editor.html. O código legível
// é o desta pasta; o compacto é só a forma em que se serve. A política de
// segurança da página já aceita scripts do próprio endereço ('self'), por isso
// não é preciso mexer nela.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bridge');
const DIST = path.resolve(process.argv[2] ?? 'dist');
const PAGINA = path.join(DIST, 'editor.html');
const AVISO = '/*! Editor bridge. SPDX-License-Identifier: AGPL-3.0-only. Code offered as the editor About pane says. */';

if (!fs.existsSync(PAGINA)) {
  console.error(`[bridge] ${PAGINA} não existe. Corra o build do motor primeiro.`);
  process.exit(1);
}

// O esbuild vem com as dependências do motor: procura-se a partir da pasta onde se corre.
let esbuild;
try {
  esbuild = createRequire(path.join(process.cwd(), 'package.json'))('esbuild');
} catch {
  console.error('[bridge] esbuild não encontrado: corra este passo de dentro da pasta do motor (com as dependências instaladas).');
  process.exit(1);
}

fs.rmSync(path.join(DIST, 'bridge'), { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'bridge'), { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(PASTA, 'index.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  legalComments: 'none',
  banner: { js: AVISO },
  outfile: path.join(DIST, 'bridge', 'index.js'),
});
fs.cpSync(path.join(PASTA, 'icones'), path.join(DIST, 'bridge', 'icones'), { recursive: true });

// A versão no endereço faz o navegador buscar a bridge nova em vez de usar a que guardou
// (o ficheiro fica em cache durante horas, e a aplicação anfitriã tem de falar com a mesma versão).
const versao = crypto.createHash('sha1').update(fs.readFileSync(path.join(DIST, 'bridge', 'index.js'))).digest('hex').slice(0, 10);
const etiqueta = `<script type="module" src="/bridge/index.js?v=${versao}"></script>`;
let html = fs.readFileSync(PAGINA, 'utf8');
if (!html.includes('</head>')) {
  console.error('[bridge] editor.html sem </head>: a bridge não entrou.');
  process.exit(1);
}
// Tira a etiqueta de uma publicação anterior, se lá estiver.
html = html.replace(/<script type="module" src="\/bridge\/index\.js[^"]*"><\/script>\n?/g, '');
fs.writeFileSync(PAGINA, html.replace('</head>', `${etiqueta}\n</head>`));
console.log(`[bridge] posta em editor.html (compacta, versão ${versao}).`);
