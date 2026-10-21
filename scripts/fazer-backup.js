#!/usr/bin/env node
'use strict';
/*
 * Gera o mesmo backup de Administração → Módulos e dados → Backup do banco, direto num arquivo (para rodar agendado).
 *
 *   npm run fazer-backup -- ./backups            (guarda os 14 mais recentes)
 *   npm run fazer-backup -- ./backups --manter 30
 *
 * Usa o mesmo banco do portal (DATABASE_URL, ou o banco embutido em DATA_DIR). O arquivo tem dados de negócio e
 * pessoais (sem os hashes de senha): a pasta precisa ter acesso restrito. Restaurar: npm run restaurar-backup.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { lerConfig } = require('../server/index');
const { abrir } = require('../server/db');
const { gerarBackup } = require('../server/backup');

const NOME = /^myblue-backup-\d{4}-\d{2}-\d{2}(-\d{6})?\.jsonl\.gz$/;

(async () => {
  const args = process.argv.slice(2);
  const pasta = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--manter');
  const im = args.indexOf('--manter');
  const manter = im >= 0 ? Number(args[im + 1]) : 14;
  if (!pasta || !Number.isInteger(manter) || manter < 1) {
    console.error('Uso: npm run fazer-backup -- pasta [--manter 14]');
    process.exit(1);
  }
  fs.mkdirSync(pasta, { recursive: true });
  const agora = new Date().toISOString();
  const arquivo = path.join(pasta, `myblue-backup-${agora.slice(0, 10)}-${agora.slice(11, 19).replace(/:/g, '')}.jsonl.gz`);
  const parcial = arquivo + '.parcial';

  const db = await abrir(lerConfig({ silencioso: true }));
  try {
    const gz = zlib.createGzip();
    const gravar = pipeline(gz, fs.createWriteStream(parcial, { mode: 0o600 }));
    const linhas = await gerarBackup(db, gz);
    gz.end();
    await gravar;
    fs.renameSync(parcial, arquivo);
    const total = Object.values(linhas).reduce((s, n) => s + n, 0);
    console.log(`Backup gravado: ${arquivo} (${total} linhas, ${(fs.statSync(arquivo).size / 1048576).toFixed(1)} MB).`);
  } catch (e) {
    fs.rmSync(parcial, { force: true });
    console.error('[backup] falhou:', e.message);
    process.exitCode = 1;
    return;
  } finally {
    await db.fechar();
  }

  // só apaga os antigos depois que o novo saiu inteiro
  const antigos = fs.readdirSync(pasta).filter((f) => NOME.test(f)).sort().reverse().slice(manter);
  for (const f of antigos) fs.rmSync(path.join(pasta, f));
  if (antigos.length) console.log(`Apagados ${antigos.length} backup(s) antigo(s); ficam os ${manter} mais recentes.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
