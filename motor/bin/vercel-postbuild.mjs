#!/usr/bin/env node
// Ajusta o build (dist/) para a Vercel. Corre depois de `pnpm build`.
//
// Problema: o projeto guarda o conversor como x2t.wasm.br (bytes brotli) e
// depende do cabeçalho `Content-Encoding: br` para o navegador o descomprimir.
// A Vercel não respeita bem ficheiros pré-comprimidos (volta a comprimir na
// edge, o que gera `br, br` e quebra o carregamento).
//
// Solução: descomprimir para x2t.wasm (WASM normal). O vercel.json reescreve
// o URL antigo (.wasm.br) para este ficheiro, e a própria Vercel comprime-o em
// brotli na edge, porque application/wasm está na lista de tipos comprimidos.
// O carregador do editor não depende da codificação: recebe bytes WASM e
// pronto.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DIST = path.resolve(process.argv[2] ?? 'dist');
const WASM_DIR = path.join(DIST, 'sdkjs/common/wasm/x2t');
const BR = path.join(WASM_DIR, 'x2t.wasm.br');
const RAW = path.join(WASM_DIR, 'x2t.wasm');

if (!fs.existsSync(DIST)) {
  console.error(`[vercel-postbuild] pasta ${DIST} não existe. Corra "pnpm build" primeiro.`);
  process.exit(1);
}

// 1. Descomprimir o conversor.
if (fs.existsSync(BR)) {
  const compressed = fs.readFileSync(BR);
  const raw = zlib.brotliDecompressSync(compressed);
  // Um módulo WASM começa sempre por "\0asm".
  if (raw.readUInt32BE(0) !== 0x0061736d) {
    console.error('[vercel-postbuild] x2t.wasm.br não contém um módulo WASM válido.');
    process.exit(1);
  }
  fs.writeFileSync(RAW, raw);
  fs.rmSync(BR);
  console.log(
    `[vercel-postbuild] x2t.wasm.br (${(compressed.length / 1e6).toFixed(1)} MB) -> x2t.wasm (${(raw.length / 1e6).toFixed(1)} MB)`,
  );
} else if (fs.existsSync(RAW)) {
  console.log('[vercel-postbuild] x2t.wasm já está descomprimido.');
} else {
  console.error(`[vercel-postbuild] conversor não encontrado em ${WASM_DIR}`);
  process.exit(1);
}

// 2. Remover ficheiros de configuração da Cloudflare (a Vercel usa vercel.json).
for (const f of ['_headers', '_redirects']) {
  const p = path.join(DIST, f);
  if (fs.existsSync(p)) fs.rmSync(p);
}

console.log('[vercel-postbuild] pronto.');
