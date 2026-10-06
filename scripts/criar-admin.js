#!/usr/bin/env node
'use strict';
/*
 * Cria um administrador ou redefine a senha de um usuário existente (vira admin).
 *
 *   npm run criar-admin -- email@myblue.com.br "Nome da Pessoa"
 * A senha temporária é mostrada na tela e precisa ser trocada no primeiro acesso.
 * Usa o mesmo banco do portal (DATABASE_URL, ou o banco embutido em DATA_DIR).
 */
const { lerConfig } = require('../server/index');
const { abrir } = require('../server/db');
const { hashSenha, senhaAleatoria } = require('../server/seguranca');

(async () => {
  const [emailBruto, ...nomePartes] = process.argv.slice(2);
  const email = String(emailBruto || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Uso: npm run criar-admin -- email@empresa.com.br "Nome"');
    process.exit(1);
  }
  const nome = nomePartes.join(' ') || 'Administrador';
  const db = await abrir(lerConfig({ silencioso: true }));
  const senha = senhaAleatoria();
  const existe = await db.um('SELECT id FROM usuarios WHERE email = $1', [email]);
  if (existe) {
    await db.q("UPDATE usuarios SET senha_hash = $1, papel = 'admin', ativo = TRUE, trocar_senha = TRUE, atualizado_em = now() WHERE id = $2", [hashSenha(senha), existe.id]);
    await db.q('DELETE FROM sessoes WHERE usuario_id = $1', [existe.id]);
    console.log(`Senha redefinida e perfil de administrador garantido para ${email}.`);
  } else {
    await db.q("INSERT INTO usuarios (nome, email, senha_hash, papel, trocar_senha) VALUES ($1, $2, $3, 'admin', TRUE)", [nome, email, hashSenha(senha)]);
    console.log(`Administrador criado: ${email}`);
  }
  await db.q("INSERT INTO auditoria (acao, detalhe) VALUES ('admin_via_linha_de_comando', $1::jsonb)", [JSON.stringify({ email })]);
  console.log(`Senha temporária: ${senha}  (será pedida a troca no primeiro login)`);
  await db.fechar();
})().catch((e) => { console.error(e.message); process.exit(1); });
