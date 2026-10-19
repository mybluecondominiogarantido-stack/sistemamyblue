#!/usr/bin/env node
'use strict';
/*
 * Restaura um backup baixado em Administração → Módulos e dados → Backup do banco.
 *
 *   npm run restaurar-backup -- myblue-backup-2026-10-19.jsonl.gz
 *
 * Usa o mesmo banco do portal (DATABASE_URL, ou o banco embutido em DATA_DIR) e APAGA o que houver nele.
 * Se o banco já tiver usuários, só roda com --apagar-o-que-existe.
 * Teste de restauração: aponte DATABASE_URL para um banco vazio (outro projeto Supabase ou um Postgres local), restaure,
 * suba o portal com esse DATABASE_URL e confira.
 *
 * Os hashes de senha não vão para o backup: depois de restaurar, as senhas de todos ficam bloqueadas e cada administrador
 * ativo recebe uma senha temporária (mostrada aqui). Ele entra e redefine a senha das demais pessoas em Usuários e acessos.
 */
const fs = require('fs');
const crypto = require('crypto');
const { lerConfig } = require('../server/index');
const { abrir } = require('../server/db');
const { restaurar } = require('../server/backup');
const { hashSenha, senhaAleatoria } = require('../server/seguranca');

(async () => {
  const args = process.argv.slice(2);
  const arquivo = args.find((a) => !a.startsWith('--'));
  if (!arquivo || !fs.existsSync(arquivo)) {
    console.error('Uso: npm run restaurar-backup -- arquivo.jsonl.gz [--apagar-o-que-existe]');
    process.exit(1);
  }
  const db = await abrir(lerConfig({ silencioso: true }));
  const { n } = await db.um('SELECT COUNT(*)::int AS n FROM usuarios');
  if (n > 0 && !args.includes('--apagar-o-que-existe')) {
    console.error(`Este banco já tem ${n} usuário(s). A restauração apaga tudo o que há nele.`);
    console.error('Confira o DATABASE_URL e, se for isso mesmo, rode de novo com --apagar-o-que-existe.');
    await db.fechar();
    process.exit(1);
  }
  console.log(`Restaurando ${arquivo} em ${db.tipo === 'postgres' ? 'Postgres (DATABASE_URL)' : 'banco embutido'}…`);
  const r = await restaurar(db, fs.createReadStream(arquivo), { senhaBloqueada: () => 'bloqueada$' + crypto.randomBytes(9).toString('hex') });
  console.log(`Backup de ${r.cabecalho.gerado_em} (versão ${r.cabecalho.versao_backup}).`);
  for (const [t, q] of Object.entries(r.linhas)) console.log(`  ${t.padEnd(22)} ${q}`);
  if (r.ignoradas.length) console.log('Não existem mais neste portal (ignoradas):', r.ignoradas.join(', '));

  const admins = (await db.q("SELECT id, email FROM usuarios WHERE papel = 'admin' AND ativo ORDER BY id")).rows;
  console.log('\nSenhas temporárias da administração (as demais pessoas recebem senha nova pelo portal):');
  for (const a of admins) {
    const senha = senhaAleatoria();
    await db.q('UPDATE usuarios SET senha_hash = $1, trocar_senha = TRUE WHERE id = $2', [hashSenha(senha), a.id]);
    console.log(`  ${a.email}  →  ${senha}`);
  }
  await db.q("INSERT INTO auditoria (acao, detalhe) VALUES ('backup_restaurado', $1::jsonb)", [JSON.stringify({ arquivo: require('path').basename(arquivo), gerado_em: r.cabecalho.gerado_em })]);
  await db.fechar();
})().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
