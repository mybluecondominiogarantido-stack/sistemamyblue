#!/usr/bin/env node
'use strict';
/*
 * Publica os HTMLs das centrais de ferramentas a partir de uma pasta.
 * Cada arquivo é reconhecido pelo <title> e vira a versão em uso do módulo.
 *
 *   npm run importar-html -- ./modulos-originais
 *   npm run importar-html -- ./arquivo.html --modulo=credito   (força o módulo)
 * Usa o mesmo banco do portal (DATABASE_URL, ou o banco embutido em DATA_DIR).
 */
const fs = require('fs');
const path = require('path');
const { lerConfig } = require('../server/index');
const { abrir } = require('../server/db');
const { criarServicoModulos } = require('../server/modulos');

(async () => {
  const args = process.argv.slice(2);
  const alvo = args.find((a) => !a.startsWith('--'));
  const forcado = (args.find((a) => a.startsWith('--modulo=')) || '').split('=')[1];
  if (!alvo) {
    console.error('Uso: npm run importar-html -- <pasta-ou-arquivo> [--modulo=slug]');
    process.exit(1);
  }
  const cfg = lerConfig({ silencioso: true });
  const db = await abrir(cfg);
  const modulos = criarServicoModulos(db, cfg);

  const arquivos = fs.statSync(alvo).isDirectory()
    ? fs.readdirSync(alvo).filter((f) => /\.html?$/i.test(f)).map((f) => path.join(alvo, f))
    : [alvo];

  let publicados = 0;
  for (const arq of arquivos) {
    const buf = fs.readFileSync(arq);
    const problema = modulos.validarHtml(buf);
    if (problema) { console.log(`✗ ${path.basename(arq)}: ${problema}`); continue; }
    const slug = forcado || (await modulos.reconhecer(buf));
    if (!slug || !(await modulos.obter(slug))) { console.log(`? ${path.basename(arq)}: não reconheci o módulo (use --modulo=slug)`); continue; }
    await modulos.salvarVersao(slug, buf, path.basename(arq), null);
    await db.q("INSERT INTO auditoria (acao, modulo_slug, detalhe) VALUES ('arquivo_enviado', $1, $2::jsonb)",
      [slug, JSON.stringify({ nome: path.basename(arq), bytes: buf.length, via: 'linha de comando' })]);
    console.log(`✓ ${path.basename(arq)} → ${slug}`);
    publicados++;
  }
  console.log(`\n${publicados} arquivo(s) publicado(s).`);
  await db.fechar();
})().catch((e) => { console.error(e.message); process.exit(1); });
