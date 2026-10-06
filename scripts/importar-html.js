#!/usr/bin/env node
'use strict';
/*
 * Publica os HTMLs das centrais de ferramentas a partir de uma pasta.
 * Cada arquivo é reconhecido pelo <title> e vira a versão em uso do módulo.
 *
 *   npm run importar-html -- ./modulos-originais
 *   npm run importar-html -- ./arquivo.html --modulo=credito   (força o módulo)
 */
const fs = require('fs');
const path = require('path');
const { lerConfig } = require('../server/index');
const { abrir } = require('../server/db');
const { criarServicoModulos } = require('../server/modulos');

const args = process.argv.slice(2);
const alvo = args.find((a) => !a.startsWith('--'));
const forcado = (args.find((a) => a.startsWith('--modulo=')) || '').split('=')[1];
if (!alvo) {
  console.error('Uso: npm run importar-html -- <pasta-ou-arquivo> [--modulo=slug]');
  process.exit(1);
}

const cfg = lerConfig({ silencioso: true });
const db = abrir(cfg.dataDir);
const modulos = criarServicoModulos(db, cfg);

const st = fs.statSync(alvo);
const arquivos = st.isDirectory()
  ? fs.readdirSync(alvo).filter((f) => /\.html?$/i.test(f)).map((f) => path.join(alvo, f))
  : [alvo];

let publicados = 0;
for (const arq of arquivos) {
  const buf = fs.readFileSync(arq);
  const problema = modulos.validarHtml(buf);
  if (problema) { console.log(`✗ ${path.basename(arq)}: ${problema}`); continue; }
  const slug = forcado || modulos.reconhecer(buf);
  if (!slug || !modulos.obter(slug)) { console.log(`? ${path.basename(arq)}: não reconheci o módulo (use --modulo=slug)`); continue; }
  modulos.salvarVersao(slug, buf, path.basename(arq), null);
  db.prepare("INSERT INTO auditoria (acao, modulo_slug, detalhe) VALUES ('arquivo_enviado', ?, ?)").run(slug, JSON.stringify({ nome: path.basename(arq), bytes: buf.length, via: 'linha de comando' }));
  console.log(`✓ ${path.basename(arq)} → ${slug}`);
  publicados++;
}
console.log(`\n${publicados} arquivo(s) publicado(s).`);
db.close();
